/* api.mjs — toda la lógica del servidor, separada del transporte HTTP.
 *
 * Dos clientes, dos mundos:
 *
 *   EL APARATO   POST /api/d/sync, firmado con su token. Cuenta quién es,
 *                cómo está y qué midió; recibe todo lo que necesita saber.
 *                Contrato: root-kit/docs/nube.md y docs/api.md.
 *
 *   LA APP       /api/*, con la sesión de una CUENTA (email y contraseña).
 *                Cada cuenta ve sólo sus plantas. Vincula su Rooti (y la app
 *                ya sabe cuál es: lo dice la figura), abre el cofre (que
 *                sortea la piel), bautiza, reconoce la especie, charla con la
 *                planta y la cuida como mascota.
 *
 *   LA ADMINISTRACIÓN  /api/admin/*, con la clave ROOTLAB_ADMIN_CLAVE: la
 *                estación de fábrica registra aparatos, quien publica sube
 *                firmware firmado, y se leen métricas y estado. Sin la clave
 *                configurada esas rutas no existen.
 *
 * `manejar()` recibe un pedido ya parseado y devuelve [código, cuerpo]. Así
 * los tests recorren el flujo completo —de la primera consulta del aparato
 * a la notificación de sed— sin abrir un socket. Una ruta puede agregar un
 * tercer valor, `{ firma }`: lo que de esa respuesta se considera "lo mismo"
 * aunque los bytes cambien (server/http.mjs lo convierte en la etiqueta del
 * `304`).
 *
 * Dónde está cada cosa:
 *
 *   db.mjs           los datos (emails, nombres y chat, cifrados)
 *   claves.mjs       contraseñas con Argon2id y pimienta
 *   correo.mjs       emails (recuperar la contraseña, verificar el email)
 *   presupuesto.mjs  tope de gasto y cuotas de la IA
 *   ficha.mjs        la ficha de cuidados y el prompt del chat
 *   clima.mjs        el pronóstico (Open-Meteo) y el riego que se anticipa
 *
 * EL CUIDADOR
 *
 * Quien se va de viaje crea un enlace /sitter/<token> que vale 3, 7 o 15
 * días. Con él, sin cuenta, se ve la cara de la planta, qué necesita y cómo
 * se cuida, y se puede anotar "ya regué": queda como riego de la planta y le
 * llega un push al dueño. El token se guarda hasheado, como las sesiones.
 */
import { randomBytes } from 'node:crypto';
import {
  ESPECIES, MODELOS, RAREZAS, FRASES, ANIMOS, especiePorId, modeloPorId, idPiel, validarEspecie,
} from './catalogo.mjs';
import {
  normalizarCodigo, ssidDe, codigoLegible, hash, tokenNuevo, igualesSeguro,
} from './codigo.mjs';
import {
  PROBABILIDADES, probabilidadDe, sortearRareza, normalizarPersona, personaDeAparato,
} from './cofre.mjs';
import {
  mascotaNueva, normalizar as normalizarMascota, aplicar as aplicarGesto, publico as mascotaPublica,
  acumularOptimo, saludBiologica, ACCIONES, GOTAS,
} from '../public/lib/mascota.mjs';
import {
  aguaParaRegar, normalizarCalibracion, errorDeCalibracion, normalizarMaceta, CALIBRANDO_MS,
} from '../public/lib/riego.mjs';
import {
  elegirFirmware, firmaValida, sha256Hex, versionValida, CANALES, RE_PLACA, FIRMWARE_MAX_BYTES,
} from './firmware.mjs';
import { detectarCaidaMasiva, VIGIA } from './vigia.mjs';
import { avisosPendientes } from './avisos.mjs';
import {
  crearClima, tasaSecado, mediaReciente, factorClima, prevision as previsionDe, resumenPronostico,
  avisoPrevision, CLIMA_TTL_MS, VENTANA_TASA_MS,
} from './clima.mjs';
import { crearCripto } from './cripto.mjs';
import { crearClaves } from './claves.mjs';
import { crearCorreo } from './correo.mjs';
import { crearPresupuesto } from './presupuesto.mjs';
import { endpointPushValido } from './push.mjs';
import { MAX_TOKENS, validarFoto } from './ia.mjs';
import { fichaDePlanta, promptDePlanta, contextoVivo } from './ficha.mjs';
import { normalizarEmail } from './db.mjs';
import { diaLocal, TZ_POR_DEFECTO } from './tiempo.mjs';
import * as plantillas from './plantillas-correo.mjs';
import { PALETA_POR_DEFECTO, paletaPorId, paletaDeRooti, cumpleRequisito } from '../public/lib/paletas.mjs';
import { firmaTablero } from '../public/lib/model.mjs';

export { diaLocal, normalizarEmail };

const MIN = 60 * 1000;
const H = 60 * MIN;
const DIA = 24 * H;

export const INTERVALO_S = 900;
export const EN_LINEA_MS = 90 * 1000;
export const VIVO_MS = 45 * MIN;
export const TIBIO_MS = 6 * H;
/* Una sesión que no se usa en seis meses se cierra sola. */
export const SESION_VENCE_MS = 180 * DIA;
export const CLAVE_MIN = 8;
export const RESTABLECER_VENCE_MS = 30 * MIN;
export const VERIFICAR_VENCE_MS = 48 * H;
export const CHAT_MAX = 500;
export const CUIDADOR_DIAS = [3, 7, 15];
/* El álbum: hasta 60 fotos por planta, de hasta 450 KB (la app las achica a
   1024 px antes de mandarlas). */
export const FOTOS_MAX = 60;
export const FOTO_BYTES_MAX = 450 * 1024;
const MIMES_FOTO = ['image/jpeg', 'image/png', 'image/webp'];
/* Un riego anotado a mano cuenta como reciente durante este tiempo. */
export const RIEGO_RECIENTE_MS = 48 * H;
/* Un emulador que nadie vinculó ni usó en este tiempo se borra solo. */
export const EMULADOR_OCIOSO_MS = 30 * DIA;
/* Cuánto puede hablar un aparato. Sano habla cada 15 minutos, o cada 5
   segundos mientras la app calibra (10 minutos como mucho): 120 en cinco
   minutos es el doble de lo más rápido que puede ir con razón. */
export const SYNC_MAX = 120;
export const SYNC_VENTANA_MS = 5 * MIN;
/* Y cuántas veces puede fallar el token desde una IP: adivinarlo es imposible
   (256 bits), pero cada intento cuesta un hash y una consulta. */
export const SYNC_MAL_MAX = 60;
/* Lo que la app puede contar (POST /api/evento): pasos del alta y pantallas.
   Son contadores anónimos por día: ni cuenta ni planta. */
export const EVENTOS_ALTA = ['hola', 'instalar', 'cuenta', 'avisos', 'wifi', 'vincular', 'cofre', 'nombre', 'foto', 'listo'];
export const EVENTOS_VISTA = ['pasaporte', 'album', 'gif', 'desk', 'invernadero', 'coleccion', 'botanica', 'chat', 'diagnostico', 'calibrar', 'sitter'];
const ESTADOS_OTA = ['bajando', 'verificando', 'ok', 'fallo'];

/* EL VIVERO (docs/trastienda.md)
 *
 * Las áreas por las que se mira el proyecto. Cada agente que da vueltas mira
 * una y propone ideas ahí; el área es lo que hace que la lista se pueda leer
 * cuando tenga cien. */
export const AREAS = ['infraestructura', 'experiencia', 'firmware', 'producto', 'seguridad'];
export const IMPACTOS = ['alto', 'medio', 'bajo'];
export const ESFUERZOS = ['bajo', 'medio', 'alto'];
export const ESTADOS_IDEA = ['nueva', 'en_curso', 'plantada', 'descartada'];

/**
 * La huella de una idea: con qué se decide que dos ideas son la misma.
 *
 * Un agente que mira el proyecto para siempre va a volver a encontrar lo
 * mismo, dicho de otra manera. Sin esto, la lista se llena de repetidas y
 * deja de servir.
 *
 * Se normaliza el título —sin acentos, sin signos, sin palabras de relleno—
 * y se ordenan las palabras, así "mover los respaldos fuera del VPS" y
 * "fuera del VPS, mover los respaldos" son la misma idea. El precio de
 * ordenarlas es que dos títulos con las mismas palabras en otro orden caen
 * juntos; se paga barato porque lo que trae la segunda —su título, su
 * detalle y su evidencia— se le suma a la primera en vez de perderse
 * (`ideaProponer` en db.mjs), y en la lista se ve "propuesta N veces".
 */
export function huellaDeIdea(area, titulo) {
  const palabras = String(titulo || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !['los', 'las', 'del', 'para', 'con', 'que', 'una', 'uno', 'por', 'sin'].includes(w));
  return `${area}:${palabras.sort().join('-')}`.slice(0, 160);
}

/* Cuándo un aparato cuenta como activo y cuándo como callado, en la flota. */
const FLOTA_ACTIVO_MS = 7 * DIA;
const FLOTA_CALLADO_MS = 3 * DIA;
/* Una sesión de la trastienda: se entra una vez por jornada de trabajo. */
export const ADMIN_SESION_MS = 12 * H;
/* El código que llega por email es corto, así que vive poco y aguanta poco. */
export const ADMIN_CODIGO_MS = 10 * MIN;
export const ADMIN_CODIGO_INTENTOS = 5;
/* Códigos equivocados que aguanta un email de administración en un día. */
export const ADMIN_FALLOS_DIA = 20;
/* Lo que puede un token de agente, por MÉTODO y ruta. Un agente que da
   vueltas solo lee cómo anda el producto y propone ideas; no toca cuentas,
   ni aparatos, ni firmware, ni otros agentes (docs/trastienda.md).

   El método importa tanto como la ruta: /api/admin/aparatos por GET lista,
   pero por POST registra un aparato de fábrica y por PATCH lo deshabilita.
   Un permiso que mirara sólo la ruta le daría todo eso a quien sólo tenía
   que leer. */
export const ALCANCES = ['vivero', 'jardinero'];
/* Lo que LEE de producción: el estado, la flota, las lecturas y las
   métricas. Son recuentos y ritmos; ninguna trae datos de personas (la flota
   pasa por aparatoAdmin, que deja al dueño afuera: ni email, ni nombre, ni
   planta). `test/trastienda-cuentas.test.mjs` lo comprueba. */
const AGENTE_LEE = ['GET', /^\/api\/admin\/(estado|flota|lecturas|metricas)$/];
const AGENTE_VIVERO = [
  AGENTE_LEE,
  ['GET', /^\/api\/admin\/ideas$/],
  ['POST', /^\/api\/admin\/ideas$/],
  ['PATCH', /^\/api\/admin\/ideas\/\d{1,9}$/],
];
export const PERMISOS_AGENTE = {
  vivero: AGENTE_VIVERO,
  /* El jardinero además manda su informe por correo cuando termina la vuelta. */
  jardinero: [...AGENTE_VIVERO, ['POST', /^\/api\/admin\/informe$/]],
};
const agentePuede = (alcance, metodo, ruta) =>
  (PERMISOS_AGENTE[alcance] || AGENTE_VIVERO).some(([m, re]) => m === metodo && re.test(ruta));

class ErrorApi extends Error {
  constructor(codigo, mensaje, extra = null) {
    super(mensaje);
    this.codigo = codigo;
    /* Lo que el cliente necesita para portarse bien: hoy, cuántos segundos
       esperar antes de volver a intentar. */
    if (extra) Object.assign(this, extra);
  }
}
const falla = (codigo, mensaje, extra) => { throw new ErrorApi(codigo, mensaje, extra); };

const entero = (v, def = 0) => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : def);
const texto = (v, max) => String(v ?? '').trim().slice(0, max);
const nuevoId = (prefijo) => `${prefijo}${randomBytes(6).toString('hex')}`;

export const emailValido = (e) => e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);

const diasEntre = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

/** Curva de la celda: misma que public/lib/model.mjs y nodo/power.c. */
const CURVA = [[4200, 100], [4100, 92], [4000, 85], [3900, 76], [3800, 66], [3700, 55],
  [3600, 43], [3500, 30], [3400, 18], [3300, 9], [3200, 3], [3000, 0]];
export function bateriaPct(mv) {
  if (!Number.isFinite(mv) || mv <= 0) return null;
  if (mv >= 4200) return 100;
  for (let i = 1; i < CURVA.length; i++) {
    const [hi, ph] = CURVA[i - 1];
    const [lo, pl] = CURVA[i];
    if (mv >= lo) return Math.round(pl + ((mv - lo) * (ph - pl)) / (hi - lo));
  }
  return 0;
}

