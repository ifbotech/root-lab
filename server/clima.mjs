/* clima.mjs — el pronóstico y el riego que se anticipa.
 *
 * El Rooti mide la tierra cada quince minutos; con eso se sabe a qué
 * velocidad se seca (puntos por hora). Open-Meteo dice qué tiempo va a hacer
 * las próximas 48 horas donde están las plantas. Juntando las dos cosas se
 * puede decir "mañana hace 34 grados: Rulo va a tener sed antes de lo que
 * pensás, regala esta noche", que es la notificación más útil que puede
 * mandar una app de plantas: la que llega ANTES.
 *
 * QUÉ SE MANDA AFUERA
 *
 * Open-Meteo no pide cuenta ni clave, y lo único que recibe es la
 * coordenada de la CIUDAD que la persona escribió en Ajustes (redondeada a
 * dos decimales, unos cientos de metros), nunca la ubicación del teléfono
 * ni ningún dato de la cuenta. Todo pasa por el servidor; la app no habla
 * con terceros. Se apaga con ROOTLAB_CLIMA=0.
 *
 * EL MODELO, A PROPÓSITO SIMPLE
 *
 *   tasa       cuánto baja la tierra por hora, mirando sólo los tramos en
 *              que baja (una subida es un riego y no cuenta) en los últimos
 *              tres días
 *   factor     cuánto más rápido se va a secar con el clima que viene, contra
 *              lo que midió el Rooti estos días: +5 % por cada grado de más,
 *              +0,8 % por cada punto de humedad de menos, entre 0,6 y 2
 *   previsión  (suelo − mínimo de la especie) / (tasa × factor) = horas
 *
 * Es una regla de tres con una corrección, no un modelo hidrológico, y eso es
 * lo que la hace explicable: el aviso dice los tres números.
 *
 * Las funciones de arriba son puras y se prueban con series inventadas;
 * `crearClima` es lo único que habla con la red (con `fetch` inyectable).
 */
import { esHoraDeCalma } from './avisos.mjs';

const H = 3600 * 1000;

export const CLIMA_TTL_MS = 6 * H;         /* el pronóstico se pide cada 6 h */
export const HORIZONTE_MS = 48 * H;
export const VENTANA_TASA_MS = 72 * H;      /* cuánto historial mira la tasa   */
export const VENTANA_RECIENTE_MS = 48 * H;  /* y la media de temperatura/humedad */
export const TASA_MIN_HORAS = 6;            /* menos que esto no es una tasa    */
export const HUECO_MAX_MS = 3 * H;          /* un hueco mayor corta el tramo    */
export const AVISO_HORAS_MAX = 36;          /* se avisa si la sed llega antes   */
export const AVISO_FACTOR_MIN = 1.15;       /* y sólo si el clima empeora       */
export const ESPERA_PREVISION_MS = 24 * H;

const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast';
const GEOCODING = 'https://geocoding-api.open-meteo.com/v1/search';

const redondear2 = (v) => Math.round(Number(v) * 100) / 100;

/* ---------------------------------------------------------- el pronóstico */
/** La respuesta horaria de Open-Meteo, en lo que usa ROOTLAB. */
export function interpretarPronostico(json, ahora, horizonteMs = HORIZONTE_MS) {
  const h = json?.hourly;
  if (!h || !Array.isArray(h.time)) return null;
  const horas = [];
  for (let i = 0; i < h.time.length; i++) {
    const t = Date.parse(`${h.time[i]}Z`);
    const temp = Number(h.temperature_2m?.[i]);
    const hr = Number(h.relative_humidity_2m?.[i]);
    if (!Number.isFinite(t) || !Number.isFinite(temp) || !Number.isFinite(hr)) continue;
    if (t < ahora - H || t > ahora + horizonteMs) continue;
    horas.push({ t, temp_dc: Math.round(temp * 10), hr: Math.round(hr) });
  }
  return horas.length ? { horas } : null;
}

