/* api.mjs — toda la lógica del servidor, separada del transporte HTTP.
 *
 * Dos clientes, dos mundos:
 *
 *   EL APARATO   POST /api/d/sync, firmado con su token. Cuenta quién es,
 *                cómo está y qué midió; recibe todo lo que necesita saber.
 *                Contrato: rootkit/docs/nube.md y docs/api.md.
 *
 *   LA APP       /api/*, con el token de una cuenta anónima. Vincula,
 *                abre el cofre, bautiza, identifica y mira.
 *
 * `manejar()` recibe un pedido ya parseado y devuelve [código, cuerpo]. Así
 * los tests recorren el flujo completo —de la primera consulta del aparato
 * a la notificación de sed— sin abrir un socket.
 */
import { randomBytes } from 'node:crypto';
import {
  ESPECIES, MODELOS, FRASES, ANIMOS, especiePorId, modeloPorId, validarEspecie,
} from './catalogo.mjs';
import {
  normalizarCodigo, ssidDe, codigoLegible, hash, tokenNuevo, igualesSeguro,
  codigoTransferencia,
} from './codigo.mjs';
import { abrirCofre, PROBABILIDADES, probabilidadDe } from './cofre.mjs';
import { avisosPendientes } from './avisos.mjs';

const MIN = 60 * 1000;
const H = 60 * MIN;

export const INTERVALO_S = 900;
export const EN_LINEA_MS = 90 * 1000;
export const VIVO_MS = 45 * MIN;
export const TIBIO_MS = 6 * H;
const LECTURAS_MAX = 4000;           /* ~40 días a una cada 15 min */
const TZ_POR_DEFECTO = 'America/Argentina/Buenos_Aires';

class ErrorApi extends Error {
  constructor(codigo, mensaje) { super(mensaje); this.codigo = codigo; }
}
const falla = (codigo, mensaje) => { throw new ErrorApi(codigo, mensaje); };

const entero = (v, def = 0) => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : def);
const texto = (v, max) => String(v ?? '').trim().slice(0, max);
const id = (prefijo) => `${prefijo}${randomBytes(6).toString('hex')}`;

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

