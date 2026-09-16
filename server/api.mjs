/* api.mjs — toda la lógica del servidor, separada del transporte HTTP.
 *
 * Dos clientes, dos mundos:
 *
 *   EL APARATO   POST /api/d/sync, firmado con su token. Cuenta quién es,
 *                cómo está y qué midió; recibe todo lo que necesita saber.
 *                Contrato: root-kit/docs/nube.md y docs/api.md.
 *
 *   LA APP       /api/*, con la sesión de una CUENTA (email y contraseña).
 *                Cada cuenta ve sólo sus plantas. Vincula, abre el cofre,
 *                bautiza, identifica y mira.
 *
 * `manejar()` recibe un pedido ya parseado y devuelve [código, cuerpo]. Así
 * los tests recorren el flujo completo —de la primera consulta del aparato
 * a la notificación de sed— sin abrir un socket. Los datos viven en SQLite
 * (server/db.mjs).
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import {
  ESPECIES, MODELOS, FRASES, ANIMOS, especiePorId, modeloPorId, validarEspecie,
} from './catalogo.mjs';
import {
  normalizarCodigo, ssidDe, codigoLegible, hash, tokenNuevo, igualesSeguro,
} from './codigo.mjs';
import { abrirCofre, PROBABILIDADES, probabilidadDe } from './cofre.mjs';
import { avisosPendientes } from './avisos.mjs';

const scrypt = promisify(scryptCb);

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
const TZ_POR_DEFECTO = 'America/Argentina/Buenos_Aires';

class ErrorApi extends Error {
  constructor(codigo, mensaje) { super(mensaje); this.codigo = codigo; }
}
const falla = (codigo, mensaje) => { throw new ErrorApi(codigo, mensaje); };

const entero = (v, def = 0) => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : def);
const texto = (v, max) => String(v ?? '').trim().slice(0, max);
const nuevoId = (prefijo) => `${prefijo}${randomBytes(6).toString('hex')}`;

/** Fecha local "AAAA-MM-DD" en la zona del usuario. */
export function diaLocal(ms, tz = TZ_POR_DEFECTO) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
      .format(new Date(ms));
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
}

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

/* ------------------------------------------------------------ contraseñas */
/* scrypt: lento a propósito y con sal por cuenta. Se guarda con sus
   parámetros para poder subirlos en el futuro sin invalidar las viejas. */
const SCRYPT = { N: 16384, r: 8, p: 1, largo: 64 };