/** Máximas, mínimas y medias de las próximas horas. */
export function resumenPronostico(pronostico) {
  const horas = pronostico?.horas || [];
  if (!horas.length) return null;
  const temps = horas.map((x) => x.temp_dc);
  const hrs = horas.map((x) => x.hr);
  const media = (l) => Math.round(l.reduce((a, b) => a + b, 0) / l.length);
  return {
    horas: horas.length,
    desde: horas[0].t,
    hasta: horas[horas.length - 1].t,
    temp_max_dc: Math.max(...temps),
    temp_min_dc: Math.min(...temps),
    temp_media_dc: media(temps),
    hr_min: Math.min(...hrs),
    hr_media: media(hrs),
  };
}

/* ---------------------------------------------------------- el historial */
/**
 * A qué velocidad se seca la tierra, en puntos por hora, con las lecturas de
 * los últimos tres días. Sólo cuentan los tramos en que baja: una subida es
 * un riego, y un hueco largo (el Rooti sin wifi) tampoco cuenta. Null si no
 * hay bastante: hacen falta al menos 6 horas de tierra secándose.
 */
export function tasaSecado(lecturas, { ahora = Date.now(), ventanaMs = VENTANA_TASA_MS } = {}) {
  const serie = (lecturas || [])
    .filter((l) => Number.isFinite(l?.suelo) && l.t >= ahora - ventanaMs)
    .sort((a, b) => a.t - b.t);
  let caida = 0;
  let ms = 0;
  let tramos = 0;
  for (let i = 1; i < serie.length; i++) {
    const a = serie[i - 1];
    const b = serie[i];
    const dt = b.t - a.t;
    if (dt <= 0 || dt > HUECO_MAX_MS) continue;
    if (b.suelo > a.suelo) continue;           /* subió: un riego, no cuenta */
    caida += a.suelo - b.suelo;
    ms += dt;
    tramos += 1;
  }
  const horas = ms / H;
  if (horas < TASA_MIN_HORAS || caida < 1) return null;
  return { pct_h: Math.round((caida / horas) * 1000) / 1000, horas: Math.round(horas * 10) / 10, tramos };
}

/** Temperatura y humedad medias que midió el Rooti estos días. */
export function mediaReciente(lecturas, { ahora = Date.now(), ventanaMs = VENTANA_RECIENTE_MS } = {}) {
  const l = (lecturas || []).filter((x) => x.t >= ahora - ventanaMs && Number.isFinite(x?.temp) && Number.isFinite(x?.hr));
  if (!l.length) return null;
  const media = (k) => Math.round(l.reduce((a, b) => a + b[k], 0) / l.length);
  return { temp_dc: media('temp'), hr: media('hr'), n: l.length };
}

/**
 * Cuánto más rápido (o más lento) se va a secar con el clima que viene, en
 * comparación con lo que midió el Rooti: 1 es "igual que estos días".
 */
export function factorClima(resumen, reciente) {
  if (!resumen || !reciente) return { factor: 1, dT: 0, dRH: 0 };
  const dT = (resumen.temp_media_dc - reciente.temp_dc) / 10;
  const dRH = resumen.hr_media - reciente.hr;
  const factor = Math.min(2, Math.max(0.6, 1 + 0.05 * dT - 0.008 * dRH));
  return { factor: Math.round(factor * 100) / 100, dT: Math.round(dT * 10) / 10, dRH: Math.round(dRH) };
}

/** Cuándo va a tener sed: horas hasta que la tierra llegue al mínimo. */
export function prevision({ suelo, soil_min, tasa, factor = 1, ahora = Date.now() }) {
  if (!tasa || !Number.isFinite(suelo) || !Number.isFinite(soil_min)) return null;
  const velocidad = tasa.pct_h * factor;
  if (velocidad <= 0) return null;
  const horas = suelo <= soil_min ? 0 : (suelo - soil_min) / velocidad;
  return {
    horas_hasta_sed: Math.round(horas * 10) / 10,
    cuando: ahora + Math.round(horas * H),
    tasa_pct_h: tasa.pct_h,
    velocidad_pct_h: Math.round(velocidad * 1000) / 1000,
    factor,
  };
}

