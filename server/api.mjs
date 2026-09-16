/* api.mjs — toda la lógica del servidor, separada del transporte HTTP.
 *
 * Dos clientes, dos mundos:
 *
 *   EL APARATO   POST /api/d/sync, firmado con su token. Cuenta quién es,
 *                cómo está y qué midió; recibe todo lo que necesita saber.
 *                Contrato: root-kit/docs/nube.md y docs/api.md.
 *
 *   LA APP       /api/*, con la sesión de una CUENTA (email y contraseña).
 *                Cada cuenta ve sólo sus plantas. Vincula su Rooti, abre el
 *                cofre, bautiza, reconoce la especie, charla con la planta.
 *
 * `manejar()` recibe un pedido ya parseado y devuelve [código, cuerpo]. Así
 * los tests recorren el flujo completo —de la primera consulta del aparato
 * a la notificación de sed— sin abrir un socket.
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
  ESPECIES, MODELOS, FRASES, ANIMOS, especiePorId, modeloPorId, validarEspecie,
} from './catalogo.mjs';
import {
  normalizarCodigo, ssidDe, codigoLegible, hash, tokenNuevo, igualesSeguro,
} from './codigo.mjs';
import { abrirCofre, PROBABILIDADES, probabilidadDe } from './cofre.mjs';
import { avisosPendientes } from './avisos.mjs';
import {
  crearClima, tasaSecado, mediaReciente, factorClima, prevision as previsionDe, resumenPronostico,
  avisoPrevision, CLIMA_TTL_MS, VENTANA_TASA_MS,
} from './clima.mjs';
import { crearCripto } from './cripto.mjs';
import { crearClaves } from './claves.mjs';
import { crearCorreo } from './correo.mjs';
import { crearPresupuesto } from './presupuesto.mjs';
import { MAX_TOKENS, validarFoto } from './ia.mjs';
import { fichaDePlanta, promptDePlanta, contextoVivo } from './ficha.mjs';
import { normalizarEmail } from './db.mjs';
import { diaLocal, TZ_POR_DEFECTO } from './tiempo.mjs';
import * as plantillas from './plantillas-correo.mjs';
import { PALETA_POR_DEFECTO, paletaPorId, paletaDeRooti } from '../public/lib/paletas.mjs';

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
/* Un riego anotado a mano cuenta como reciente durante este tiempo. */
export const RIEGO_RECIENTE_MS = 48 * H;