export function crearApi({
  db,
  ia,
  push = null,
  correo = crearCorreo({ transporte: 'memoria', registro: {} }),
  claves = crearClaves(crearCripto(randomBytes(32))),
  reloj = () => Date.now(),
  presupuesto = crearPresupuesto({ db, reloj }),
  azar,
  /* Confianza al primer uso: true (desarrollo: cualquier aparato se registra
     solo), 'emulador' (producción: sólo los emuladores; las placas de verdad
     las registra la fábrica) o false (nadie). */
  tofu = true,
  urlPublica = () => '',
  version = '0.1.0',
  clima = crearClima(),
  /* La clave de /api/admin/*. Vacía: esas rutas no existen. */
  adminClave = '',
  /* Los emails que SIEMPRE pueden entrar a la trastienda (ROOTLAB_ADMINS).
     Es el arranque y la red de seguridad: desde el panel se le da y se le
     saca el rol a cualquiera, menos a estos, así que no hay forma de dejar el
     panel sin nadie que pueda entrar. */
  adminsDeArranque = [],
  /* La pública con la que se verifica cada firmware que se publica (PEM). */
  firmwarePublica = '',
  /* Mostrar las funciones de IA aunque sea simulada (desarrollo y tests). En
     producción, sin una IA de verdad, se esconden: una planta que contesta
     frases de prueba es peor que una que todavía no habla. */
  iaDemo = true,
  /* A quien opera el servicio: ({ tipo, ... }) => void. */
  alAlerta = null,
} = {}) {
  const limites = new Map();
  const iaVisible = () => ia?.proveedor === 'claude' || Boolean(iaDemo);

  /* Lo publicado cambia poco y se consulta en cada sync: medio minuto de caché. */
  let cacheFirmware = null;
  function firmwarePublicado() {
    const t = reloj();
    if (!cacheFirmware || t - cacheFirmware.t > 30000 || t < cacheFirmware.t) cacheFirmware = { t, lista: db.firmwareLista() };
    return cacheFirmware.lista;
  }
  const contar = (evento) => { try { db.eventoContar(new Date(reloj()).toISOString().slice(0, 10), evento); } catch { /* una métrica nunca rompe un pedido */ } };

  /* ----------------------------------------------------------- ayudas --- */
  function limitar(clave, max, ventanaMs) {
    const t = reloj();
    const l = limites.get(clave);
    if (!l || t - l.desde > ventanaMs) {
      limites.set(clave, { desde: t, n: 1 });
      if (limites.size > 10000) {
        for (const [k, v] of limites) if (t - v.desde > ventanaMs) limites.delete(k);
      }
      return;
    }
    l.n += 1;
    if (l.n > max) {
      const faltan = Math.max(1, Math.ceil((ventanaMs - (t - l.desde)) / 1000));
      falla(429, 'Demasiados intentos. Esperá unos minutos.', { reintentar_en: faltan });
    }
  }

  const bearer = (headers) => {
    const a = headers?.authorization || headers?.Authorization || '';
    return a.startsWith('Bearer ') ? a.slice(7).trim() : '';
  };

  /* La administración: una clave larga en el entorno del servidor. Sin ella,
     las rutas no existen (404, igual que cualquier ruta inventada).

     Para la trastienda en el navegador hay además sesiones: se entra una vez
     con la clave y queda un token que vence a las doce horas. Así la clave
     maestra no vive en el almacenamiento de un navegador, y cerrar el
     servidor cierra todas las sesiones. */
  const sesionesAdmin = new Map();   /* hash del token -> { vence, email } */
  const fallosCodigo = new Map();    /* email -> { desde, n }: códigos equivocados en el día */

  const ARRANQUE = new Set(adminsDeArranque.map((e) => normalizarEmail(String(e || ''))).filter(Boolean));
  /** Si ese email puede entrar a la trastienda. */
  function esAdmin(email) {
    const e = normalizarEmail(String(email || ''));
    if (!e) return false;
    if (ARRANQUE.has(e)) return true;
    return db.cuentaPorEmail(e)?.rol === 'admin';
  }
  /** El rol que hay que mostrar: el de arranque no se puede sacar. */
  const rolDe = (c) => (ARRANQUE.has(normalizarEmail(c.email)) ? 'admin' : c.rol || 'persona');

  function sesionAdminValida(token) {
    const h = hash(token);
    const s = sesionesAdmin.get(h);
    if (!s) return null;
    if (reloj() > s.vence) { sesionesAdmin.delete(h); return null; }
    return s;
  }

  /**
   * Quién está pidiendo algo de administración. Tres formas, de más a menos
   * poder: la clave del servidor (las herramientas y la fábrica), una sesión
   * de la trastienda (una persona con su código), o un token de agente, que
   * sólo alcanza para lo que dice PERMISOS_AGENTE (método y ruta).
   */
  function exigirAdmin(headers, ip, ruta = '', metodo = 'GET') {
    if (!adminClave) falla(404, 'Ruta desconocida');
    limitar(`admin:${ip}`, 240, MIN);
    const token = bearer(headers);
    if (token) {
      if (igualesSeguro(hash(token), hash(adminClave))) return { quien: 'clave' };
      const sesion = sesionAdminValida(token);
      /* El rol se mira en CADA pedido, no sólo al entrar: a quien se le saca
         el rol (o se le borra la cuenta) se le corta la sesión en el acto, no
         doce horas después. La de la clave del servidor no tiene email. */
      if (sesion && sesion.email && !esAdmin(sesion.email)) {
        sesionesAdmin.delete(hash(token));
        falla(401, 'Ya no tenés acceso a la trastienda.');
      }
      if (sesion) return { quien: 'sesion', email: sesion.email };
      const agente = db.agentePorToken(hash(token));
      if (agente) {
        if (!agentePuede(agente.alcance, metodo, ruta)) {
          falla(403, `Ese token (${agente.alcance}) no alcanza para ${metodo} ${ruta}.`);
        }
        db.agenteUsado(agente.id, reloj());
        return { quien: 'agente', nombre: agente.nombre, alcance: agente.alcance };
      }
    }
    limitar(`admin-mal:${ip}`, 10, 10 * MIN);
    return falla(401, 'Clave de administración inválida');
  }

  /** Qué le pasa al firmware de un aparato: qué corre, qué hay, cómo le fue. */
  function actualizacionDe(d) {
    if (!d) return null;
    const oferta = elegirFirmware(firmwarePublicado(), { placa: d.placa, canal: d.canal, version: d.fw });
    return {
      version: d.fw || '',
      canal: d.canal || 'estable',
      disponible: oferta?.version || null,
      estado: d.ota?.estado || null,
      intento: d.ota?.version || null,
    };
  }

  function cuentaDe(headers, obligatoria = true) {
    const token = bearer(headers);
    const c = token ? db.sesionCuenta(hash(token), reloj(), SESION_VENCE_MS) : null;
    if (!c && obligatoria) falla(401, 'Tu sesión venció. Volvé a entrar.');
    return c;
  }

  function plantaMia(cuenta, plantaId) {
    const p = db.planta(plantaId);
    if (!p || p.cuenta !== cuenta.id) falla(404, 'No existe esa maceta');
    return p;
  }

  function linkDe(d, t) {
    if (!d || !d.visto) return 'NUNCA';
    const edad = t - d.visto;
    if (edad < VIVO_MS) return 'VIVO';
    if (edad < TIBIO_MS) return 'TIBIO';
    return 'CAIDO';
  }

  const vinculoInicial = () => ({ dias_vividos: 0, dias_sanos: 0, racha: 0, mejor_racha: 0, dia: null, urgente_hoy: false });

  /* Cierra los días que pasaron entre la última lectura y esta. Espejo de
     rk_bond_dia(): un día sin nada urgente es sano; uno con algo urgente, o
     sin datos, corta la racha pero no borra lo acumulado. */
  function avanzarVinculo(v, dia, urgente) {
    if (!v.dia) {
      v.dia = dia;
    } else if (dia > v.dia) {
      const salto = diasEntre(v.dia, dia);
      for (let k = 0; k < salto; k++) {
        const sano = k === 0 ? !v.urgente_hoy : false;
        v.dias_vividos += 1;
        if (sano) {
          v.dias_sanos += 1;
          v.racha += 1;
          v.mejor_racha = Math.max(v.mejor_racha, v.racha);
        } else {
          v.racha = 0;
        }
      }
      v.dia = dia;
      v.urgente_hoy = false;
    }
    if (urgente) v.urgente_hoy = true;
  }

  const vinculoPublico = (v) => {
    const { dia: _d, urgente_hoy: _u, ...resto } = { ...vinculoInicial(), ...(v || {}) };
    return resto;
  };

  /** El último riego anotado a mano, si es reciente. */
  function riegoRecienteDe(plantaId, t) {
    const r = db.ultimoRiego(plantaId);
    return r && t - r.t < RIEGO_RECIENTE_MS ? { t: r.t, origen: r.origen, quien: r.quien } : null;
  }

  /** La forma que consumen las vistas. */
  function nodoDe(p, t = reloj()) {
    const d = db.dispositivo(p.dispositivo);
    const u = d?.ultima || null;
    const mood = !p.revelado ? 'SLEEPING' : (u ? (d.animo || 'UNKNOWN') : 'UNKNOWN');
    const link = linkDe(d, t);
    const moodVisible = link === 'CAIDO' ? 'OFFLINE' : mood;
    const nodo = {
      id: p.id,
      nombre: p.nombre || '',
      /* Qué Rooti es se sabe desde el vínculo (lo dice la figura); la piel,
         recién con el cofre abierto. */
      modelo: p.persona || personaDeAparato(d),
      rareza: p.revelado ? (p.rareza || 'comun') : null,
      revelado: Boolean(p.revelado),
      especie: p.especie?.id || null,
      especie_info: p.especie || null,
      ficha: p.ficha ? { cuidados: p.ficha.cuidados, dificultad: p.ficha.dificultad, fuente: p.ficha.fuente } : null,
      chat: Boolean(p.especie && p.nombre) && iaVisible(),
      link,
      mood: moodVisible,
      severity: link === 'CAIDO' ? 'WATCH' : (d?.sev || 'OK'),
      reason: FRASES[moodVisible] || '',
      tel: {
        soil_pct: u?.suelo ?? null,
        temp_dc: u?.temp ?? null,
        rh_pct: u?.hr ?? null,
        lux: u?.lux ?? null,
        suelo_dc: u?.tsuelo ?? null,
        batt_mv: d?.bat_mv || null,
        usb: Boolean(d?.usb),
        age_s: u ? Math.max(0, Math.floor((t - u.t) / 1000)) : null,
        escurre: Boolean(u?.escurre),
        /* El número crudo del capacitivo: lo que mira la calibración. */
        suelo_raw: u?.crudo ?? null,
      },
      nodo: d ? {
        id: d.id,
        batt_pct: d.usb ? null : bateriaPct(d.bat_mv),
        usb: Boolean(d.usb),
        rssi: d.rssi ?? null,
        fw: d.fw || '',
        placa: d.placa || '',
        pantalla: d.pantalla || '',
        estado: d.estado || '',
        en_linea: Boolean(d.visto && t - d.visto < EN_LINEA_MS),
        actualizacion: actualizacionDe(d),
      } : null,
      bond: vinculoPublico(p.vinculo),
      pantalla: p.pantalla || 'toque',
      brillo: p.brillo ?? 80,
      creada: p.creada,
      riego: riegoRecienteDe(p.id, t),
      mascota: p.revelado ? mascotaPublica(normalizarMascota(p.mascota, p.revelada_en || t), t) : null,
      /* La calibración del sensor de tierra y la maceta (lib/riego.mjs). */
      calibracion: p.calibracion || null,
      calibrando: Boolean(p.calibrando && p.calibrando > t),
      maceta: p.maceta || null,
      agua_ml: aguaParaRegar({ suelo: u?.suelo, soil_min: p.especie?.soil_min, soil_max: p.especie?.soil_max, maceta: p.maceta }),
    };
    nodo.salud = saludBiologica(nodo);
    return nodo;
  }

  /* Lo que ve el cuidador: la planta sin ids ni nada de la cuenta. */
  function plantaParaCuidador(n) {
    const e = n.especie_info;
    return {
      id: 'cuidada',
      nombre: n.nombre, modelo: n.modelo, rareza: n.rareza, revelado: n.revelado,
      mood: n.mood, severity: n.severity, reason: n.reason, link: n.link,
      tel: { soil_pct: n.tel.soil_pct, temp_dc: n.tel.temp_dc, rh_pct: n.tel.rh_pct, lux: n.tel.lux, age_s: n.tel.age_s, escurre: n.tel.escurre },
      especie: n.especie,
      especie_info: e ? {
        id: e.id, nombre: e.nombre, cientifico: e.cientifico, soil_min: e.soil_min, soil_max: e.soil_max,
        temp_min_dc: e.temp_min_dc, temp_max_dc: e.temp_max_dc, rh_min: e.rh_min, lux_min: e.lux_min, lux_max: e.lux_max,
      } : null,
      ficha: n.ficha ? { cuidados: { riego: n.ficha.cuidados.riego, luz: n.ficha.cuidados.luz, temperatura: n.ficha.cuidados.temperatura, humedad: n.ficha.cuidados.humedad } } : null,
      bond: { dias_sanos: n.bond?.dias_sanos ?? 0 },
      riego: n.riego,
    };
  }
  const cuidadorPublico = (c) => ({ creado: c.creado, vence: c.vence, nombre: c.nombre, usos: c.usos });
  const fotoPublica = (f) => ({ id: f.id, t: f.t, mime: f.mime, ancho: f.ancho, alto: f.alto, nota: f.nota, origen: f.origen, peso: f.peso });

  /* ------------------------------------------------------------ fotos --- */
  /** Los bytes de una foto que manda la app, validados. */
  function bytesDeFoto({ image_b64, mime }) {
    const m = MIMES_FOTO.includes(String(mime)) ? String(mime) : null;
    if (!m) falla(400, 'La foto tiene que ser JPEG, PNG o WebP.');
    const b64 = String(image_b64 || '').replace(/^data:[^,]*,/, '');
    if (b64.length > FOTO_BYTES_MAX * 1.4) falla(413, 'La foto es demasiado grande: 450 KB como mucho.');
    const bytes = Buffer.from(b64, 'base64');
    if (bytes.length < 64) falla(400, 'Esa foto está vacía.');
    if (bytes.length > FOTO_BYTES_MAX) falla(413, 'La foto es demasiado grande: 450 KB como mucho.');
    return { bytes, mime: m };
  }

  /** Guarda una foto en el álbum de la planta. */
  function guardarFoto(cuenta, p, foto, t, { nota = '', origen = 'album' } = {}) {
    const { bytes, mime } = bytesDeFoto(foto);
    if (db.contarFotos(p.id) >= FOTOS_MAX) falla(409, `El álbum de ${p.nombre || 'esta planta'} está lleno (${FOTOS_MAX} fotos). Borrá alguna.`);
    return db.fotoGuardar({ planta: p.id, cuenta: cuenta.id, t, mime, bytes, nota: texto(nota, 80), origen });
  }

  /* Las fotos de reconocer y diagnosticar entran solas al álbum, si entran;
     si no (muy grande, álbum lleno), no es un error: la IA ya contestó. */
  function guardarFotoSilenciosa(cuenta, p, foto, t, origen) {
    try { guardarFoto(cuenta, p, foto, t, { origen }); } catch { /* no entra: da igual */ }
  }
  const ubicacionPublica = (c) => (c?.ubicacion ? { nombre: c.ubicacion.nombre, pais: c.ubicacion.pais, region: c.ubicacion.region || '' } : null);

  /* La colección es de PIELES: cada Rooti tiene tres, y cada cofre abierto
     suma la que salió ("brote-epico"). */
  function coleccionDe(cuenta) {
    const tengo = cuenta.coleccion || [];
    return {
      tengo,
      total: MODELOS.length * RAREZAS.length,
      probabilidades: PROBABILIDADES,
      catalogo: MODELOS.map((m) => ({
        id: m.id, nombre: m.nombre, lema: m.lema, carcasa: m.carcasa, fondo: m.pieles.comun.fondo,
        tengo: RAREZAS.some((r) => tengo.includes(idPiel(m.id, r))),
        pieles: RAREZAS.map((r) => ({
          ...m.pieles[r], id: idPiel(m.id, r), rareza: r, tengo: tengo.includes(idPiel(m.id, r)),
          probabilidad: probabilidadDe(r), paleta: paletaDeRooti(m.id, r)?.id || null,
        })),
      })),
    };
  }

  /** Lo que desbloquea las paletas cosméticas. */
  function logrosDe(c) {
    const epicas = (c.coleccion || []).filter((id) => String(id).endsWith('-epico')).length;
    const diasSanos = Math.max(0, ...db.plantasDe(c.id).map((p) => p.vinculo?.dias_sanos || 0));
    return { epicas, diasSanos };
  }

  /** Cuántas plantas de la cuenta necesitan algo: el número del ícono. */
  function pendientesDe(cuentaId) {
    return db.plantasDe(cuentaId).filter((p) => {
      const d = db.dispositivo(p.dispositivo);
      return p.revelado && d?.sev && d.sev !== 'OK';
    }).length;
  }

  const cuentaPublica = (c) => ({
    id: c.id,
    email: c.email,
    nombre: c.nombre,
    tz: c.tz,
    coleccion: c.coleccion,
    paleta: c.paleta || PALETA_POR_DEFECTO,
    plan: c.plan,
    email_verificado: Boolean(c.email_verificado),
    ia: presupuesto.limitesDe(c),
    avisos: db.suscripciones(c.id).length,
    plantas: db.plantasDe(c.id).length,
    creada: c.creada,
    ubicacion: ubicacionPublica(c),
  });

  async function abrirSesion(cuenta, headers) {
    const token = tokenNuevo();
    db.sesionCrear(hash(token), cuenta.id, reloj(), headers?.['user-agent'] || '');
    return { token, cuenta: cuentaPublica(cuenta) };
  }

  function validarClaveNueva(clave) {
    const c = String(clave ?? '');
    if (c.length < CLAVE_MIN) falla(400, `La contraseña tiene que tener al menos ${CLAVE_MIN} caracteres.`);
    if (c.length > 200) falla(400, 'La contraseña es demasiado larga.');
    return c;
  }

  function zonaValida(tz) {
    try {
      new Intl.DateTimeFormat('en', { timeZone: String(tz) });
      return true;
    } catch { return false; }
  }

  /* ----------------------------------------------------------- correos --- */
  const enlace = (ruta) => `${urlPublica().replace(/\/+$/, '')}/#${ruta}`;

  function mandarVerificacion(c) {
    const token = tokenNuevo();
    const t = reloj();
    db.tokenCuentaCrear(hash(token), c.id, 'verificar', t, t + VERIFICAR_VENCE_MS);
    correo.enviar({
      tipo: 'verificar', para: c.email,
      ...plantillas.verificarEmail({ nombre: c.nombre, url: enlace(`verificar/${token}`), horas: VERIFICAR_VENCE_MS / H, paleta: c.paleta }),
    });
  }

  function mandarClaveCambiada(c) {
    correo.enviar({
      tipo: 'clave-cambiada', para: c.email,
      ...plantillas.claveCambiada({ nombre: c.nombre, paleta: c.paleta, url: enlace('entrar') }),
    });
  }

  /* ---------------------------------------------------------------- IA --- */
  function prepararPrompt(p) {
    if (p.ficha && p.nombre) p.prompt = promptDePlanta({ nombre: p.nombre, ficha: p.ficha, persona: p.persona });
  }

  /** Llama a la IA con tope y cuota; anota el uso aunque la respuesta falle. */
  async function conIA({ cuenta, planta, tipo, modelo, entrada, llamada }) {
    if (ia.proveedor === 'claude') presupuesto.verificarTope(modelo, { entrada, salida: MAX_TOKENS[tipo] });
    let r;
    try {
      r = await llamada();
    } catch (e) {
      if (e.uso) presupuesto.registrar({ cuenta, planta, tipo, fuente: 'claude', modelo: e.modelo, uso: e.uso });
      falla(e.codigo || 502, e.message);
    }
    presupuesto.registrar({ cuenta, planta, tipo, fuente: r.fuente, modelo: r.modelo, uso: r.uso });
    return r;
  }

  /* ----------------------------------------------------------- avisos --- */
  /** Manda un aviso a todos los teléfonos de una cuenta. `pendientes` va en
      la carga para el número del ícono de la app (Badging API). */
  async function mandarA(subs, a, pendientes = undefined) {
    let n = 0;
    for (const s of subs) {
      const r = await push.enviar(s, {
        titulo: a.titulo, cuerpo: a.cuerpo, icono: a.icono, url: a.url, tag: a.tag, urgente: a.urgente,
        ...(Number.isFinite(pendientes) ? { pendientes } : {}),
      });
      if (r === 'vencida') db.suscripcionBorrar(s.endpoint);
      if (r === 'ok') n += 1;
    }
    return n;
  }

  async function enviarAvisos(planta, d) {
    if (!push) return 0;
    if (d.sev === 'OK') db.avisosOlvidar(planta.id, 'animo:');   /* terminó el episodio */
    const subs = db.suscripciones(planta.cuenta);
    if (!subs.length) return 0;
    const cuenta = db.cuenta(planta.cuenta);
    const t = reloj();
    const lista = avisosPendientes({
      planta, dispositivo: d, especie: planta.especie, ahora: t,
      enviados: db.avisosEnviados(planta.id), tz: cuenta?.tz,
    });
    let n = 0;
    const pendientes = lista.length ? pendientesDe(planta.cuenta) : 0;
    for (const a of lista) {
      n += await mandarA(subs, a, pendientes);
      db.avisoRegistrar(planta.id, a.clave, t);
    }
    return n;
  }

  /* ------------------------------------------------------------ clima --- */
  /** El pronóstico para la ciudad de la cuenta, de la caché o de Open-Meteo. */
  async function climaDe(cuenta, t) {
    if (!cuenta?.ubicacion || !clima.activo) return null;
    const guardado = db.climaLeer(cuenta.id);
    if (guardado && t - guardado.obtenido < CLIMA_TTL_MS) return guardado.datos;
    try {
      const p = await clima.pronostico(cuenta.ubicacion.lat, cuenta.ubicacion.lon, t);
      if (p) {
        db.climaGuardar(cuenta.id, t, p);
        return p;
      }
    } catch (e) {
      console.warn(`clima: ${e.message}`);
    }
    return guardado?.datos || null;
  }

  /** Cuándo va a tener sed esta planta con el clima que viene (clima.mjs). */
  function previsionDePlanta(p, pronostico, t) {
    const e = p.especie;
    const d = db.dispositivo(p.dispositivo);
    const u = d?.ultima;
    if (!e || !u || !Number.isFinite(u.suelo)) return { disponible: false, motivo: 'lectura' };
    const lecturas = db.lecturasDePlanta(p.id, t - VENTANA_TASA_MS);
    const tasa = tasaSecado(lecturas, { ahora: t });
    const resumen = resumenPronostico(pronostico);
    if (!tasa) return { disponible: false, motivo: 'historial', clima: resumen };
    const { factor, dT, dRH } = factorClima(resumen, mediaReciente(lecturas, { ahora: t }));
    const pv = previsionDe({ suelo: u.suelo, soil_min: e.soil_min, tasa, factor, ahora: t });
    if (!pv) return { disponible: false, motivo: 'historial', clima: resumen };
    return { disponible: true, ...pv, dT, dRH, suelo: u.suelo, soil_min: e.soil_min, tasa_horas: tasa.horas, clima: resumen };
  }

  /** Los avisos que se adelantan al clima, para todas las cuentas con ciudad. */
  async function previsiones() {
    if (!push || !clima.activo) return 0;
    const t = reloj();
    let n = 0;
    for (const cuenta of db.cuentasConUbicacion()) {
      const subs = db.suscripciones(cuenta.id);
      if (!subs.length) continue;
      const pron = await climaDe(cuenta, t);
      if (!pron) continue;
      for (const p of db.plantasDe(cuenta.id)) {
        if (!p.revelado || !p.especie) continue;
        const pv = previsionDePlanta(p, pron, t);
        if (!pv.disponible) continue;
        const d = db.dispositivo(p.dispositivo);
        const a = avisoPrevision({
          planta: p, mood: d?.animo, suelo: pv.suelo, especie: p.especie, prevision: pv, resumen: pv.clima,
          ahora: t, enviados: db.avisosEnviados(p.id), tz: cuenta.tz,
        });
        if (!a) continue;
        n += await mandarA(subs, a);
        db.avisoRegistrar(p.id, a.clave, t);
      }
    }
    return n;
  }

  /** Revisa las macetas que dejaron de reportar y el clima que viene. Lo
      llama un temporizador. */
  async function revisar() {
    let n = 0;
    for (const p of db.plantasActivas()) {
      const d = db.dispositivo(p.dispositivo);
      if (d) n += await enviarAvisos(p, d);
    }
    n += await previsiones();
    vigilar();
    return n;
  }

  /** Lo que no es de ninguna planta: caídas masivas y emuladores olvidados. */
  function vigilar() {
    const t = reloj();
    try {
      const v = detectarCaidaMasiva(db.dispositivos(), t);
      if (v.alarma && alAlerta) {
        const ultima = Number(db.metaLeer('vigia:caida') || 0);
        if (t - ultima > VIGIA.esperaMs) {
          db.metaEscribir('vigia:caida', String(t));
          alAlerta({ tipo: 'caida', ...v });
        }
      }
      db.dispositivosBorrarOciosos('emulador', t - EMULADOR_OCIOSO_MS);
    } catch (e) {
      console.error('vigía:', e.message);
    }
  }

  /* ----------------------------------------------------------- aparato --- */
  async function sync(cuerpo, headers, ip = '') {
    const t = reloj();
    const idDisp = String(cuerpo?.id || '');
    if (!/^[0-9A-F]{12}$/.test(idDisp)) falla(400, 'id inválido');
    const token = bearer(headers);
    if (!/^[0-9a-f]{64}$/.test(token)) falla(401, 'falta el token');

    let d = db.dispositivo(idDisp);
    if (!d) {
      /* Confianza al primer uso: el primer aparato que se presenta con este
         id registra su token. En producción los registra la estación de
         fábrica y esto se apaga con ROOTLAB_TOFU=0 (docs/api.md). */
      const esEmulador = texto(cuerpo.placa, 24) === 'emulador';
      if (!tofu || (tofu === 'emulador' && !esEmulador)) {
        limitar(`sync-mal:${ip}`, SYNC_MAL_MAX, 10 * MIN);
        falla(401, 'aparato no registrado');
      }
      if (tofu === 'emulador') limitar(`emulador-nuevo:${ip}`, 20, DIA);
      d = {
        id: idDisp, token_hash: hash(token), creado: t, ultimo_reloj: -1, arranques: 0, planta: null,
        origen: esEmulador ? 'emulador' : 'tofu', canal: 'estable',
      };
    } else if (!igualesSeguro(d.token_hash, hash(token))) {
      limitar(`sync-mal:${ip}`, SYNC_MAL_MAX, 10 * MIN);
      falla(401, 'token inválido');
    }
    if (d.deshabilitado) falla(403, 'aparato deshabilitado');
    /* Un aparato sano habla cada quince minutos, o cada cinco segundos
       mientras la app calibra. Muy por encima de eso es un firmware en bucle
       o alguien con un token ajeno: se le corta hasta que se calme. Perder un
       sync no pierde lecturas —el aparato las reenvía— y una maceta no se
       queda sin actualizar por esto. */
    limitar(`sync:${d.id}`, SYNC_MAX, SYNC_VENTANA_MS);

    const epoca = Math.max(0, entero(cuerpo.epoca));
    let planta = d.planta ? db.planta(d.planta) : null;

    /* Un aparato vinculado que aparece con otra época fue borrado a mano
       (botón largo): el vínculo viejo ya no vale. */
    if (planta && planta.epoca !== epoca) {
      db.plantaDesvincular(planta.id, t);
      planta = null;
      d.planta = null;
    }
    if (!planta) d.planta = null;

    const persona = normalizarPersona(texto(cuerpo.persona, 15));
    Object.assign(d, {
      visto: t,
      fw: texto(cuerpo.fw, 16),
      placa: texto(cuerpo.placa, 24),
      pantalla: texto(cuerpo.pantalla, 24),
      estado: texto(cuerpo.estado, 16),
      epoca,
      rssi: Number.isFinite(Number(cuerpo.rssi)) ? entero(cuerpo.rssi) : null,
      usb: Boolean(cuerpo.usb),
      bat_mv: Math.max(0, entero(cuerpo.bat_mv)),
      /* Lo que grabó la fábrica manda sobre lo que diga el aparato. */
      persona_fabrica: d.origen === 'fabrica' ? (d.persona_fabrica || persona || null) : (persona || d.persona_fabrica || null),
    });
    if (d.origen !== 'fabrica' && cuerpo.lote) d.lote = texto(cuerpo.lote, 12).replace(/[^0-9A-Za-z-]/g, '') || null;
    if (cuerpo.ota && ESTADOS_OTA.includes(cuerpo.ota.estado)) {
      const version = texto(cuerpo.ota.version, 15);
      if (!d.ota || d.ota.estado !== cuerpo.ota.estado || d.ota.version !== version) {
        d.ota = { version, estado: cuerpo.ota.estado, t };
        if (versionValida(version)) contar(`ota:${cuerpo.ota.estado}`);
      }
    }
    if (planta && !planta.persona) planta.persona = personaDeAparato(d);
    const codigo = normalizarCodigo(cuerpo.codigo);
    if (codigo) {
      d.codigo = codigo;
      d.codigo_epoca = epoca;
    }

    /* Lecturas: el reloj del aparato es monótono; lo que no avanza ya se
       guardó (una respuesta que se perdió y el aparato reenvió). */
    const relojAhora = Math.max(0, entero(cuerpo.reloj));
    const arranques = entero(cuerpo.arranques);
    if (arranques !== d.arranques && relojAhora < d.ultimo_reloj) d.ultimo_reloj = -1;
    d.arranques = arranques;

    const lecturas = Array.isArray(cuerpo.lecturas) ? cuerpo.lecturas.slice(0, 300) : [];
    const cuenta = planta ? db.cuenta(planta.cuenta) : null;
    if (planta) planta.vinculo = { ...vinculoInicial(), ...(planta.vinculo || {}) };

    db.transaccion(() => {
      for (const l of lecturas) {
        const hace = Math.max(0, entero(l?.hace));
        const rl = relojAhora - hace;
        if (rl <= d.ultimo_reloj) continue;
        d.ultimo_reloj = rl;
        const animo = ANIMOS.includes(l.animo) ? l.animo : 'UNKNOWN';
        const sev = ['OK', 'WATCH', 'URGENT'].includes(l.sev) ? l.sev : 'OK';
        const r = { t: t - hace * 1000, animo, sev };
        const opcional = (k, v, lo, hi) => {
          if (v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v))) {
            r[k] = Math.min(hi, Math.max(lo, Math.round(Number(v))));
          }
        };
        opcional('suelo', l.suelo, 0, 100);
        opcional('temp', l.temp, -400, 800);
        opcional('hr', l.hr, 0, 100);
        opcional('lux', l.lux, 0, 200000);
        opcional('tsuelo', l.tsuelo, -400, 800);
        opcional('bat', l.bat, 0, 5000);
        opcional('crudo', l.suelo_raw, 0, 4095);
        if (l.usb) r.usb = true;
        /* El Rooti vio un riego que se escurrió sin empapar (nodo/soil.h). */
        if (l.escurre === true || (Number(l.fallas) & 0x10)) r.escurre = true;
        db.lecturaInsertar({ ...r, dispositivo: idDisp, planta: planta?.id || null });
        /* El tiempo con la planta cómoda se vuelve gotas de rocío para la
           mascota (public/lib/mascota.mjs). */
        if (planta?.revelado && d.ultima?.t && r.t > d.ultima.t && sev === 'OK' && animo === 'HAPPY') {
          planta.mascota = acumularOptimo(normalizarMascota(planta.mascota, planta.revelada_en || t), r.t - d.ultima.t);
        }
        d.ultima = r;
        d.animo = animo;
        d.sev = sev;
        if (planta?.revelado) {
          avanzarVinculo(planta.vinculo, diaLocal(r.t, cuenta?.tz), sev === 'URGENT');
        }
      }
      db.dispositivoGuardar(d);
      if (planta) db.plantaGuardar(planta);
    });

    if (planta) await enviarAvisos(planta, d);

    const e = planta?.especie || null;
    const oferta = elegirFirmware(firmwarePublicado(), { placa: d.placa, canal: d.canal, version: d.fw });
    const calibrando = Boolean(planta?.calibrando && planta.calibrando > t);
    return [200, {
      ok: true,
      vinculado: Boolean(planta),
      revelado: Boolean(planta?.revelado),
      planta: planta?.id || null,
      persona: planta ? (planta.persona || personaDeAparato(d)) : '',
      /* La piel que salió del cofre: la maceta se pinta con esta paleta. */
      ...(planta?.revelado ? { rareza: planta.rareza || 'comun' } : {}),
      nombre: planta?.nombre || '',
      ...(e ? {
        especie: {
          id: e.id, nombre: e.nombre,
          suelo_min: e.soil_min, suelo_max: e.soil_max,
          temp_min: e.temp_min_dc, temp_max: e.temp_max_dc,
          hr_min: e.rh_min, lux_min: e.lux_min, lux_max: e.lux_max,
          dificultad: e.dificultad,
        },
      } : {}),
      ...(planta?.revelado ? { vinculo: vinculoPublico(planta.vinculo) } : {}),
      /* La calibración del capacitivo que se hizo desde la app, y si la app
         la está haciendo ahora (el aparato mide y cuenta seguido). */
      ...(planta?.calibracion ? { calibracion: { seco: planta.calibracion.seco, mojado: planta.calibracion.mojado } } : {}),
      ...(calibrando ? { calibrando: true } : {}),
      /* Una versión nueva para esta placa y este canal (server/firmware.mjs). */
      ...(oferta ? {
        firmware: {
          version: oferta.version, url: `${urlPublica()}/api/d/firmware/${oferta.id}`,
          sha256: oferta.sha256, firma: oferta.firma, tamano: oferta.tamano,
        },
      } : {}),
      intervalo_s: INTERVALO_S,
      aceptadas: lecturas.length,
      hora: Math.floor(t / 1000),
      brillo: planta?.brillo ?? 80,
      pantalla: planta?.pantalla || 'toque',
    }];
  }

  /* ------------------------------------------------------ el emulador --- */
  /**
   * Para probar la mascota sin esperar días: el emulador (y sólo él, que se
   * presenta como placa "emulador") puede adelantar el reloj de SU planta:
   * "tres-dias" hace como si hubieran pasado 3 días sin cuidados (aparece el
   * polvo y baja la felicidad) y "gotas" suma tres gotas de rocío. No toca
   * lecturas, días sanos ni nada que desbloquee algo.
   */
  function demo(cuerpo, headers) {
    const t = reloj();
    const d = db.dispositivo(String(cuerpo?.id || ''));
    const token = bearer(headers);
    if (!d || !/^[0-9a-f]{64}$/.test(token) || !igualesSeguro(d.token_hash, hash(token))) falla(401, 'aparato desconocido');
    if (d.placa !== 'emulador') falla(403, 'Sólo el emulador puede adelantar el tiempo.');
    const planta = d.planta ? db.planta(d.planta) : null;
    if (!planta?.revelado) falla(409, 'Primero abrí el cofre en la app.');
    let masc = normalizarMascota(planta.mascota, planta.revelada_en || t);
    if (cuerpo?.accion === 'tres-dias') {
      const salto = 3 * DIA + H;
      masc = {
        ...masc,
        ultima_interaccion: Math.min(masc.ultima_interaccion, t - salto),
        polvo_desde: Math.min(masc.polvo_desde, t - salto),
        ultima_caricia: masc.ultima_caricia ? masc.ultima_caricia - salto : 0,
        t_felicidad: masc.t_felicidad - salto,
      };
    } else if (cuerpo?.accion === 'gotas') {
      masc = { ...masc, gotas: Math.min(GOTAS.maximo, masc.gotas + 3) };
    } else {
      falla(400, 'Acción desconocida');
    }
    planta.mascota = masc;
    db.plantaGuardar(planta);
    return [200, { ok: true, mascota: mascotaPublica(masc, t) }];
  }

  /* ------------------------------------------------------ administración --- */
  const aparatoAdmin = (d) => ({
    id: d.id, origen: d.origen, lote: d.lote || null, persona: d.persona_fabrica || null, canal: d.canal,
    deshabilitado: d.deshabilitado, fw: d.fw || '', placa: d.placa || '', estado: d.estado || '',
    creado: d.creado, visto: d.visto || null, vinculado: Boolean(d.planta), ota: d.ota || null,
  });
  const firmwareAdmin = ({ contenido: _c, ...f }) => ({ ...f, retirado: f.retirado || null });

  function administrar({ metodo, ruta, query, cuerpo, headers, ip }) {
    const quien = exigirAdmin(headers, ip, ruta, metodo);
    const t = reloj();
    let m;

    if (metodo === 'GET' && ruta === '/api/admin/estado') {
      const aparatos = db.dispositivos();
      const reales = aparatos.filter((d) => d.origen !== 'emulador');
      const versiones = {};
      for (const d of reales) versiones[d.fw || '?'] = (versiones[d.fw || '?'] || 0) + 1;
      return [200, {
        version, esquema: db.version(), ...db.contar(),
        aparatos: { reales: reales.length, emuladores: aparatos.length - reales.length, de_fabrica: reales.filter((d) => d.origen === 'fabrica').length, deshabilitados: reales.filter((d) => d.deshabilitado).length },
        firmware: versiones,
        ia: { proveedor: ia?.proveedor || 'ninguna', visible: iaVisible(), ...presupuesto.estado() },
        tofu: tofu === true ? 'todos' : tofu || 'nadie',
        vigia: detectarCaidaMasiva(aparatos, t),
      }];
    }

    if (metodo === 'GET' && ruta === '/api/admin/metricas') {
      const dias = Math.min(366, Math.max(1, entero(query?.dias, 30)));
      const desde = new Date(t - (dias - 1) * DIA).toISOString().slice(0, 10);
      const eventos = db.eventosDesde(desde);
      const totales = {};
      for (const e of eventos) totales[e.evento] = (totales[e.evento] || 0) + e.n;
      return [200, { desde, dias, totales, eventos }];
    }

    /* --- aparatos: la estación de fábrica y el día a día ------------------ */
    if (metodo === 'GET' && ruta === '/api/admin/aparatos') {
      return [200, { aparatos: db.dispositivos().map(aparatoAdmin) }];
    }
    if (metodo === 'POST' && ruta === '/api/admin/aparatos') {
      const id = String(cuerpo?.id || '').toUpperCase();
      if (!/^[0-9A-F]{12}$/.test(id)) falla(400, 'id inválido (la MAC en 12 hexadecimales)');
      const tokenHash = /^[0-9a-f]{64}$/.test(String(cuerpo?.token || '')) ? hash(cuerpo.token) : String(cuerpo?.token_hash || '');
      if (!/^[0-9a-f]{64}$/.test(tokenHash)) falla(400, 'falta token_hash (SHA-256 del token, en hexadecimal)');
      const persona = normalizarPersona(texto(cuerpo?.persona, 15));
      if (!persona) falla(400, 'persona desconocida');
      const lote = texto(cuerpo?.lote, 12).replace(/[^0-9A-Za-z-]/g, '');
      const canal = CANALES.includes(cuerpo?.canal) ? cuerpo.canal : 'estable';
      const previo = db.dispositivo(id);
      /* Un emulador no puede quedarse con la MAC de una placa de verdad. Quien
         adivine las MAC que van a salir de fábrica podría registrarlas antes
         como emuladores, vincularlas y dejar esas placas sin poder entrar: lo
         que grabó la fábrica manda, y la planta del emulador se suelta. */
      if (previo?.planta && previo.origen === 'emulador') {
        db.plantaDesvincular(previo.planta, t);
        previo.planta = null;
      }
      if (previo?.planta) falla(409, 'Ese aparato ya es de alguien: no se vuelve a registrar.');
      if (previo && previo.origen === 'fabrica' && !cuerpo?.reemplazar) falla(409, 'Ese aparato ya está registrado (mandá reemplazar: true para regrabarlo).');
      db.dispositivoGuardar({
        ...(previo || { id, creado: t, ultimo_reloj: -1, arranques: 0, planta: null }),
        token_hash: tokenHash, persona_fabrica: persona, lote: lote || null, origen: 'fabrica', canal, deshabilitado: false,
      });
      contar('fabrica');
      return [previo ? 200 : 201, aparatoAdmin(db.dispositivo(id))];
    }
    if (metodo === 'PATCH' && (m = ruta.match(/^\/api\/admin\/aparatos\/([0-9A-Fa-f]{12})$/))) {
      const d = db.dispositivo(m[1].toUpperCase());
      if (!d) falla(404, 'No existe ese aparato');
      if (cuerpo?.canal !== undefined) {
        if (!CANALES.includes(cuerpo.canal)) falla(400, `canal: ${CANALES.join(' o ')}`);
        d.canal = cuerpo.canal;
      }
      if (cuerpo?.deshabilitado !== undefined) d.deshabilitado = Boolean(cuerpo.deshabilitado);
      if (cuerpo?.lote !== undefined) d.lote = texto(cuerpo.lote, 12).replace(/[^0-9A-Za-z-]/g, '') || null;
      db.dispositivoGuardar(d);
      return [200, aparatoAdmin(d)];
    }
    /* Dar de baja uno que nunca se vinculó: un registro de fábrica equivocado,
       o lo que dejó entrar la confianza al primer uso cuando estaba abierta. */
    if (metodo === 'DELETE' && (m = ruta.match(/^\/api\/admin\/aparatos\/([0-9A-Fa-f]{12})$/))) {
      const id = m[1].toUpperCase();
      if (!db.dispositivo(id)) falla(404, 'No existe ese aparato');
      if (!db.dispositivoBorrar(id)) falla(409, 'Ese aparato tiene o tuvo una planta: no se borra, se deshabilita.');
      return [204, null];
    }
    /* Un lote entero: cambiarlo de canal o deshabilitarlo (una partida fallada). */
    if (metodo === 'PATCH' && (m = ruta.match(/^\/api\/admin\/lotes\/([0-9A-Za-z-]{1,12})$/))) {
      const delLote = db.dispositivos().filter((d) => d.lote === m[1]);
      if (!delLote.length) falla(404, 'No hay aparatos de ese lote');
      if (cuerpo?.canal !== undefined && !CANALES.includes(cuerpo.canal)) falla(400, `canal: ${CANALES.join(' o ')}`);
      for (const resumen of delLote) {
        const d = db.dispositivo(resumen.id);
        if (cuerpo?.canal !== undefined) d.canal = cuerpo.canal;
        if (cuerpo?.deshabilitado !== undefined) d.deshabilitado = Boolean(cuerpo.deshabilitado);
        db.dispositivoGuardar(d);
      }
      return [200, { lote: m[1], aparatos: delLote.length }];
    }

    if (metodo === 'DELETE' && ruta === '/api/admin/sesion') {
      const token = bearer(headers);
      sesionesAdmin.delete(hash(token));
      return [204, null];
    }

    /* --- el informe de una vuelta de un agente -------------------------- */
    /* El agente que implementa mejoras cuenta qué hizo, y eso llega al correo
       de quien administra. Usa el relay del producto: no hace falta que el
       agente sepa nada de SMTP ni tenga credenciales de correo. */
    if (metodo === 'POST' && ruta === '/api/admin/informe') {
      const asunto = texto(cuerpo?.asunto, 120);
      const texto_ = texto(cuerpo?.cuerpo, 20000);
      if (texto_.length < 10) falla(400, 'el informe está vacío');
      const quienEscribe = quien.nombre || (quien.email ? quien.email : 'la trastienda');
      limitar(`informe:${quienEscribe}`, 6, H);
      const destinos = [...new Set([
        ...ARRANQUE,
        ...db.cuentas(2000).filter((c) => rolDe(c) === 'admin').map((c) => normalizarEmail(c.email)),
      ])];
      if (!destinos.length) falla(409, 'No hay ninguna dirección de administración a la que mandarlo.');
      for (const para of destinos) {
        correo.enviar({ tipo: 'informe', para, ...plantillas.informeDeAgente({ agente: quienEscribe, asunto, cuerpo: texto_ }) });
      }
      contar('trastienda:informe');
      return [202, { enviado_a: destinos.length }];
    }

    /* --- quién soy, para que el panel sepa qué mostrar ------------------ */
    if (metodo === 'GET' && ruta === '/api/admin/yo') {
      return [200, { quien: quien.quien, email: quien.email || null, nombre: quien.nombre || null }];
    }

    /* --- las cuentas: el ABM ------------------------------------------- */
    /* Es la única pantalla que muestra emails. Está para poder avisar de una
       actualización, ofrecer servicio técnico cuando un aparato falla y dar o
       sacar el rol de administración. Nada de plantas, charlas ni fotos. */
    if (metodo === 'GET' && ruta === '/api/admin/cuentas') {
      const cuentas = db.cuentas(Math.min(2000, Math.max(1, entero(query?.limite, 500))));
      return [200, {
        cuentas: cuentas.map((c) => ({
          id: c.id,
          email: c.email,
          nombre: c.nombre || '',
          creada: c.creada,
          email_verificado: c.email_verificado || null,
          plan: c.plan,
          rol: rolDe(c),
          /* Quién no se le puede sacar el rol: viene del entorno del servidor. */
          fijo: ARRANQUE.has(normalizarEmail(c.email)),
          plantas: c.plantas,
          plantas_totales: c.plantas_totales,
          ultima_sesion: c.ultima_sesion || null,
        })),
        arranque: [...ARRANQUE],
      }];
    }

    if (metodo === 'PATCH' && (m = ruta.match(/^\/api\/admin\/cuentas\/([A-Za-z0-9]+)$/))) {
      const c = db.cuenta(m[1]);
      if (!c) falla(404, 'No existe esa cuenta');
      if (cuerpo?.rol !== undefined) {
        if (!['persona', 'admin'].includes(cuerpo.rol)) falla(400, 'rol: persona o admin');
        if (ARRANQUE.has(normalizarEmail(c.email)) && cuerpo.rol !== 'admin') {
          falla(409, 'Ese email es administrador desde el entorno del servidor (ROOTLAB_ADMINS): se saca de ahí.');
        }
        db.cuentaActualizar(c.id, { rol: cuerpo.rol });
        contar(`trastienda:rol-${cuerpo.rol}`);
      }
      const d = db.cuenta(c.id);
      return [200, { id: d.id, email: d.email, rol: rolDe(d) }];
    }

    if (metodo === 'DELETE' && (m = ruta.match(/^\/api\/admin\/cuentas\/([A-Za-z0-9]+)$/))) {
      const c = db.cuenta(m[1]);
      if (!c) falla(404, 'No existe esa cuenta');
      if (ARRANQUE.has(normalizarEmail(c.email))) falla(409, 'Esa cuenta es administradora desde el entorno: no se borra desde acá.');
      /* Lo mismo que cuando alguien se borra solo: se va todo lo suyo y sus
         Rooties quedan libres para que otro los vincule. */
      db.cuentaBorrar(c.id);
      contar('trastienda:baja');
      return [204, null];
    }

    /* --- los tokens de los agentes ------------------------------------- */
    if (metodo === 'GET' && ruta === '/api/admin/agentes') {
      return [200, { agentes: db.agentes(), alcances: ALCANCES }];
    }

    if (metodo === 'POST' && ruta === '/api/admin/agentes') {
      const nombre = texto(cuerpo?.nombre, 40);
      if (nombre.length < 3) falla(400, 'ponele un nombre al agente (3 caracteres o más)');
      const alcance = ALCANCES.includes(cuerpo?.alcance) ? cuerpo.alcance : 'vivero';
      /* El token se muestra UNA vez: después queda sólo su hash. */
      const token = `agt_${randomBytes(24).toString('hex')}`;
      const id = db.agenteCrear({ nombre, tokenHash: hash(token), alcance, t });
      return [201, { id, nombre, alcance, token }];
    }

    if (metodo === 'DELETE' && (m = ruta.match(/^\/api\/admin\/agentes\/(\d{1,9})$/))) {
      if (!db.agenteRevocar(Number(m[1]), t)) falla(404, 'No existe ese agente (o ya estaba revocado)');
      return [204, null];
    }

    /* --- la flota: qué hay en la calle y cómo le va --------------------- */
    if (metodo === 'GET' && ruta === '/api/admin/flota') {
      return [200, {
        resumen: db.flotaResumen(t, FLOTA_ACTIVO_MS, FLOTA_CALLADO_MS),
        por: {
          lote: db.flotaPor('lote', t, FLOTA_ACTIVO_MS),
          fw: db.flotaPor('fw', t, FLOTA_ACTIVO_MS),
          placa: db.flotaPor('placa', t, FLOTA_ACTIVO_MS),
          canal: db.flotaPor('canal', t, FLOTA_ACTIVO_MS),
          origen: db.flotaPor('origen', t, FLOTA_ACTIVO_MS),
        },
        aparatos: db.flota(Math.min(1000, Math.max(1, entero(query?.limite, 300)))).map((d) => ({
          ...aparatoAdmin({ ...d, planta: d.vinculado ? 'si' : null }),
          lecturas: d.lecturas,
          bat_mv: d.bat_mv || null,
          usb: Boolean(d.usb),
          rssi: d.rssi ?? null,
          arranques: d.arranques,
          callado: Boolean(d.vinculado) && (!d.visto || t - d.visto > FLOTA_CALLADO_MS),
        })),
        ventanas: { activo_ms: FLOTA_ACTIVO_MS, callado_ms: FLOTA_CALLADO_MS },
      }];
    }

    /* --- las lecturas: ¿el producto está midiendo bien? ----------------- */
    if (metodo === 'GET' && ruta === '/api/admin/lecturas') {
      const dias = Math.min(120, Math.max(1, entero(query?.dias, 30)));
      const desde = t - dias * DIA;
      const porDia = db.lecturasPorDia(desde, t + DIA);
      const porAparato = db.lecturasPorAparato(desde);
      /* Cuántas lecturas por día manda cada aparato: un ROOTKIT sano manda
         unas 96 (una cada quince minutos). Mucho menos es un aparato que se
         queda sin wifi, sin batería o colgado. */
      const esperadasPorDia = DIA / (15 * MIN);
      const ritmos = porAparato.map((a) => {
        const dias_vivo = Math.max(1, (a.ultima - a.primera) / DIA);
        return { dispositivo: a.dispositivo, n: a.n, por_dia: Math.round((a.n / dias_vivo) * 10) / 10, ultima: a.ultima };
      });
      return [200, {
        dias,
        por_dia: porDia,
        total: porDia.reduce((n, d) => n + d.n, 0),
        sensores: db.saludSensores(desde),
        esperadas_por_dia: esperadasPorDia,
        ritmos: ritmos.slice(0, 100),
        flojos: ritmos.filter((r) => r.por_dia < esperadasPorDia / 2).length,
      }];
    }

    /* --- el vivero: las ideas de los agentes ---------------------------- */
    if (metodo === 'GET' && ruta === '/api/admin/ideas') {
      const area = AREAS.includes(query?.area) ? query.area : null;
      const estado = ESTADOS_IDEA.includes(query?.estado) ? query.estado : null;
      return [200, {
        areas: AREAS,
        resumen: db.ideasResumen(),
        ideas: db.ideas({ area, estado, limite: Math.min(1000, Math.max(1, entero(query?.limite, 500))) }),
      }];
    }

    if (metodo === 'POST' && ruta === '/api/admin/ideas') {
      const area = texto(cuerpo?.area, 20).toLowerCase();
      if (!AREAS.includes(area)) falla(400, `área desconocida: ${AREAS.join(', ')}`);
      const titulo = texto(cuerpo?.titulo, 120);
      if (titulo.length < 8) falla(400, 'el título tiene que decir qué mejorar (8 caracteres o más)');
      const impacto = IMPACTOS.includes(cuerpo?.impacto) ? cuerpo.impacto : 'medio';
      const esfuerzo = ESFUERZOS.includes(cuerpo?.esfuerzo) ? cuerpo.esfuerzo : 'medio';
      const r = db.ideaProponer({
        area, titulo, impacto, esfuerzo,
        detalle: texto(cuerpo?.detalle, 4000),
        evidencia: texto(cuerpo?.evidencia, 1000),
        autor: texto(cuerpo?.autor, 40),
        huella: huellaDeIdea(area, titulo),
        t,
      });
      contar(`idea:${area}`);
      return [r.repetida ? 200 : 201, { ...r, idea: db.idea(r.id) }];
    }

    if (metodo === 'PATCH' && (m = ruta.match(/^\/api\/admin\/ideas\/(\d{1,9})$/))) {
      const i = db.idea(Number(m[1]));
      if (!i) falla(404, 'No existe esa idea');
      if (cuerpo?.estado !== undefined) {
        if (!ESTADOS_IDEA.includes(cuerpo.estado)) falla(400, `estado: ${ESTADOS_IDEA.join(', ')}`);
        i.estado = cuerpo.estado;
        i.cerrada = ['plantada', 'descartada'].includes(i.estado) ? t : null;
      }
      if (cuerpo?.impacto !== undefined) {
        if (!IMPACTOS.includes(cuerpo.impacto)) falla(400, `impacto: ${IMPACTOS.join(', ')}`);
        i.impacto = cuerpo.impacto;
      }
      if (cuerpo?.esfuerzo !== undefined) {
        if (!ESFUERZOS.includes(cuerpo.esfuerzo)) falla(400, `esfuerzo: ${ESFUERZOS.join(', ')}`);
        i.esfuerzo = cuerpo.esfuerzo;
      }
      if (cuerpo?.area !== undefined) {
        if (!AREAS.includes(cuerpo.area)) falla(400, `área: ${AREAS.join(', ')}`);
        i.area = cuerpo.area;
      }
      if (cuerpo?.motivo !== undefined) i.motivo = texto(cuerpo.motivo, 500);
      if (cuerpo?.detalle !== undefined) i.detalle = texto(cuerpo.detalle, 4000);
      i.movida = t;
      db.ideaGuardar(i);
      return [200, db.idea(i.id)];
    }

    if (metodo === 'DELETE' && (m = ruta.match(/^\/api\/admin\/ideas\/(\d{1,9})$/))) {
      if (!db.ideaBorrar(Number(m[1]))) falla(404, 'No existe esa idea');
      return [204, null];
    }

    /* --- firmware ---------------------------------------------------------- */
    if (metodo === 'GET' && ruta === '/api/admin/firmware') {
      return [200, { firmware: db.firmwareLista().map(firmwareAdmin) }];
    }
    if (metodo === 'POST' && ruta === '/api/admin/firmware') {
      if (!firmwarePublica) falla(503, 'El servidor no tiene la clave pública del firmware (deploy/firmware-publica.pem).');
      const f = {
        version: texto(cuerpo?.version, 16), placa: texto(cuerpo?.placa, 24), canal: texto(cuerpo?.canal, 8),
        notas: texto(cuerpo?.notas, 200), firma: texto(cuerpo?.firma, 128),
      };
      if (!versionValida(f.version)) falla(400, 'versión inválida (X.Y.Z)');
      if (!RE_PLACA.test(f.placa)) falla(400, 'placa inválida');
      if (!CANALES.includes(f.canal)) falla(400, `canal: ${CANALES.join(' o ')}`);
      let contenido;
      try { contenido = Buffer.from(String(cuerpo?.contenido_b64 || ''), 'base64'); } catch { contenido = Buffer.alloc(0); }
      if (contenido.length < 16 || contenido.length > FIRMWARE_MAX_BYTES) falla(400, `el binario tiene que medir entre 16 y ${FIRMWARE_MAX_BYTES} bytes`);
      const sha256 = sha256Hex(contenido);
      if (cuerpo?.sha256 && String(cuerpo.sha256).toLowerCase() !== sha256) falla(400, 'el SHA-256 no coincide con el binario: ¿se cortó la subida?');
      /* La prueba que importa: sin la firma de quien tiene la privada, no entra. */
      if (!firmaValida(contenido, f.firma, firmwarePublica)) falla(403, 'La firma no es válida para este binario.');
      const id = db.firmwarePublicar({ ...f, sha256, tamano: contenido.length, publicado: t, contenido });
      cacheFirmware = null;
      return [201, { id, version: f.version, placa: f.placa, canal: f.canal, sha256, tamano: contenido.length, publicado: t }];
    }
    if (metodo === 'DELETE' && (m = ruta.match(/^\/api\/admin\/firmware\/(\d{1,9})$/))) {
      if (!db.firmwareRetirar(Number(m[1]), t)) falla(404, 'No existe esa publicación (o ya estaba retirada)');
      cacheFirmware = null;
      return [204, null];
    }

    falla(404, 'Ruta desconocida');
    return [404, null];
  }

  /* -------------------------------------------------------------- rutas --- */
  async function manejar({ metodo, ruta, query = {}, cuerpo = null, headers = {}, ip = '', local = false }) {
    const t = reloj();
    let m;

    if (metodo === 'POST' && ruta === '/api/d/sync') return sync(cuerpo, headers, ip);
    if (metodo === 'POST' && ruta === '/api/d/demo') return demo(cuerpo, headers);

    /* El binario de una actualización, para el aparato que se presenta con
       su token. No es público: sin token de aparato no se baja nada. */
    if (metodo === 'GET' && (m = ruta.match(/^\/api\/d\/firmware\/(\d{1,9})$/))) {
      const token = bearer(headers);
      if (!/^[0-9a-f]{64}$/.test(token)) falla(401, 'falta el token');
      const d = db.dispositivoPorToken(hash(token));
      if (!d || d.deshabilitado) falla(401, 'aparato desconocido');
      limitar(`firmware:${d.id}`, 12, H);
      const contenido = db.firmwareContenido(Number(m[1]));
      if (!contenido) falla(404, 'Esa versión ya no está publicada');
      contar('ota:descarga');
      return [200, { binario: Buffer.from(contenido), mime: 'application/octet-stream', cache: 'private, no-store' }];
    }

    /* Pedir el código para entrar a la trastienda. Contesta lo mismo exista
       o no ese email y sea o no de administración: si no, esta ruta sería una
       forma de averiguar quién administra el servidor. */
    if (metodo === 'POST' && ruta === '/api/admin/codigo') {
      if (!adminClave) falla(404, 'Ruta desconocida');
      limitar(`admin-codigo:${ip}`, 10, 10 * MIN);
      const email = normalizarEmail(texto(cuerpo?.email, 120));
      const t0 = reloj();
      db.adminCodigosLimpiar(t0 - DIA);
      if (email && esAdmin(email)) {
        limitar(`admin-codigo-email:${email}`, 5, 10 * MIN);
        /* Seis dígitos sacados del generador de siempre, sin sesgo. */
        const codigo = String(randomBytes(4).readUInt32BE(0) % 1000000).padStart(6, '0');
        db.adminCodigoGuardar({ email, hash: hash(codigo), vence: t0 + ADMIN_CODIGO_MS, t: t0 });
        correo.enviar({
          tipo: 'trastienda', para: email,
          ...plantillas.codigoTrastienda({ codigo, minutos: ADMIN_CODIGO_MS / MIN, ip }),
        });
        contar('trastienda:codigo');
      }
      return [202, { ok: true }];
    }

    /* Entrar: con el código que llegó al email, o con la clave del servidor
       (que es como entran las herramientas y la fábrica). */
    if (metodo === 'POST' && ruta === '/api/admin/sesion') {
      if (!adminClave) falla(404, 'Ruta desconocida');
      limitar(`admin-entrar:${ip}`, 10, 10 * MIN);
      const t0 = reloj();
      let email = '';

      if (cuerpo?.codigo !== undefined) {
        email = normalizarEmail(texto(cuerpo?.email, 120));
        /* Seis dígitos son un millón de posibilidades. Cinco intentos por
           código y cinco códigos cada diez minutos dejarían probar 3600 por
           día desde muchas IPs, y admin@ se adivina. Con este tope, un email
           aguanta ADMIN_FALLOS_DIA errores por día en total y después sólo se
           entra con la clave del servidor hasta el día siguiente. */
        const fallos = fallosCodigo.get(email);
        if (fallos && t0 - fallos.desde < DIA && fallos.n >= ADMIN_FALLOS_DIA) {
          falla(429, 'Demasiados códigos equivocados para este email hoy. Probá mañana o entrá con la clave del servidor.',
            { reintentar_en: Math.ceil((DIA - (t0 - fallos.desde)) / 1000) });
        }
        const anotarFallo = () => {
          const f = fallosCodigo.get(email);
          if (!f || t0 - f.desde >= DIA) fallosCodigo.set(email, { desde: t0, n: 1 });
          else f.n += 1;
        };
        const guardado = email ? db.adminCodigo(email) : null;
        const codigo = texto(cuerpo?.codigo, 12).replace(/\D/g, '');
        if (!guardado || guardado.vence < t0) falla(401, 'Ese código no sirve: pedí uno nuevo.');
        if (guardado.intentos >= ADMIN_CODIGO_INTENTOS) {
          db.adminCodigoBorrar(email);
          falla(429, 'Demasiados intentos con ese código: pedí uno nuevo.');
        }
        if (!igualesSeguro(hash(codigo), guardado.hash)) {
          db.adminCodigoIntento(email);
          anotarFallo();
          falla(401, 'Ese código no sirve: pedí uno nuevo.');
        }
        /* Un código sirve una sola vez, y el rol se vuelve a mirar acá: si le
           sacaron el rol entre que pidió el código y lo usó, no entra. */
        db.adminCodigoBorrar(email);
        if (!esAdmin(email)) falla(401, 'Ese código no sirve: pedí uno nuevo.');
      } else {
        const clave = String(cuerpo?.clave || '');
        if (!clave || !igualesSeguro(hash(clave), hash(adminClave))) falla(401, 'Clave de administración inválida');
      }

      const token = randomBytes(32).toString('hex');
      const vence = t0 + ADMIN_SESION_MS;
      sesionesAdmin.set(hash(token), { vence, email });
      /* Las que ya vencieron no se quedan ocupando memoria. */
      for (const [h, v] of sesionesAdmin) if (v.vence < t0) sesionesAdmin.delete(h);
      contar('trastienda:entrar');
      return [201, { token, vence, email }];
    }
    if (ruta.startsWith('/api/admin/')) return administrar({ metodo, ruta, query, cuerpo, headers, ip });

    if (metodo === 'GET' && ruta === '/api/config') {
      return [200, {
        version,
        ia: ia?.proveedor || 'ninguna',
        /* Si las funciones de IA se muestran: con una IA de verdad, o en
           desarrollo con la simulada. */
        ia_visible: iaVisible(),
        /* Para que el emulador verifique las actualizaciones como la placa. */
        firmware_publica: firmwarePublica || null,
        push: Boolean(push),
        url_publica: urlPublica(),
        probabilidades: PROBABILIDADES,
        clave_min: CLAVE_MIN,
        chat_max: CHAT_MAX,
        cuotas: presupuesto.limitesDe({ plan: 'gratis' }),
      }];
    }

    /* Afuera sólo dice que está vivo. Cuántas cuentas, aparatos y lecturas hay
       es información del negocio: la ve quien pregunta desde el mismo
       servidor (el instalador, un curl por SSH), y la trastienda. */
    if (metodo === 'GET' && ruta === '/api/salud') {
      if (!local) return [200, { ok: true, version, esquema: db.version() }];
      return [200, { ok: true, version, esquema: db.version(), activo_s: Math.round(process.uptime()), ...db.contar() }];
    }

    if (metodo === 'GET' && ruta === '/api/especies') return [200, ESPECIES];

    /* --- cuenta ------------------------------------------------------- */
    if (metodo === 'POST' && ruta === '/api/cuenta/registro') {
      limitar(`registro:${ip}`, 10, H);
      const email = normalizarEmail(cuerpo?.email);
      if (!emailValido(email)) falla(400, 'Ese email no es válido.');
      const clave = validarClaveNueva(cuerpo?.clave);
      if (db.cuentaPorEmail(email)) falla(409, 'Ya hay una cuenta con ese email. Entrá con tu contraseña.');
      const c = {
        id: nuevoId('c'), email, nombre: texto(cuerpo?.nombre, 40), clave_hash: await claves.hash(clave),
        tz: cuerpo?.tz && zonaValida(cuerpo.tz) ? texto(cuerpo.tz, 64) : TZ_POR_DEFECTO,
        coleccion: [], creada: t,
      };
      try {
        db.cuentaCrear(c);
      } catch {
        falla(409, 'Ya hay una cuenta con ese email. Entrá con tu contraseña.');
      }
      const creada = db.cuenta(c.id);
      mandarVerificacion(creada);
      return [201, await abrirSesion(creada, headers)];
    }

    if (metodo === 'POST' && ruta === '/api/cuenta/entrar') {
      const email = normalizarEmail(cuerpo?.email);
      limitar(`entrar:${ip}`, 30, 15 * MIN);
      limitar(`entrar:${email}`, 10, 15 * MIN);
      const clave = String(cuerpo?.clave ?? '');
      const c = emailValido(email) ? db.cuentaPorEmail(email) : null;
      /* Mismo trabajo exista o no la cuenta: la respuesta no dice qué emails
         están registrados. */
      const bien = c ? await claves.verificar(clave, c.clave_hash) : await claves.verificarFalso(clave);
      if (!c || !bien) falla(401, 'Email o contraseña incorrectos.');
      if (claves.hayQueRehacer(c.clave_hash)) {
        db.cuentaActualizar(c.id, { clave_hash: await claves.hash(clave) });
      }
      return [200, await abrirSesion(db.cuenta(c.id), headers)];
    }

    if (metodo === 'POST' && ruta === '/api/cuenta/salir') {
      const token = bearer(headers);
      if (token) db.sesionBorrar(hash(token));
      return [204, null];
    }

    if (metodo === 'POST' && ruta === '/api/cuenta/olvide') {
      const email = normalizarEmail(cuerpo?.email);
      limitar(`olvide:${ip}`, 10, H);
      if (!emailValido(email)) falla(400, 'Ese email no es válido.');
      limitar(`olvide:${email}`, 3, H);
      const c = db.cuentaPorEmail(email);
      if (c) {
        const token = tokenNuevo();
        db.tokenCuentaCrear(hash(token), c.id, 'restablecer', t, t + RESTABLECER_VENCE_MS);
        correo.enviar({
          tipo: 'restablecer', para: c.email,
          ...plantillas.restablecerClave({
            nombre: c.nombre, url: enlace(`clave/${token}`), minutos: RESTABLECER_VENCE_MS / MIN, paleta: c.paleta,
          }),
        });
      }
      /* La misma respuesta exista o no: no se puede usar para averiguar
         quién tiene cuenta. */
      return [202, { ok: true }];
    }

    if (ruta === '/api/cuenta/restablecer' && metodo === 'GET') {
      limitar(`restablecer:${ip}`, 30, 15 * MIN);
      return [200, { valido: db.tokenCuentaVigente(hash(String(query.token || '')), 'restablecer', t) }];
    }

    if (ruta === '/api/cuenta/restablecer' && metodo === 'POST') {
      limitar(`restablecer:${ip}`, 30, 15 * MIN);
      /* La contraseña se valida ANTES de gastar el enlace: una contraseña
         corta no puede quemar un enlace de un solo uso. */
      const clave = validarClaveNueva(cuerpo?.clave);
      const id = db.tokenCuentaUsar(hash(String(cuerpo?.token || '')), 'restablecer', t);
      const c = id ? db.cuenta(id) : null;
      if (!c) falla(400, 'Este enlace ya no sirve: venció o ya se usó. Pedí uno nuevo.');
      db.cuentaActualizar(c.id, { clave_hash: await claves.hash(clave), email_verificado: c.email_verificado || t });
      /* Quien tenía la sesión abierta con la contraseña vieja, la pierde. */
      db.sesionesBorrarTodas(c.id);
      mandarClaveCambiada(c);
      return [200, await abrirSesion(db.cuenta(c.id), headers)];
    }

    if (metodo === 'POST' && ruta === '/api/cuenta/verificar') {
      limitar(`verificar:${ip}`, 30, 15 * MIN);
      const id = db.tokenCuentaUsar(hash(String(cuerpo?.token || '')), 'verificar', t);
      if (!id || !db.cuenta(id)) falla(400, 'Este enlace ya no sirve: venció o ya se usó.');
      db.cuentaActualizar(id, { email_verificado: t });
      return [200, { ok: true }];
    }

    if (metodo === 'POST' && ruta === '/api/cuenta/verificar/reenviar') {
      const c = cuentaDe(headers);
      if (c.email_verificado) return [200, { ok: true, verificado: true }];
      limitar(`reenviar:${c.id}`, 3, H);
      mandarVerificacion(c);
      return [202, { ok: true }];
    }

    if (ruta === '/api/cuenta' && (metodo === 'GET' || metodo === 'PATCH')) {
      const c = cuentaDe(headers);
      if (metodo === 'PATCH') {
        const cambios = {};
        if (cuerpo?.nombre !== undefined) cambios.nombre = texto(cuerpo.nombre, 40);
        if (cuerpo?.tz) {
          if (!zonaValida(cuerpo.tz)) falla(400, 'Zona horaria inválida.');
          cambios.tz = texto(cuerpo.tz, 64);
        }
        if (cuerpo?.paleta !== undefined) {
          const pal = paletaPorId(cuerpo.paleta || PALETA_POR_DEFECTO);
          if (!pal) falla(400, 'Esa paleta no existe.');
          if (pal.rooti && !(c.coleccion || []).includes(pal.id)) {
            falla(403, `La paleta ${pal.nombre} es una piel: sale del cofre de un ${modeloPorId(pal.rooti)?.nombre || 'Rooti'}.`);
          }
          /* Las cosméticas se ganan cuidando: el servidor lo verifica con
             lo que sabe (la colección y los días sanos de cada planta). */
          if (pal.requisito && !cumpleRequisito(pal.requisito, logrosDe(c))) {
            falla(403, `La paleta ${pal.nombre} se gana con ${pal.desbloqueo}.`);
          }
          cambios.paleta = pal.id;
        }
        /* La ciudad donde están las plantas, para el pronóstico: se busca
           en Open-Meteo y se guarda con sus coordenadas; vacío la quita. */
        if (cuerpo?.ubicacion !== undefined) {
          const nombre = texto(cuerpo.ubicacion, 80);
          if (!nombre) {
            cambios.ubicacion = null;
          } else {
            if (!clima.activo) falla(503, 'El pronóstico no está configurado en este servidor.');
            limitar(`ubicacion:${c.id}`, 20, H);
            let u = null;
            try { u = await clima.geocodificar(nombre); } catch { falla(502, 'No pude buscar esa ciudad ahora. Probá en un rato.'); }
            if (!u) falla(404, 'No encontré esa ciudad. Probá con el nombre de la ciudad más cercana.');
            cambios.ubicacion = u;
          }
          db.climaBorrar(c.id);
        }
        db.cuentaActualizar(c.id, cambios);
      }
      return [200, cuentaPublica(db.cuenta(c.id))];
    }

    if (metodo === 'POST' && ruta === '/api/cuenta/clave') {
      const c = cuentaDe(headers);
      limitar(`clave:${c.id}`, 10, 15 * MIN);
      if (!(await claves.verificar(String(cuerpo?.actual ?? ''), c.clave_hash))) {
        falla(401, 'La contraseña actual no es correcta.');
      }
      const nueva = validarClaveNueva(cuerpo?.nueva);
      db.cuentaActualizar(c.id, { clave_hash: await claves.hash(nueva) });
      /* Cambiar la contraseña cierra las demás sesiones: si alguien la
         conocía, deja de tener acceso en ese momento. */
      db.sesionesBorrarOtras(c.id, hash(bearer(headers)));
      mandarClaveCambiada(c);
      return [200, { ok: true }];
    }

    if (metodo === 'DELETE' && ruta === '/api/cuenta') {
      const c = cuentaDe(headers);
      limitar(`borrar:${c.id}`, 5, 15 * MIN);
      if (!(await claves.verificar(String(cuerpo?.clave ?? ''), c.clave_hash))) {
        falla(401, 'La contraseña no es correcta.');
      }
      db.cuentaBorrar(c.id);
      return [204, null];
    }

    /* --- métricas: contadores anónimos por día ---------------------------- */
    if (metodo === 'POST' && ruta === '/api/evento') {
      limitar(`evento:${ip}`, 240, H);
      const [tipo, nombre] = String(cuerpo?.evento || '').split(':');
      const valido = (tipo === 'alta' && EVENTOS_ALTA.includes(nombre)) || (tipo === 'vista' && EVENTOS_VISTA.includes(nombre));
      if (!valido) falla(400, 'Evento desconocido');
      contar(`${tipo}:${nombre}`);
      return [204, null];
    }

    /* --- vínculo ---------------------------------------------------------- */
    if (metodo === 'GET' && (m = ruta.match(/^\/api\/vinculo\/([^/]+)$/))) {
      limitar(`vinculo:${ip}`, 90, MIN);
      let crudo;
      try { crudo = decodeURIComponent(m[1]); } catch { crudo = ''; }
      const codigo = normalizarCodigo(crudo);
      if (!codigo) falla(400, 'Ese código no es válido');
      const cuenta = cuentaDe(headers, false);
      const d = db.dispositivoPorCodigo(codigo);
      const planta = d?.planta ? db.planta(d.planta) : null;
      const mio = Boolean(planta && cuenta && planta.cuenta === cuenta.id);
      return [200, {
        codigo, legible: codigoLegible(codigo), ssid: ssidDe(codigo),
        visto: Boolean(d),
        en_linea: Boolean(d && t - d.visto < EN_LINEA_MS),
        libre: !planta,
        mio,
        planta: mio ? planta.id : null,
        estado: d?.estado || null,
        /* Qué Rooti es: la app lo reconoce antes del cofre. */
        persona: d ? (() => { const m = modeloPorId(personaDeAparato(d)); return { id: m.id, nombre: m.nombre, lema: m.lema }; })() : null,
      }];
    }

    if (metodo === 'POST' && ruta === '/api/vinculo') {
      const cuenta = cuentaDe(headers);
      limitar(`vincular:${cuenta.id}`, 20, MIN);
      const codigo = normalizarCodigo(cuerpo?.codigo);
      if (!codigo) falla(400, 'Ese código no es válido');
      const d = db.dispositivoPorCodigo(codigo);
      if (!d) falla(409, 'Tu Rooti todavía no se conectó. Terminá el paso del wifi.');
      if (d.planta) {
        const p = db.planta(d.planta);
        if (p && p.cuenta === cuenta.id) return [200, nodoDe(p, t)];
        if (p) falla(409, 'Ese Rooti ya es de otra cuenta.');
      }
      const p = {
        id: nuevoId('p'), cuenta: cuenta.id, dispositivo: d.id, epoca: d.epoca, creada: t,
        persona: personaDeAparato(d), rareza: 'comun', revelado: false, nombre: '', especie: null,
        pantalla: 'toque', brillo: 80, vinculo: vinculoInicial(),
      };
      db.transaccion(() => {
        db.plantaCrear(p);
        db.dispositivoGuardar({ ...d, planta: p.id });
      });
      contar('vinculo');
      return [201, nodoDe(db.planta(p.id), t)];
    }

    /* --- estado y plantas ------------------------------------------------ */
    if (metodo === 'GET' && ruta === '/api/estado') {
      const cuenta = cuentaDe(headers);
      const plantas = db.plantasDe(cuenta.id);
      const propias = plantas.map((p) => p.especie).filter((e) => e && !especiePorId(e.id));
      const tablero = {
        cuenta: cuentaPublica(cuenta),
        nodes: plantas.map((p) => nodoDe(p, t)),
        especies: [...ESPECIES, ...propias],
        coleccion: coleccionDe(cuenta),
        avisos: db.suscripciones(cuenta.id).length,
      };
      /* El tablero se relee cada quince segundos y casi nunca cambia. Lo que
         cambia siempre es el tiempo: la edad de la lectura en segundos y la
         espera de la caricia. La firma los mide como los mide la pantalla
         ("hace 3 min", "está esperando o no"), la misma regla con la que la
         app decide si repinta (public/lib/model.mjs): así una lectura igual
         vuelve como un `304` vacío en vez de once kilobytes. */
      return [200, tablero, { firma: firmaTablero(tablero.nodes) + JSON.stringify([tablero.cuenta, tablero.especies, tablero.coleccion, tablero.avisos]) }];
    }

    if ((m = ruta.match(/^\/api\/plantas\/([A-Za-z0-9]+)$/))) {
      const cuenta = cuentaDe(headers);
      const p = plantaMia(cuenta, m[1]);
      if (metodo === 'GET') return [200, nodoDe(p, t)];
      if (metodo === 'PATCH') {
        if (cuerpo?.nombre !== undefined) {
          const n = texto(cuerpo.nombre, 20);
          if (!n) falla(400, 'Ponele un nombre');
          p.nombre = n;
        }
        if (cuerpo?.especie !== undefined) {
          let e;
          if (typeof cuerpo.especie === 'string') {
            e = especiePorId(cuerpo.especie);
            if (!e) falla(400, 'Especie desconocida');
          } else {
            const v = validarEspecie(cuerpo.especie);
            if (!v) falla(400, 'Los rangos de esa especie no son coherentes');
            e = especiePorId(v.id) || v;
          }
          p.especie = e;
          /* Con la especie nace la ficha: con los cuidados del reconocimiento
             si la foto dio esta misma especie, o sólo con los rangos. */
          const cuidados = p.identificacion?.especie?.id === e.id ? p.identificacion.cuidados : null;
          p.ficha = fichaDePlanta(e, cuidados);
        }
        if (cuerpo?.pantalla !== undefined) {
          if (!['toque', 'siempre'].includes(cuerpo.pantalla)) falla(400, 'Modo de pantalla inválido');
          p.pantalla = cuerpo.pantalla;
        }
        if (cuerpo?.brillo !== undefined) {
          p.brillo = Math.min(100, Math.max(10, entero(cuerpo.brillo, 80)));
        }
        /* La calibración del sensor de tierra: null vuelve a la de fábrica. */
        if (cuerpo?.calibracion !== undefined) {
          if (cuerpo.calibracion === null) {
            p.calibracion = null;
          } else {
            const error = errorDeCalibracion(cuerpo.calibracion);
            if (error) falla(400, error);
            p.calibracion = { ...normalizarCalibracion(cuerpo.calibracion), t };
            contar('calibracion');
          }
          p.calibrando = null;
        }
        if (cuerpo?.maceta !== undefined) {
          if (cuerpo.maceta === null) {
            p.maceta = null;
          } else {
            const maceta = normalizarMaceta(cuerpo.maceta);
            if (!maceta) falla(400, 'El diámetro de la maceta va en centímetros, entre 5 y 80.');
            p.maceta = maceta;
          }
        }
        if (cuerpo?.nombre !== undefined || cuerpo?.especie !== undefined) prepararPrompt(p);
        db.plantaGuardar(p);
        return [200, nodoDe(p, t)];
      }
      if (metodo === 'DELETE') {
        db.plantaDesvincular(p.id, t);
        return [204, null];
      }
    }

    /* Calibrando: durante diez minutos el Rooti mide y cuenta cada pocos
       segundos, para que la app muestre el número crudo en vivo. */
    if (metodo === 'POST' && (m = ruta.match(/^\/api\/plantas\/([A-Za-z0-9]+)\/calibrar$/))) {
      const cuenta = cuentaDe(headers);
      const p = plantaMia(cuenta, m[1]);
      limitar(`calibrar:${cuenta.id}`, 30, H);
      p.calibrando = cuerpo?.activo === false ? null : t + CALIBRANDO_MS;
      db.plantaGuardar(p);
      return [200, nodoDe(p, t)];
    }

    /* El cofre: sortea la PIEL del Rooti que ya se sabe cuál es. Una sola vez
       por vínculo; abrirlo de nuevo devuelve lo que salió. */
    const cofre = metodo !== 'POST' ? null
      : ruta === '/api/cofre/abrir' ? [ruta, String(cuerpo?.planta || '')]
        : ruta.match(/^\/api\/plantas\/([A-Za-z0-9]+)\/cofre$/);
    if (cofre) {
      const cuenta = cuentaDe(headers);
      const p = plantaMia(cuenta, cofre[1]);
      const d = db.dispositivo(p.dispositivo);
      let nuevo = false;
      let paleta = null;
      if (!p.revelado) {
        p.persona = p.persona || personaDeAparato(d);
        p.rareza = sortearRareza(azar);
        p.revelado = true;
        p.revelada_en = t;
        p.mascota = mascotaNueva(t);
        const coleccion = cuenta.coleccion || [];
        const piel = idPiel(p.persona, p.rareza);
        if (!coleccion.includes(piel)) {
          coleccion.push(piel);
          nuevo = true;
        }
        contar(`cofre:${p.rareza}`);
        /* La piel pinta la app con sus colores. */
        paleta = paletaDeRooti(p.persona, p.rareza)?.id || null;
        db.transaccion(() => {
          db.plantaGuardar(p);
          db.cuentaActualizar(cuenta.id, { coleccion, ...(paleta ? { paleta } : {}) });
        });
      }
      const modelo = modeloPorId(p.persona);
      const piel = modelo.pieles[p.rareza] || modelo.pieles.comun;
      return [200, {
        id: modelo.id, nombre: modelo.nombre, lema: modelo.lema,
        rareza: p.rareza, piel: { ...piel, id: idPiel(modelo.id, p.rareza) }, fondo: piel.fondo,
        nuevo, probabilidad: probabilidadDe(p.rareza),
        de_fabrica: Boolean(normalizarPersona(d?.persona_fabrica)), planta: nodoDe(p, t),
        paleta: paletaDeRooti(modelo.id, p.rareza)?.id || null, pinta: Boolean(paleta),
      }];
    }

    /* --- la mascota -------------------------------------------------------- */
    if (metodo === 'POST' && (m = ruta.match(/^\/api\/plantas\/([A-Za-z0-9]+)\/mascota$/))) {
      const cuenta = cuentaDe(headers);
      const p = plantaMia(cuenta, m[1]);
      if (!p.revelado) falla(409, 'Primero abrí el cofre: todavía está dormido.');
      const accion = String(cuerpo?.accion || '');
      if (!ACCIONES.includes(accion)) falla(400, 'Ese gesto no existe.');
      limitar(`mascota:${cuenta.id}`, 240, H);
      const r = aplicarGesto(normalizarMascota(p.mascota, p.revelada_en || t), accion, t);
      if (!r.ok) {
        falla(409, r.motivo === 'sin-gotas'
          ? 'No quedan gotas de rocío: se ganan con la planta cómoda.'
          : 'No hay polvo que limpiar.');
      }
      p.mascota = r.mascota;
      db.plantaGuardar(p);
      contar(`mascota:${accion}`);
      return [200, { accion, suma: r.suma, motivo: r.motivo, mascota: mascotaPublica(r.mascota, t) }];
    }

    if (metodo === 'GET' && (m = ruta.match(/^\/api\/plantas\/([A-Za-z0-9]+)\/historial$/))) {
      const cuenta = cuentaDe(headers);
      const p = plantaMia(cuenta, m[1]);
      const horas = Math.min(24 * 366, Math.max(1, entero(query.horas, 48)));
      const todas = db.lecturasDePlanta(p.id, t - horas * H);
      const paso = Math.max(1, Math.ceil(todas.length / 240));
      const puntos = todas.filter((_, i) => i % paso === 0 || i === todas.length - 1).map((l) => ({
        t: l.t, soil_pct: l.suelo, temp_dc: l.temp, rh_pct: l.hr, lux: l.lux, mood: l.animo, ...(l.escurre ? { escurre: true } : {}),
      }));
      return [200, { id: p.id, horas, total: todas.length, puntos }];
    }

    if (metodo === 'GET' && (m = ruta.match(/^\/api\/plantas\/([A-Za-z0-9]+)\/prevision$/))) {
      const cuenta = cuentaDe(headers);
      const p = plantaMia(cuenta, m[1]);
      if (!cuenta.ubicacion) return [200, { disponible: false, motivo: 'ubicacion' }];
      const pron = await climaDe(cuenta, t);
      if (!pron) return [200, { disponible: false, motivo: 'clima', ubicacion: ubicacionPublica(cuenta) }];
      return [200, { ...previsionDePlanta(p, pron, t), ubicacion: ubicacionPublica(cuenta) }];
    }

    /* --- el álbum ---------------------------------------------------------- */
    if ((m = ruta.match(/^\/api\/plantas\/([A-Za-z0-9]+)\/fotos(?:\/([0-9]+))?$/))) {
      const cuenta = cuentaDe(headers);
      const p = plantaMia(cuenta, m[1]);
      if (metodo === 'GET' && !m[2]) return [200, { fotos: db.fotosDe(p.id).map(fotoPublica), maximo: FOTOS_MAX }];
      if (metodo === 'POST' && !m[2]) {
        limitar(`fotos:${cuenta.id}`, 120, H);
        const id = guardarFoto(cuenta, p, cuerpo || {}, t, { nota: cuerpo?.nota });
        return [201, { id, t }];
      }
      if (metodo === 'GET' && m[2]) {
        const f = db.foto(Number(m[2]), p.id);
        if (!f) falla(404, 'No existe esa foto');
        /* Bytes, no JSON: el transporte los manda tal cual (http.mjs). */
        return [200, { binario: Buffer.from(f.bytes), mime: f.mime, cache: 'private, max-age=31536000, immutable' }];
      }
      if (metodo === 'DELETE' && m[2]) {
        db.fotoBorrar(Number(m[2]), p.id);
        return [204, null];
      }
    }

    /* --- el cuidador ------------------------------------------------------- */
    if ((m = ruta.match(/^\/api\/plantas\/([A-Za-z0-9]+)\/cuidador$/))) {
      const cuenta = cuentaDe(headers);
      const p = plantaMia(cuenta, m[1]);
      if (metodo === 'GET') {
        return [200, { enlaces: db.cuidadoresDe(p.id, t).map(cuidadorPublico), riegos: db.riegosDe(p.id, t - 15 * DIA) }];
      }
      if (metodo === 'POST') {
        if (!p.revelado) falla(409, 'Abrí el cofre primero: el cuidador tiene que ver su cara.');
        const dias = entero(cuerpo?.dias, 7);
        if (!CUIDADOR_DIAS.includes(dias)) falla(400, 'El enlace dura 3, 7 o 15 días.');
        limitar(`cuidador:${cuenta.id}`, 20, H);
        const token = tokenNuevo();
        const nombre = texto(cuerpo?.nombre, 30);
        const vence = t + dias * DIA;
        db.cuidadorCrear({ token_hash: hash(token), planta: p.id, cuenta: cuenta.id, nombre, creado: t, vence });
        contar('cuidador');
        return [201, { url: `${urlPublica().replace(/\/+$/, '')}/sitter/${token}`, vence, dias, nombre }];
      }
      if (metodo === 'DELETE') {
        db.cuidadoresBorrar(p.id);
        return [204, null];
      }
    }
    if ((m = ruta.match(/^\/api\/sitter\/([A-Za-z0-9_-]{16,128})(\/riego)?$/))) {
      limitar(`sitter:${ip}`, 120, 10 * MIN);
      const c = db.cuidadorPorHash(hash(m[1]), t);
      const p = c ? db.planta(c.planta) : null;
      if (!c || !p) falla(404, 'Este enlace venció o no existe. Pedile uno nuevo a quien te lo mandó.');
      const dueno = db.cuenta(c.cuenta);
      if (metodo === 'GET' && !m[2]) {
        return [200, {
          planta: plantaParaCuidador(nodoDe(p, t)), dueno: dueno?.nombre || '', cuidador: c.nombre,
          vence: c.vence, riegos: db.riegosDe(p.id, t - 15 * DIA), ahora: t,
        }];
      }
      if (metodo === 'POST' && m[2]) {
        limitar(`sitter-riego:${c.token_hash}`, 10, H);
        const quien = c.nombre || texto(cuerpo?.quien, 30) || 'Tu cuidador';
        db.riegoRegistrar({ planta: p.id, t, origen: 'cuidador', quien });
        db.cuidadorUso(c.token_hash);
        if (push) {
          await mandarA(db.suscripciones(c.cuenta), {
            titulo: `${quien} regó a ${p.nombre || 'tu planta'}`,
            cuerpo: 'Quedó anotado. Si el sensor no ve el agua en un par de horas, te aviso.',
            icono: `caras/${p.persona || 'brote'}-${p.rareza || 'comun'}-HAPPY.png`, url: `#planta/${p.id}`, tag: `${p.id}:cuidador`, urgente: false,
          });
        }
        return [201, { ok: true, t }];
      }
    }

    /* --- chat con la planta ------------------------------------------------ */
    if ((m = ruta.match(/^\/api\/plantas\/([A-Za-z0-9]+)\/chat$/)) && (metodo === 'GET' || metodo === 'POST')) {
      const cuenta = cuentaDe(headers);
      const p = plantaMia(cuenta, m[1]);
      const disponible = Boolean(p.especie && p.nombre && p.revelado) && iaVisible();
      if (metodo === 'GET') {
        return [200, {
          disponible,
          ...(iaVisible() ? {} : { motivo: 'ia' }),
          mensajes: db.chatDe(p.id, 60),
          cuota: presupuesto.cuota(cuenta, 'chat'),
          plan: cuenta.plan,
          ia: ia.proveedor,
        }];
      }
      limitar(`chat:${cuenta.id}`, 12, MIN);
      if (!iaVisible()) falla(503, 'La charla con la planta todavía no está disponible en este servidor.');
      if (!disponible) falla(409, 'Para charlar, tu planta necesita nombre y especie. Sacale una foto primero.');
      const mensaje = texto(cuerpo?.texto, CHAT_MAX + 1);
      if (!mensaje) falla(400, 'Escribí algo.');
      if (mensaje.length > CHAT_MAX) falla(400, `Como mucho ${CHAT_MAX} caracteres.`);
      presupuesto.verificarCuota(cuenta, 'chat');
      const sinPrompt = !p.prompt;
      if (sinPrompt) {
        if (!p.ficha) p.ficha = fichaDePlanta(p.especie, p.identificacion?.especie?.id === p.especie.id ? p.identificacion.cuidados : null);
        prepararPrompt(p);
      }
      const nodo = nodoDe(p, t);
      const contexto = contextoVivo({
        nodo, especie: p.especie, lecturas: db.lecturasDePlanta(p.id, t - DIA), t, tz: cuenta.tz, persona: cuenta.nombre,
      });
      const historial = db.chatDe(p.id, 10);
      const r = await conIA({
        cuenta, planta: p.id, tipo: 'chat', modelo: ia.modeloChat,
        entrada: Math.ceil((p.prompt.length + contexto.length + historial.reduce((s, x) => s + x.texto.length, 0) + mensaje.length) / 3),
        llamada: () => ia.conversar({ nombre: p.nombre, prompt: p.prompt, contexto, historial, mensaje }),
      });
      const tuyo = { t, rol: 'persona', texto: mensaje };
      const suyo = { t: t + 1, rol: 'planta', texto: r.texto };
      db.transaccion(() => {
        if (sinPrompt) db.plantaGuardar(p);
        db.chatAgregar({ planta: p.id, cuenta: cuenta.id, ...tuyo });
        db.chatAgregar({ planta: p.id, cuenta: cuenta.id, ...suyo });
      });
      contar('chat');
      return [200, { mensajes: [tuyo, suyo], cuota: presupuesto.cuota(cuenta, 'chat'), fuente: r.fuente }];
    }

    /* --- IA con foto ------------------------------------------------------ */
    if (metodo === 'POST' && ruta === '/api/identificar') {
      const cuenta = cuentaDe(headers);
      limitar(`ia:${cuenta.id}`, 30, H);
      if (!iaVisible()) falla(503, 'El reconocimiento por foto todavía no está disponible: elegí la especie de la lista.');
      if (!cuerpo?.planta) falla(403, 'Para reconocer una planta primero registrá un Rooti.');
      const p = plantaMia(cuenta, String(cuerpo.planta));
      if (!p.revelado) falla(409, 'Abrí el cofre de tu Rooti antes de reconocer la planta.');
      const foto = { image_b64: cuerpo?.image_b64, mime: cuerpo?.mime };
      const error = validarFoto(foto);
      if (error) falla(400, error);
      presupuesto.verificarCuota(cuenta, 'identificar', p.id);
      const r = await conIA({
        cuenta, planta: p.id, tipo: 'identificar', modelo: ia.modelo, entrada: 3500,
        llamada: () => ia.identificar(foto),
      });
      p.identificacion = { especie: r.especie, cuidados: r.cuidados || null, t, fuente: r.fuente };
      db.plantaGuardar(p);
      guardarFotoSilenciosa(cuenta, p, foto, t, 'reconocimiento');
      contar('identificar');
      const { uso: _u, modelo: _m, cuidados: _c, ...publico } = r;
      return [200, { ...publico, cuota: presupuesto.cuota(cuenta, 'identificar', p.id) }];
    }

    if (metodo === 'POST' && ruta === '/api/diagnosticar') {
      const cuenta = cuentaDe(headers);
      limitar(`ia:${cuenta.id}`, 30, H);
      if (!iaVisible()) falla(503, 'El diagnóstico por foto todavía no está disponible en este servidor.');
      const p = plantaMia(cuenta, String(cuerpo?.planta || ''));
      const foto = { image_b64: cuerpo?.image_b64, mime: cuerpo?.mime };
      const error = validarFoto(foto);
      if (error) falla(400, error);
      presupuesto.verificarCuota(cuenta, 'diagnosticar', p.id);
      const d = db.dispositivo(p.dispositivo);
      const r = await conIA({
        cuenta, planta: p.id, tipo: 'diagnosticar', modelo: ia.modelo, entrada: 3000,
        llamada: () => ia.diagnosticar(foto, { tel: d?.ultima || null, especie: p.especie }),
      });
      guardarFotoSilenciosa(cuenta, p, foto, t, 'diagnostico');
      contar('diagnosticar');
      const { uso: _u, modelo: _m, ...publico } = r;
      return [200, { planta: p.id, ...publico, cuota: presupuesto.cuota(cuenta, 'diagnosticar', p.id) }];
    }

    /* --- colección ------------------------------------------------------- */
    if (metodo === 'GET' && ruta === '/api/coleccion') {
      return [200, coleccionDe(cuentaDe(headers))];
    }

    /* --- notificaciones -------------------------------------------------- */
    if (metodo === 'GET' && ruta === '/api/push/clave') {
      if (!push) falla(503, 'Las notificaciones no están configuradas');
      return [200, { clave: push.clavePublica }];
    }
    if (ruta === '/api/push/suscripcion' && (metodo === 'POST' || metodo === 'DELETE')) {
      const cuenta = cuentaDe(headers);
      const s = cuerpo?.suscripcion;
      const endpoint = String(s?.endpoint || cuerpo?.endpoint || '');
      if (metodo === 'DELETE') {
        if (endpoint.length > 1000) falla(400, 'Suscripción inválida');
        db.suscripcionBorrar(endpoint, cuenta.id);
      } else {
        /* Sólo servicios de avisos de verdad: el servidor le va a hacer un
           POST a esta URL, y no puede ser una que elija quien tiene cuenta
           (server/push.mjs). */
        if (!endpointPushValido(endpoint)) falla(400, 'Suscripción inválida');
        if (!s?.keys?.p256dh || !s?.keys?.auth) falla(400, 'Suscripción inválida');
        db.suscripcionGuardar(cuenta.id, {
          endpoint, keys: { p256dh: String(s.keys.p256dh).slice(0, 200), auth: String(s.keys.auth).slice(0, 100) },
        }, t);
      }
      return [200, { avisos: db.suscripciones(cuenta.id).length }];
    }
    if (metodo === 'POST' && ruta === '/api/push/probar') {
      const cuenta = cuentaDe(headers);
      if (!push) falla(503, 'Las notificaciones no están configuradas');
      limitar(`probar:${cuenta.id}`, 5, 10 * MIN);
      const p = db.plantasDe(cuenta.id).find((x) => x.revelado);
      let n = 0;
      for (const s of db.suscripciones(cuenta.id)) {
        const r = await push.enviar(s, {
          titulo: p ? `${p.nombre || 'Tu planta'} te saluda` : 'ROOTLAB',
          cuerpo: 'Así te vamos a avisar cuando tu planta necesite algo.',
          icono: p ? `caras/${p.persona}-${p.rareza || 'comun'}-HAPPY.png` : 'iconos/icono-192.png',
          url: './', tag: 'prueba',
        });
        if (r === 'vencida') db.suscripcionBorrar(s.endpoint);
        if (r === 'ok') n += 1;
      }
      return [200, { enviados: n }];
    }

    falla(404, 'Ruta desconocida');
    return [404, null];
  }

  return {
    async manejar(pedido) {
      try {
        return await manejar(pedido);
      } catch (e) {
        if (e instanceof ErrorApi) {
          return [e.codigo, { error: e.message, ...(e.reintentar_en ? { reintentar_en: e.reintentar_en } : {}) }];
        }
        /* Errores con código propio (cuotas y tope de la IA). */
        if (Number.isInteger(e.codigo) && e.codigo >= 400 && e.codigo < 600) {
          return [e.codigo, { error: e.message, ...(e.cuota ? { cuota: e.cuota } : {}) }];
        }
        console.error(e);
        return [500, { error: 'Error interno' }];
      }
    },
    revisar,
    nodoDe,
    correo,
    presupuesto,
  };
}