export function crearApi({
  almacen,
  ia,
  push = null,
  reloj = () => Date.now(),
  azar,
  tofu = true,
  urlPublica = () => '',
  version = '0.1.0',
} = {}) {
  const D = () => almacen.datos;
  const limites = new Map();

  /* ----------------------------------------------------------- ayudas --- */
  function limitar(clave, max, ventanaMs) {
    const t = reloj();
    const l = limites.get(clave);
    if (!l || t - l.desde > ventanaMs) {
      limites.set(clave, { desde: t, n: 1 });
      return;
    }
    l.n += 1;
    if (l.n > max) falla(429, 'Demasiados intentos. Esperá un minuto.');
  }

  const bearer = (headers) => {
    const a = headers?.authorization || headers?.Authorization || '';
    return a.startsWith('Bearer ') ? a.slice(7).trim() : '';
  };

  function cuentaDe(headers, obligatoria = true) {
    const token = bearer(headers);
    if (token) {
      const h = hash(token);
      for (const c of Object.values(D().cuentas)) {
        if ((c.tokens || []).some((x) => igualesSeguro(x, h))) return c;
      }
    }
    if (obligatoria) falla(401, 'Sesión inválida');
    return null;
  }

  function plantaMia(cuenta, plantaId) {
    const p = D().plantas[plantaId];
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

  function vinculoInicial() {
    return { dias_vividos: 0, dias_sanos: 0, racha: 0, mejor_racha: 0, dia: null, urgente_hoy: false };
  }

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

  function especieDe(planta) {
    return planta?.especie || null;
  }

  /** La forma que consumen las vistas. */
  function nodoDe(p, t = reloj()) {
    const d = D().dispositivos[p.dispositivo] || null;
    const u = d?.ultima || null;
    const mood = !p.revelado ? 'SLEEPING' : (u ? (d.animo || 'UNKNOWN') : 'UNKNOWN');
    const link = linkDe(d, t);
    const moodVisible = link === 'CAIDO' ? 'OFFLINE' : mood;
    const { dia, urgente_hoy: _u, ...bond } = p.vinculo || vinculoInicial();
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
      bond,
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

  function desvincular(planta) {
    const d = D().dispositivos[planta.dispositivo];
    if (d && d.planta === planta.id) d.planta = null;
    delete D().plantas[planta.id];
    delete D().avisos[planta.id];
  }

  /* ----------------------------------------------------------- avisos --- */
  async function enviarAvisos(planta, d) {
    if (!push) return 0;
    const cuenta = D().cuentas[planta.cuenta];
    const subs = D().suscripciones[planta.cuenta] || [];
    const enviados = D().avisos[planta.id] || (D().avisos[planta.id] = {});
    if (d.sev === 'OK') {
      /* Terminó el episodio: el próximo avisa enseguida. */
      for (const k of Object.keys(enviados)) if (k.startsWith('animo:')) delete enviados[k];
    }
    if (!subs.length) return 0;
    const t = reloj();
    const lista = avisosPendientes({
      planta, dispositivo: d, especie: especieDe(planta), ahora: t, enviados, tz: cuenta?.tz,
    });
    let n = 0;
    for (const a of lista) {
      for (const s of [...subs]) {
        const r = await push.enviar(s, {
          titulo: a.titulo, cuerpo: a.cuerpo, icono: a.icono, url: a.url, tag: a.tag, urgente: a.urgente,
        });
        if (r === 'vencida') subs.splice(subs.indexOf(s), 1);
        if (r === 'ok') n += 1;
      }
      enviados[a.clave] = t;
    }
    return n;
  }

  /** Revisa las macetas que dejaron de reportar. Lo llama un temporizador. */
  async function revisar() {
    let n = 0;
    for (const p of Object.values(D().plantas)) {
      const d = D().dispositivos[p.dispositivo];
      if (d) n += await enviarAvisos(p, d);
    }
    if (n) almacen.guardar();
    return n;
  }

  /* ----------------------------------------------------------- aparato --- */
  async function sync(cuerpo, headers) {
    const t = reloj();
    const idDisp = String(cuerpo?.id || '');
    if (!/^[0-9A-F]{12}$/.test(idDisp)) falla(400, 'id inválido');
    const token = bearer(headers);
    if (!/^[0-9a-f]{64}$/.test(token)) falla(401, 'falta el token');

    let d = D().dispositivos[idDisp];
    if (!d) {
      /* Confianza al primer uso: el primer aparato que se presenta con este
         id registra su token. En producción los registra la estación de
         fábrica y esto se apaga con ROOTLAB_TOFU=0 (docs/api.md). */
      if (!tofu) falla(401, 'aparato no registrado');
      d = { id: idDisp, token_hash: hash(token), creado: t, ultimo_reloj: -1, arranques: 0, planta: null };
      D().dispositivos[idDisp] = d;
    } else if (!igualesSeguro(d.token_hash, hash(token))) {
      falla(401, 'token inválido');
    }

    const epoca = Math.max(0, entero(cuerpo.epoca));
    let planta = d.planta ? D().plantas[d.planta] : null;

    /* Un aparato vinculado que aparece con otra época fue borrado a mano
       (botón largo): el vínculo viejo ya no vale. */
    if (planta && planta.epoca !== epoca) {
      desvincular(planta);
      planta = null;
    }

    const persona = texto(cuerpo.persona, 15);
    Object.assign(d, {
      visto: t,
      fw: texto(cuerpo.fw, 16),
      placa: texto(cuerpo.placa, 24),
      pantalla: texto(cuerpo.pantalla, 24),
      estado: texto(cuerpo.estado, 16),
      epoca,
      rssi: entero(cuerpo.rssi, null),
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
    const lista = D().lecturas[idDisp] || (D().lecturas[idDisp] = []);
    const cuenta = planta ? D().cuentas[planta.cuenta] : null;
    let nuevas = 0;
    for (const l of lecturas) {
      const hace = Math.max(0, entero(l?.hace));
      const rl = relojAhora - hace;
      if (rl <= d.ultimo_reloj) continue;
      d.ultimo_reloj = rl;
      const animo = ANIMOS.includes(l.animo) ? l.animo : 'UNKNOWN';
      const sev = ['OK', 'WATCH', 'URGENT'].includes(l.sev) ? l.sev : 'OK';
      const r = { t: t - hace * 1000, animo, sev };
      const opcional = (k, v, lo, hi) => {
        if (Number.isFinite(Number(v))) r[k] = Math.min(hi, Math.max(lo, Math.round(Number(v))));
      };
      opcional('suelo', l.suelo, 0, 100);
      opcional('temp', l.temp, -400, 800);
      opcional('hr', l.hr, 0, 100);
      opcional('lux', l.lux, 0, 200000);
      opcional('tsuelo', l.tsuelo, -400, 800);
      opcional('bat', l.bat, 0, 5000);
      opcional('crudo', l.suelo_raw, 0, 4095);
      if (l.usb) r.usb = true;
      lista.push(r);
      nuevas += 1;
      if (planta?.revelado) {
        avanzarVinculo(planta.vinculo, diaLocal(r.t, cuenta?.tz), sev === 'URGENT');
      }
    }
    if (lista.length > LECTURAS_MAX) lista.splice(0, lista.length - LECTURAS_MAX);
    if (nuevas > 0) {
      const u = lista[lista.length - 1];
      d.ultima = u;
      d.animo = u.animo;
      d.sev = u.sev;
    }

    if (planta) await enviarAvisos(planta, d);
    almacen.guardar();

    const e = especieDe(planta);
    const { dia, urgente_hoy: _u, ...vinculo } = planta?.vinculo || vinculoInicial();
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
      ...(planta?.revelado ? { vinculo } : {}),
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
      }];
    }

    if (metodo === 'GET' && ruta === '/api/salud') {
      return [200, {
        ok: true,
        version,
        activo_s: Math.round(process.uptime()),
        dispositivos: Object.keys(D().dispositivos).length,
        plantas: Object.keys(D().plantas).length,
      }];
    }

    if (metodo === 'GET' && ruta === '/api/especies') return [200, ESPECIES];

    /* --- cuenta ------------------------------------------------------- */
    if (metodo === 'POST' && ruta === '/api/cuenta') {
      limitar(`cuenta:${ip}`, 20, H);
      const token = tokenNuevo();
      const c = {
        id: id('c'), tokens: [hash(token)], creada: t,
        tz: texto(cuerpo?.tz, 64) || TZ_POR_DEFECTO, coleccion: [],
      };
      D().cuentas[c.id] = c;
      almacen.guardar();
      return [201, { token, id: c.id }];
    }
    if (ruta === '/api/cuenta' && (metodo === 'GET' || metodo === 'PATCH')) {
      const c = cuentaDe(headers);
      if (metodo === 'PATCH' && cuerpo?.tz) {
        try {
          new Intl.DateTimeFormat('en', { timeZone: String(cuerpo.tz) });
          c.tz = texto(cuerpo.tz, 64);
          almacen.guardar();
        } catch { falla(400, 'zona horaria inválida'); }
      }
      return [200, {
        id: c.id, tz: c.tz, coleccion: c.coleccion,
        avisos: (D().suscripciones[c.id] || []).length,
        plantas: Object.values(D().plantas).filter((p) => p.cuenta === c.id).length,
      }];
    }
    if (metodo === 'POST' && ruta === '/api/cuenta/transferir') {
      const c = cuentaDe(headers);
      for (const [k, v] of Object.entries(D().transferencias)) if (v.vence < t) delete D().transferencias[k];
      const codigo = codigoTransferencia();
      D().transferencias[codigo] = { cuenta: c.id, vence: t + 10 * MIN };
      almacen.guardar();
      return [201, { codigo, vence: t + 10 * MIN }];
    }
    if (metodo === 'POST' && ruta === '/api/cuenta/recuperar') {
      limitar(`recuperar:${ip}`, 10, 10 * MIN);
      const codigo = texto(cuerpo?.codigo, 12).toUpperCase().replace(/[^0-9A-Z]/g, '');
      const tr = D().transferencias[codigo];
      if (!tr || tr.vence < t) falla(404, 'Ese código no existe o ya venció');
      delete D().transferencias[codigo];
      const c = D().cuentas[tr.cuenta];
      if (!c) falla(404, 'La cuenta ya no existe');
      const token = tokenNuevo();
      c.tokens.push(hash(token));
      almacen.guardar();
      return [200, { token, id: c.id }];
    }

    /* --- vínculo ---------------------------------------------------------- */
    if (metodo === 'GET' && (m = ruta.match(/^\/api\/vinculo\/([^/]+)$/))) {
      limitar(`vinculo:${ip}`, 90, MIN);
      const codigo = normalizarCodigo(decodeURIComponent(m[1]));
      if (!codigo) falla(400, 'Ese código no es válido');
      const cuenta = cuentaDe(headers, false);
      const d = Object.values(D().dispositivos)
        .find((x) => x.codigo === codigo && x.codigo_epoca === x.epoca) || null;
      const planta = d?.planta ? D().plantas[d.planta] : null;
      return [200, {
        codigo, legible: codigoLegible(codigo), ssid: ssidDe(codigo),
        visto: Boolean(d),
        en_linea: Boolean(d && t - d.visto < EN_LINEA_MS),
        libre: !planta,
        mio: Boolean(planta && cuenta && planta.cuenta === cuenta.id),
        planta: planta && cuenta && planta.cuenta === cuenta.id ? planta.id : null,
        estado: d?.estado || null,
      }];
    }
    if (metodo === 'POST' && ruta === '/api/vinculo') {
      const cuenta = cuentaDe(headers);
      limitar(`vincular:${cuenta.id}`, 20, MIN);
      const codigo = normalizarCodigo(cuerpo?.codigo);
      if (!codigo) falla(400, 'Ese código no es válido');
      const d = Object.values(D().dispositivos)
        .find((x) => x.codigo === codigo && x.codigo_epoca === x.epoca);
      if (!d) falla(409, 'Tu ROOTKIT todavía no se conectó. Terminá el paso del wifi.');
      if (d.planta) {
        const p = D().plantas[d.planta];
        if (p && p.cuenta === cuenta.id) return [200, nodoDe(p, t)];
        falla(409, 'Ese ROOTKIT ya está vinculado a otra cuenta.');
      }
      const p = {
        id: id('p'), cuenta: cuenta.id, dispositivo: d.id, epoca: d.epoca, creada: t,
        persona: null, revelado: false, nombre: '', especie: null,
        pantalla: 'toque', brillo: 80, vinculo: vinculoInicial(),
      };
      D().plantas[p.id] = p;
      d.planta = p.id;
      almacen.guardar();
      return [201, nodoDe(p, t)];
    }

    /* --- estado y plantas ------------------------------------------------ */
    if (metodo === 'GET' && ruta === '/api/estado') {
      const cuenta = cuentaDe(headers);
      const plantas = Object.values(D().plantas).filter((p) => p.cuenta === cuenta.id);
      const propias = plantas.map((p) => p.especie).filter((e) => e && !especiePorId(e.id));
      return [200, {
        nodes: plantas.sort((a, b) => a.creada - b.creada).map((p) => nodoDe(p, t)),
        especies: [...ESPECIES, ...propias],
        coleccion: coleccionDe(cuenta),
        avisos: (D().suscripciones[cuenta.id] || []).length,
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
        almacen.guardar();
        return [200, nodoDe(p, t)];
      }
      if (metodo === 'DELETE') {
        desvincular(p);
        almacen.guardar();
        return [204, null];
      }
    }

    if (metodo === 'POST' && (m = ruta.match(/^\/api\/plantas\/([A-Za-z0-9]+)\/cofre$/))) {
      const cuenta = cuentaDe(headers);
      const p = plantaMia(cuenta, m[1]);
      const d = D().dispositivos[p.dispositivo];
      let nuevo = false;
      if (!p.revelado) {
        const modelo = abrirCofre(d?.persona_fabrica, azar);
        p.persona = modelo.id;
        p.revelado = true;
        p.revelada_en = t;
        cuenta.coleccion = cuenta.coleccion || [];
        if (!cuenta.coleccion.includes(modelo.id)) {
          cuenta.coleccion.push(modelo.id);
          nuevo = true;
        }
        almacen.guardar();
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
      const horas = Math.min(24 * 30, Math.max(1, entero(query.horas, 48)));
      /* Sólo desde que la planta es tuya: lo que midió para el dueño
         anterior no es asunto de nadie más. */
      const desde = Math.max(t - horas * H, p.creada);
      const todas = (D().lecturas[p.dispositivo] || []).filter((l) => l.t >= desde);
      const paso = Math.max(1, Math.ceil(todas.length / 240));
      const puntos = todas.filter((_, i) => i % paso === 0 || i === todas.length - 1).map((l) => ({
        t: l.t, soil_pct: l.suelo ?? null, temp_dc: l.temp ?? null, rh_pct: l.hr ?? null,
        lux: l.lux ?? null, mood: l.animo,
      }));
      return [200, { id: p.id, horas, puntos }];
    }

    /* --- IA -------------------------------------------------------------- */
    if (metodo === 'POST' && ruta === '/api/identificar') {
      const cuenta = cuentaDe(headers);
      limitar(`ia:${cuenta.id}`, 30, H);
      try {
        const r = await ia.identificar({ image_b64: cuerpo?.image_b64, mime: cuerpo?.mime });
        return [200, r];
      } catch (e) {
        falla(e.codigo || 502, e.message);
      }
    }
    if (metodo === 'POST' && ruta === '/api/diagnosticar') {
      const cuenta = cuentaDe(headers);
      limitar(`ia:${cuenta.id}`, 30, H);
      const p = plantaMia(cuenta, String(cuerpo?.planta || ''));
      const d = D().dispositivos[p.dispositivo];
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
      if (!/^https:\/\//.test(endpoint)) falla(400, 'Suscripción inválida');
      const lista = D().suscripciones[cuenta.id] || (D().suscripciones[cuenta.id] = []);
      const i = lista.findIndex((x) => x.endpoint === endpoint);
      if (metodo === 'DELETE') {
        if (i >= 0) lista.splice(i, 1);
      } else {
        if (!s?.keys?.p256dh || !s?.keys?.auth) falla(400, 'Suscripción inválida');
        const limpia = { endpoint, keys: { p256dh: String(s.keys.p256dh), auth: String(s.keys.auth) } };
        if (i >= 0) lista[i] = limpia; else lista.push(limpia);
        if (lista.length > 10) lista.splice(0, lista.length - 10);
      }
      almacen.guardar();
      return [200, { avisos: lista.length }];
    }
    if (metodo === 'POST' && ruta === '/api/push/probar') {
      const cuenta = cuentaDe(headers);
      if (!push) falla(503, 'Las notificaciones no están configuradas');
      limitar(`probar:${cuenta.id}`, 5, 10 * MIN);
      const lista = D().suscripciones[cuenta.id] || [];
      const p = Object.values(D().plantas).find((x) => x.cuenta === cuenta.id && x.revelado);
      let n = 0;
      for (const s of [...lista]) {
        const r = await push.enviar(s, {
          titulo: p ? `${p.nombre || 'Tu planta'} te saluda` : 'ROOTKIT',
          cuerpo: 'Así te vamos a avisar cuando tu planta necesite algo.',
          icono: p ? `caras/${p.persona}-HAPPY.png` : 'iconos/icono-192.png',
          url: './', tag: 'prueba',
        });
        if (r === 'vencida') lista.splice(lista.indexOf(s), 1);
        if (r === 'ok') n += 1;
      }
      almacen.guardar();
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