class ErrorApi extends Error {
  constructor(codigo, mensaje) { super(mensaje); this.codigo = codigo; }
}
const falla = (codigo, mensaje) => { throw new ErrorApi(codigo, mensaje); };

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
  tofu = true,
  urlPublica = () => '',
  version = '0.1.0',
  clima = crearClima(),
} = {}) {
  const limites = new Map();

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
    if (l.n > max) falla(429, 'Demasiados intentos. Esperá unos minutos.');
  }

  const bearer = (headers) => {
    const a = headers?.authorization || headers?.Authorization || '';
    return a.startsWith('Bearer ') ? a.slice(7).trim() : '';
  };

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
    return {
      id: p.id,
      nombre: p.nombre || '',
      modelo: p.persona,
      revelado: Boolean(p.revelado),
      especie: p.especie?.id || null,
      especie_info: p.especie || null,
      ficha: p.ficha ? { cuidados: p.ficha.cuidados, dificultad: p.ficha.dificultad, fuente: p.ficha.fuente } : null,
      chat: Boolean(p.especie && p.nombre),
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
      } : null,
      bond: vinculoPublico(p.vinculo),
      pantalla: p.pantalla || 'toque',
      brillo: p.brillo ?? 80,
      creada: p.creada,
      riego: riegoRecienteDe(p.id, t),
    };
  }

  /* Lo que ve el cuidador: la planta sin ids ni nada de la cuenta. */
  function plantaParaCuidador(n) {
    const e = n.especie_info;
    return {
      id: 'cuidada',
      nombre: n.nombre, modelo: n.modelo, revelado: n.revelado,
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
  const ubicacionPublica = (c) => (c?.ubicacion ? { nombre: c.ubicacion.nombre, pais: c.ubicacion.pais, region: c.ubicacion.region || '' } : null);

  function coleccionDe(cuenta) {
    const tengo = cuenta.coleccion || [];
    const visibles = MODELOS.filter((m) => m.rareza !== 'SECRETO' || tengo.includes(m.id));
    return {
      tengo,
      total: MODELOS.filter((m) => m.rareza !== 'SECRETO').length,
      probabilidades: PROBABILIDADES,
      catalogo: visibles.map((m) => ({
        ...m, tengo: tengo.includes(m.id), probabilidad: probabilidadDe(m), paleta: paletaDeRooti(m.id)?.id || null,
      })),
    };
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
  /** Manda un aviso a todos los teléfonos de una cuenta. */
  async function mandarA(subs, a) {
    let n = 0;
    for (const s of subs) {
      const r = await push.enviar(s, {
        titulo: a.titulo, cuerpo: a.cuerpo, icono: a.icono, url: a.url, tag: a.tag, urgente: a.urgente,
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
    for (const a of lista) {
      n += await mandarA(subs, a);
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
    return n;
  }

  /* ----------------------------------------------------------- aparato --- */
  async function sync(cuerpo, headers) {
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
      if (!tofu) falla(401, 'aparato no registrado');
      d = { id: idDisp, token_hash: hash(token), creado: t, ultimo_reloj: -1, arranques: 0, planta: null };
    } else if (!igualesSeguro(d.token_hash, hash(token))) {
      falla(401, 'token inválido');
    }

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

    const persona = texto(cuerpo.persona, 15);
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
      persona_fabrica: modeloPorId(persona) ? persona : (d.persona_fabrica || null),
    });
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
    return [200, {
      ok: true,
      vinculado: Boolean(planta),
      revelado: Boolean(planta?.revelado),
      persona: planta?.persona || '',
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
      intervalo_s: INTERVALO_S,
      aceptadas: lecturas.length,
      hora: Math.floor(t / 1000),
      brillo: planta?.brillo ?? 80,
      pantalla: planta?.pantalla || 'toque',
    }];
  }

  /* -------------------------------------------------------------- rutas --- */
  async function manejar({ metodo, ruta, query = {}, cuerpo = null, headers = {}, ip = '' }) {
    const t = reloj();
    let m;

    if (metodo === 'POST' && ruta === '/api/d/sync') return sync(cuerpo, headers);

    if (metodo === 'GET' && ruta === '/api/config') {
      return [200, {
        version,
        ia: ia?.proveedor || 'ninguna',
        push: Boolean(push),
        url_publica: urlPublica(),
        probabilidades: PROBABILIDADES,
        clave_min: CLAVE_MIN,
        chat_max: CHAT_MAX,
        cuotas: presupuesto.limitesDe({ plan: 'gratis' }),
      }];
    }

    if (metodo === 'GET' && ruta === '/api/salud') {
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
          if (pal.rooti && !(c.coleccion || []).includes(pal.rooti)) {
            falla(403, `La paleta ${pal.nombre} es de su Rooti: conseguilo en un cofre para usarla.`);
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
        persona: null, revelado: false, nombre: '', especie: null,
        pantalla: 'toque', brillo: 80, vinculo: vinculoInicial(),
      };
      db.transaccion(() => {
        db.plantaCrear(p);
        db.dispositivoGuardar({ ...d, planta: p.id });
      });
      return [201, nodoDe(db.planta(p.id), t)];
    }

    /* --- estado y plantas ------------------------------------------------ */
    if (metodo === 'GET' && ruta === '/api/estado') {
      const cuenta = cuentaDe(headers);
      const plantas = db.plantasDe(cuenta.id);
      const propias = plantas.map((p) => p.especie).filter((e) => e && !especiePorId(e.id));
      return [200, {
        cuenta: cuentaPublica(cuenta),
        nodes: plantas.map((p) => nodoDe(p, t)),
        especies: [...ESPECIES, ...propias],
        coleccion: coleccionDe(cuenta),
        avisos: db.suscripciones(cuenta.id).length,
        hora: t,
      }];
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
        if (cuerpo?.nombre !== undefined || cuerpo?.especie !== undefined) prepararPrompt(p);
        db.plantaGuardar(p);
        return [200, nodoDe(p, t)];
      }
      if (metodo === 'DELETE') {
        db.plantaDesvincular(p.id, t);
        return [204, null];
      }
    }

    if (metodo === 'POST' && (m = ruta.match(/^\/api\/plantas\/([A-Za-z0-9]+)\/cofre$/))) {
      const cuenta = cuentaDe(headers);
      const p = plantaMia(cuenta, m[1]);
      const d = db.dispositivo(p.dispositivo);
      let nuevo = false;
      let paleta = null;
      if (!p.revelado) {
        const modelo = abrirCofre(d?.persona_fabrica, azar);
        p.persona = modelo.id;
        p.revelado = true;
        p.revelada_en = t;
        const coleccion = cuenta.coleccion || [];
        if (!coleccion.includes(modelo.id)) {
          coleccion.push(modelo.id);
          nuevo = true;
        }
        /* Un Rooti con paleta propia pinta la app con sus colores. */
        paleta = paletaDeRooti(modelo.id)?.id || null;
        db.transaccion(() => {
          db.plantaGuardar(p);
          db.cuentaActualizar(cuenta.id, { coleccion, ...(paleta ? { paleta } : {}) });
        });
      }
      const modelo = modeloPorId(p.persona);
      return [200, {
        ...modelo, nuevo, probabilidad: probabilidadDe(modelo),
        de_fabrica: Boolean(d?.persona_fabrica), planta: nodoDe(p, t),
        paleta: paletaDeRooti(modelo.id)?.id || null, pinta: Boolean(paleta),
      }];
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
            icono: `caras/${p.persona || 'incognito'}-HAPPY.png`, url: `#planta/${p.id}`, tag: `${p.id}:cuidador`, urgente: false,
          });
        }
        return [201, { ok: true, t }];
      }
    }

    /* --- chat con la planta ------------------------------------------------ */
    if ((m = ruta.match(/^\/api\/plantas\/([A-Za-z0-9]+)\/chat$/)) && (metodo === 'GET' || metodo === 'POST')) {
      const cuenta = cuentaDe(headers);
      const p = plantaMia(cuenta, m[1]);
      const disponible = Boolean(p.especie && p.nombre && p.revelado);
      if (metodo === 'GET') {
        return [200, {
          disponible,
          mensajes: db.chatDe(p.id, 60),
          cuota: presupuesto.cuota(cuenta, 'chat'),
          plan: cuenta.plan,
          ia: ia.proveedor,
        }];
      }
      limitar(`chat:${cuenta.id}`, 12, MIN);
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
      return [200, { mensajes: [tuyo, suyo], cuota: presupuesto.cuota(cuenta, 'chat'), fuente: r.fuente }];
    }

    /* --- IA con foto ------------------------------------------------------ */
    if (metodo === 'POST' && ruta === '/api/identificar') {
      const cuenta = cuentaDe(headers);
      limitar(`ia:${cuenta.id}`, 30, H);
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
      const { uso: _u, modelo: _m, cuidados: _c, ...publico } = r;
      return [200, { ...publico, cuota: presupuesto.cuota(cuenta, 'identificar', p.id) }];
    }

    if (metodo === 'POST' && ruta === '/api/diagnosticar') {
      const cuenta = cuentaDe(headers);
      limitar(`ia:${cuenta.id}`, 30, H);
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
      if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000) falla(400, 'Suscripción inválida');
      if (metodo === 'DELETE') {
        db.suscripcionBorrar(endpoint, cuenta.id);
      } else {
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
          icono: p ? `caras/${p.persona}-HAPPY.png` : 'iconos/icono-192.png',
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
        if (e instanceof ErrorApi) return [e.codigo, { error: e.message }];
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