export async function hashClave(clave) {
  const sal = randomBytes(16);
  const h = await scrypt(String(clave).normalize('NFKC'), sal, SCRYPT.largo,
    { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${sal.toString('base64')}$${h.toString('base64')}`;
}

export async function verificarClave(clave, guardado) {
  const partes = String(guardado || '').split('$');
  if (partes.length !== 6 || partes[0] !== 'scrypt') return false;
  const [, N, r, p, sal, h] = partes;
  const esperado = Buffer.from(h, 'base64');
  const calculado = await scrypt(String(clave).normalize('NFKC'), Buffer.from(sal, 'base64'), esperado.length,
    { N: Number(N), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 });
  return calculado.length === esperado.length && timingSafeEqual(calculado, esperado);
}

export const normalizarEmail = (e) => String(e || '').trim().toLowerCase();
export const emailValido = (e) => e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);

/* Hash falso para comparar cuando el email no existe: la respuesta tarda lo
   mismo y no deja adivinar qué emails tienen cuenta. */
let hashFalso = null;

export function crearApi({
  db,
  ia,
  push = null,
  reloj = () => Date.now(),
  azar,
  tofu = true,
  urlPublica = () => '',
  version = '0.1.0',
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
    };
  }

  function coleccionDe(cuenta) {
    const tengo = cuenta.coleccion || [];
    const visibles = MODELOS.filter((m) => m.rareza !== 'SECRETO' || tengo.includes(m.id));
    return {
      tengo,
      total: MODELOS.filter((m) => m.rareza !== 'SECRETO').length,
      probabilidades: PROBABILIDADES,
      catalogo: visibles.map((m) => ({ ...m, tengo: tengo.includes(m.id), probabilidad: probabilidadDe(m) })),
    };
  }

  const cuentaPublica = (c) => ({
    id: c.id, email: c.email, nombre: c.nombre, tz: c.tz, coleccion: c.coleccion,
    avisos: db.suscripciones(c.id).length,
    plantas: db.plantasDe(c.id).length,
    creada: c.creada,
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

  /* ----------------------------------------------------------- avisos --- */
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
      for (const s of subs) {
        const r = await push.enviar(s, {
          titulo: a.titulo, cuerpo: a.cuerpo, icono: a.icono, url: a.url, tag: a.tag, urgente: a.urgente,
        });
        if (r === 'vencida') db.suscripcionBorrar(s.endpoint);
        if (r === 'ok') n += 1;
      }
      db.avisoRegistrar(planta.id, a.clave, t);
    }
    return n;
  }

  /** Revisa las macetas que dejaron de reportar. Lo llama un temporizador. */
  async function revisar() {
    let n = 0;
    for (const p of db.plantasActivas()) {
      const d = db.dispositivo(p.dispositivo);
      if (d) n += await enviarAvisos(p, d);
    }
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
      }];
    }

    if (metodo === 'GET' && ruta === '/api/salud') {
      return [200, { ok: true, version, activo_s: Math.round(process.uptime()), ...db.contar() }];
    }

    if (metodo === 'GET' && ruta === '/api/especies') return [200, ESPECIES];

    /* --- cuenta ------------------------------------------------------- */
    if (metodo === 'POST' && ruta === '/api/cuenta/registro') {
      limitar(`registro:${ip}`, 10, H);
      const email = normalizarEmail(cuerpo?.email);
      if (!emailValido(email)) falla(400, 'Ese email no es válido.');
      const clave = validarClaveNueva(cuerpo?.clave);
      if (db.cuentaPorEmail(email)) falla(409, 'Ya hay una cuenta con ese email. Entrá con tu contraseña.');
      let tz = TZ_POR_DEFECTO;
      try {
        if (cuerpo?.tz) {
          new Intl.DateTimeFormat('en', { timeZone: String(cuerpo.tz) });
          tz = texto(cuerpo.tz, 64);
        }
      } catch { /* zona desconocida: la de Argentina */ }
      const c = {
        id: nuevoId('c'), email, nombre: texto(cuerpo?.nombre, 40), clave_hash: await hashClave(clave),
        tz, coleccion: [], creada: t,
      };
      try {
        db.cuentaCrear(c);
      } catch {
        falla(409, 'Ya hay una cuenta con ese email. Entrá con tu contraseña.');
      }
      return [201, await abrirSesion(db.cuenta(c.id), headers)];
    }

    if (metodo === 'POST' && ruta === '/api/cuenta/entrar') {
      const email = normalizarEmail(cuerpo?.email);
      limitar(`entrar:${ip}`, 30, 15 * MIN);
      limitar(`entrar:${email}`, 10, 15 * MIN);
      const c = emailValido(email) ? db.cuentaPorEmail(email) : null;
      if (!hashFalso) hashFalso = await hashClave(randomBytes(12).toString('hex'));
      const bien = await verificarClave(String(cuerpo?.clave ?? ''), c?.clave_hash || hashFalso);
      if (!c || !bien) falla(401, 'Email o contraseña incorrectos.');
      return [200, await abrirSesion(c, headers)];
    }

    if (metodo === 'POST' && ruta === '/api/cuenta/salir') {
      const token = bearer(headers);
      if (token) db.sesionBorrar(hash(token));
      return [204, null];
    }

    if (ruta === '/api/cuenta' && (metodo === 'GET' || metodo === 'PATCH')) {
      const c = cuentaDe(headers);
      if (metodo === 'PATCH') {
        const cambios = {};
        if (cuerpo?.nombre !== undefined) cambios.nombre = texto(cuerpo.nombre, 40);
        if (cuerpo?.tz) {
          try {
            new Intl.DateTimeFormat('en', { timeZone: String(cuerpo.tz) });
            cambios.tz = texto(cuerpo.tz, 64);
          } catch { falla(400, 'Zona horaria inválida.'); }
        }
        db.cuentaActualizar(c.id, cambios);
      }
      return [200, cuentaPublica(db.cuenta(c.id))];
    }

    if (metodo === 'POST' && ruta === '/api/cuenta/clave') {
      const c = cuentaDe(headers);
      limitar(`clave:${c.id}`, 10, 15 * MIN);
      if (!(await verificarClave(String(cuerpo?.actual ?? ''), c.clave_hash))) {
        falla(401, 'La contraseña actual no es correcta.');
      }
      const nueva = validarClaveNueva(cuerpo?.nueva);
      db.cuentaActualizar(c.id, { clave_hash: await hashClave(nueva) });
      /* Cambiar la contraseña cierra las demás sesiones: si alguien la
         conocía, deja de tener acceso en ese momento. */
      db.sesionesBorrarOtras(c.id, hash(bearer(headers)));
      return [200, { ok: true }];
    }

    if (metodo === 'DELETE' && ruta === '/api/cuenta') {
      const c = cuentaDe(headers);
      limitar(`borrar:${c.id}`, 5, 15 * MIN);
      if (!(await verificarClave(String(cuerpo?.clave ?? ''), c.clave_hash))) {
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
      if (!d) falla(409, 'Tu ROOTKIT todavía no se conectó. Terminá el paso del wifi.');
      if (d.planta) {
        const p = db.planta(d.planta);
        if (p && p.cuenta === cuenta.id) return [200, nodoDe(p, t)];
        if (p) falla(409, 'Ese ROOTKIT ya está vinculado a otra cuenta.');
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
          if (typeof cuerpo.especie === 'string') {
            const e = especiePorId(cuerpo.especie);
            if (!e) falla(400, 'Especie desconocida');
            p.especie = e;
          } else {
            const e = validarEspecie(cuerpo.especie);
            if (!e) falla(400, 'Los rangos de esa especie no son coherentes');
            p.especie = especiePorId(e.id) || e;
          }
        }
        if (cuerpo?.pantalla !== undefined) {
          if (!['toque', 'siempre'].includes(cuerpo.pantalla)) falla(400, 'Modo de pantalla inválido');
          p.pantalla = cuerpo.pantalla;
        }
        if (cuerpo?.brillo !== undefined) {
          p.brillo = Math.min(100, Math.max(10, entero(cuerpo.brillo, 80)));
        }
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
        db.transaccion(() => {
          db.plantaGuardar(p);
          db.cuentaActualizar(cuenta.id, { coleccion });
        });
      }
      const modelo = modeloPorId(p.persona);
      return [200, {
        ...modelo, nuevo, probabilidad: probabilidadDe(modelo),
        de_fabrica: Boolean(d?.persona_fabrica), planta: nodoDe(p, t),
      }];
    }

    if (metodo === 'GET' && (m = ruta.match(/^\/api\/plantas\/([A-Za-z0-9]+)\/historial$/))) {
      const cuenta = cuentaDe(headers);
      const p = plantaMia(cuenta, m[1]);
      const horas = Math.min(24 * 366, Math.max(1, entero(query.horas, 48)));
      const todas = db.lecturasDePlanta(p.id, t - horas * H);
      const paso = Math.max(1, Math.ceil(todas.length / 240));
      const puntos = todas.filter((_, i) => i % paso === 0 || i === todas.length - 1).map((l) => ({
        t: l.t, soil_pct: l.suelo, temp_dc: l.temp, rh_pct: l.hr, lux: l.lux, mood: l.animo,
      }));
      return [200, { id: p.id, horas, total: todas.length, puntos }];
    }

    /* --- IA -------------------------------------------------------------- */
    if (metodo === 'POST' && ruta === '/api/identificar') {
      const cuenta = cuentaDe(headers);
      limitar(`ia:${cuenta.id}`, 30, H);
      try {
        return [200, await ia.identificar({ image_b64: cuerpo?.image_b64, mime: cuerpo?.mime })];
      } catch (e) {
        falla(e.codigo || 502, e.message);
      }
    }
    if (metodo === 'POST' && ruta === '/api/diagnosticar') {
      const cuenta = cuentaDe(headers);
      limitar(`ia:${cuenta.id}`, 30, H);
      const p = plantaMia(cuenta, String(cuerpo?.planta || ''));
      const d = db.dispositivo(p.dispositivo);
      try {
        const r = await ia.diagnosticar(
          { image_b64: cuerpo?.image_b64, mime: cuerpo?.mime },
          { tel: d?.ultima || null, especie: p.especie },
        );
        return [200, { planta: p.id, ...r }];
      } catch (e) {
        falla(e.codigo || 502, e.message);
      }
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
          titulo: p ? `${p.nombre || 'Tu planta'} te saluda` : 'ROOTKIT',
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
        console.error(e);
        return [500, { error: 'Error interno' }];
      }
    },
    revisar,
    nodoDe,
  };
}