const temp = (dc) => `${Math.round(dc / 10)} °C`;

/**
 * El aviso que se adelanta: sólo si el clima empeora de verdad (factor ≥
 * 1,15), la sed llega dentro de las próximas 36 h, la planta todavía no la
 * tiene, no es de noche y no se avisó en 24 h. Misma forma que los avisos de
 * avisos.mjs.
 */
export function avisoPrevision({ planta, mood, suelo, especie, prevision: pv, resumen, ahora, enviados = {}, tz }) {
  if (!planta?.revelado || !pv || !resumen || !especie) return null;
  if (['THIRSTY', 'DROWNING', 'OFFLINE', 'UNKNOWN'].includes(mood)) return null;
  if (pv.factor < AVISO_FACTOR_MIN) return null;
  if (!(pv.horas_hasta_sed > 0 && pv.horas_hasta_sed <= AVISO_HORAS_MAX)) return null;
  if (esHoraDeCalma(ahora, tz)) return null;
  if (enviados.prevision && ahora - enviados.prevision < ESPERA_PREVISION_MS) return null;
  const nombre = planta.nombre || 'Tu planta';
  const h = Math.round(pv.horas_hasta_sed);
  return {
    clave: 'prevision', urgente: false, tag: `${planta.id}:prevision`,
    titulo: `Se viene calor: ${nombre} va a tener sed antes`,
    cuerpo: `Mañana ${temp(resumen.temp_max_dc)} y ${resumen.hr_min} % de humedad. La tierra está al ${suelo} % y llega a ${especie.soil_min} % en unas ${h} h. Regala esta noche, despacio.`,
    icono: `caras/${planta.persona || 'incognito'}-THIRSTY.png`,
    url: `#planta/${planta.id}`,
  };
}

/* ---------------------------------------------------------------- la red */
/**
 * El cliente de Open-Meteo. `fetch` se inyecta para los tests; con `activo`
 * en false no sale nada a la red y todo devuelve null.
 */
export function crearClima({ fetch = globalThis.fetch, activo = true, tiempoMs = 8000 } = {}) {
  async function pedir(url) {
    if (!activo || typeof fetch !== 'function') return null;
    const r = await fetch(url, { signal: AbortSignal.timeout(tiempoMs), headers: { accept: 'application/json' } });
    if (!r.ok) throw new Error(`Open-Meteo respondió ${r.status}`);
    return r.json();
  }
  return {
    activo,
    /** Una ciudad escrita por una persona → { nombre, pais, lat, lon, tz } o null. */
    async geocodificar(nombre) {
      const n = String(nombre || '').trim().slice(0, 80);
      if (!n) return null;
      const j = await pedir(`${GEOCODING}?name=${encodeURIComponent(n)}&count=1&language=es&format=json`);
      const r = j?.results?.[0];
      if (!r || !Number.isFinite(Number(r.latitude))) return null;
      return {
        nombre: String(r.name || n).slice(0, 60),
        pais: String(r.country || '').slice(0, 60),
        region: String(r.admin1 || '').slice(0, 60),
        lat: redondear2(r.latitude),
        lon: redondear2(r.longitude),
        tz: r.timezone || null,
      };
    },
    /** Las próximas 48 h en (lat, lon). */
    async pronostico(lat, lon, ahora = Date.now()) {
      const j = await pedir(`${OPEN_METEO}?latitude=${redondear2(lat)}&longitude=${redondear2(lon)}`
        + '&hourly=temperature_2m,relative_humidity_2m&forecast_days=3&timezone=UTC');
      return interpretarPronostico(j, ahora);
    },
  };
}
