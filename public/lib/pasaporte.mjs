/* pasaporte.mjs — los números del pasaporte botánico, sin DOM.
 *
 * El pasaporte es una hoja A4 para imprimir o guardar como PDF: quién es la
 * planta, su Rooti, cuándo llegó, cómo estuvo el último mes, cómo se cuida.
 * Acá se resume el historial en pocos números honestos (medias, mínimos,
 * máximos, cuánto tiempo estuvo cómoda) y se calcula la edad. La hoja está
 * en vistas/pasaporte.mjs.
 */

const DIA = 24 * 3600 * 1000;

const media = (l) => (l.length ? l.reduce((a, b) => a + b, 0) / l.length : null);
const redondear = (v, d = 0) => (v === null ? null : Math.round(v * 10 ** d) / 10 ** d);

/**
 * Resumen de una serie de puntos `{ t, soil_pct, temp_dc, rh_pct, lux, mood }`
 * (el historial de la API): por variable, media, mínimo y máximo; y qué
 * parte del tiempo la planta estuvo cómoda.
 */
export function resumenHistorial(puntos = []) {
  const p = (puntos || []).filter((x) => Number.isFinite(x?.t));
  const serie = (k) => p.map((x) => x[k]).filter((v) => Number.isFinite(v));
  const stats = (k, d = 0) => {
    const s = serie(k);
    return s.length ? { media: redondear(media(s), d), min: redondear(Math.min(...s), d), max: redondear(Math.max(...s), d), n: s.length } : null;
  };
  const conAnimo = p.filter((x) => x.mood && x.mood !== 'UNKNOWN' && x.mood !== 'OFFLINE' && x.mood !== 'SLEEPING');
  const comodos = conAnimo.filter((x) => x.mood === 'HAPPY').length;
  return {
    lecturas: p.length,
    desde: p.length ? Math.min(...p.map((x) => x.t)) : null,
    hasta: p.length ? Math.max(...p.map((x) => x.t)) : null,
    dias: p.length ? Math.max(1, Math.round((Math.max(...p.map((x) => x.t)) - Math.min(...p.map((x) => x.t))) / DIA)) : 0,
    suelo: stats('soil_pct'),
    temp: stats('temp_dc'),
    hr: stats('rh_pct'),
    lux: stats('lux'),
    comoda_pct: conAnimo.length ? Math.round((comodos / conAnimo.length) * 100) : null,
    animos: conAnimo.reduce((m, x) => ({ ...m, [x.mood]: (m[x.mood] || 0) + 1 }), {}),
  };
}

/** Días desde `creada` hasta `ahora`. */
export function edadEnDias(creada, ahora = Date.now()) {
  if (!Number.isFinite(creada)) return null;
  return Math.max(0, Math.floor((ahora - creada) / DIA));
}

/** El ánimo que más veces tuvo (fuera de contenta), o null si siempre estuvo bien. */
export function loQueMasLePaso(animos = {}) {
  const l = Object.entries(animos).filter(([k]) => k !== 'HAPPY').sort((a, b) => b[1] - a[1]);
  return l.length ? l[0][0] : null;
}

/** Un número de pasaporte estable, corto, a partir del id de la planta. */
export function numeroDePasaporte(id) {
  let h = 5381;
  for (const c of String(id || '')) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0;
  return `RL-${String(h % 1000000).padStart(6, '0')}`;
}
