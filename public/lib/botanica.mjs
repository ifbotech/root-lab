/* botanica.mjs — los dos números que usan los invernaderos: VPD y DLI.
 *
 * La app de todos los días habla de sed y de luz. Para quien quiere ir más
 * a fondo, la pestaña "Avanzado · Botánica" muestra lo que se calcula con
 * los mismos sensores y no aparece en ninguna app de plantas de consumo:
 *
 *   VPD  déficit de presión de vapor (kPa): cuánta agua le "tira" el aire a
 *        la hoja. Sale de la temperatura y la humedad del AHT20. Con VPD
 *        bajo la planta no transpira (hongos); con VPD alto transpira de más
 *        y pide agua aunque la tierra esté bien.
 *
 *   DLI  luz diaria integrada (mol/m²/día): cuánta luz útil recibió en el
 *        día entero, sumando cada lectura del BH1750. Un mediodía brillante
 *        junto a una ventana y un día nublado dan lux parecidos a las 12,
 *        pero DLI muy distintos, y las plantas viven del DLI.
 *
 * Todo es puro y se prueba en Node; la vista sólo lo muestra.
 */

/* Presión de vapor de saturación (kPa) a T °C: fórmula de Tetens. */
export const presionSaturacion = (tempC) => 0.6108 * Math.exp((17.27 * tempC) / (tempC + 237.3));

/** VPD en kPa a partir de décimas de grado y humedad relativa. Null sin dato. */
export function vpd(tempDc, rhPct) {
  if (tempDc === null || tempDc === undefined || rhPct === null || rhPct === undefined) return null;
  const t = Number(tempDc);
  const rh = Number(rhPct);
  if (!Number.isFinite(t) || !Number.isFinite(rh)) return null;
  const es = presionSaturacion(t / 10);
  const v = es * (1 - Math.min(100, Math.max(0, rh)) / 100);
  return Math.round(v * 100) / 100;
}

/* Las zonas, como las usan los cultivadores. */
export const ZONAS_VPD = [
  { hasta: 0.4, nivel: 'muy-bajo', texto: 'Aire saturado: la hoja no transpira. Riesgo de hongos; ventilá.' },
  { hasta: 0.8, nivel: 'bajo', texto: 'Húmedo: ideal para esquejes y plantas de selva.' },
  { hasta: 1.2, nivel: 'ideal', texto: 'Cómodo: transpira y crece sin esfuerzo.' },
  { hasta: 1.6, nivel: 'alto', texto: 'Seco: transpira de más y pide agua aunque la tierra esté bien.' },
  { hasta: Infinity, nivel: 'muy-alto', texto: 'Muy seco: estrés. Subí la humedad o sacala del calor.' },
];

export function zonaVpd(kpa) {
  if (kpa === null || kpa === undefined || !Number.isFinite(kpa)) return null;
  return ZONAS_VPD.find((z) => kpa < z.hasta) || ZONAS_VPD[ZONAS_VPD.length - 1];
}

/* Cuántos µmol/m²/s de luz útil hay por cada lux, para luz de sol. Para un
 * LED blanco es parecido (0,015–0,02); el BH1750 no distingue, y esta es la
 * convención de las apps de cultivo. */
export const LUX_A_UMOL = 0.0185;

/* Un hueco más largo que esto entre dos lecturas no suma luz: el Rooti no
 * estaba midiendo y no se sabe qué pasó. */
export const HUECO_MAX_MS = 3600 * 1000;

/**
 * DLI (mol/m²) de una serie de puntos `{ t, lux }` entre `desde` y `hasta`:
 * cada lectura vale hasta la siguiente (o hasta HUECO_MAX_MS, lo que sea
 * menor); la última, hasta `hasta` si es un instante concreto (el "ahora"
 * de hoy) y nada si no. lux × 0,0185 µmol/m²/s × segundos / 1e6.
 */
export function dli(puntos, { desde = -Infinity, hasta = Infinity, huecoMaxMs = HUECO_MAX_MS } = {}) {
  const serie = (puntos || [])
    .filter((p) => Number.isFinite(p?.t) && Number.isFinite(p?.lux))
    .sort((a, b) => a.t - b.t);
  let umol = 0;
  for (let i = 0; i < serie.length; i++) {
    const p = serie[i];
    const siguiente = serie[i + 1]?.t ?? (Number.isFinite(hasta) ? hasta : p.t);
    const fin = Math.min(siguiente, p.t + huecoMaxMs, hasta);
    const ini = Math.max(p.t, desde);
    if (fin <= ini) continue;
    umol += p.lux * LUX_A_UMOL * ((fin - ini) / 1000);
  }
  return Math.round((umol / 1e6) * 100) / 100;
}

/** El DLI que pide una especie, si recibiera su rango de lux `horasLuz` por día. */
export function dliObjetivo(especie, horasLuz = 12) {
  if (!especie || !Number.isFinite(especie.lux_min)) return null;
  const a = (lux) => Math.round((lux * LUX_A_UMOL * horasLuz * 3600) / 1e6 * 10) / 10;
  return { min: a(especie.lux_min), max: a(Number.isFinite(especie.lux_max) ? especie.lux_max : especie.lux_min * 4) };
}

/** Medianoche local (la del teléfono) del día de `ms`. */
export function inicioDelDia(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** El DLI de hoy (hasta ahora) y el de ayer entero. */
export function dliHoyYAyer(puntos, ahora = Date.now()) {
  const hoy0 = inicioDelDia(ahora);
  const ayer0 = inicioDelDia(hoy0 - 1);
  return {
    hoy: dli(puntos, { desde: hoy0, hasta: ahora }),
    ayer: dli(puntos, { desde: ayer0, hasta: hoy0 }),
    horasDeHoy: Math.round(((ahora - hoy0) / 3600e3) * 10) / 10,
  };
}

/** Cómo viene el DLI de hoy contra el objetivo, proyectando el día entero. */
export function juicioDli({ hoy, horasDeHoy, objetivo }) {
  if (!objetivo || !Number.isFinite(hoy)) return null;
  const proyectado = horasDeHoy >= 1 ? (hoy / horasDeHoy) * 12 : null;
  const v = proyectado ?? hoy;
  if (v < objetivo.min * 0.8) return { nivel: 'poco', texto: 'Le está faltando luz para lo que pide su especie.' };
  if (v > objetivo.max * 1.3) return { nivel: 'mucho', texto: 'Recibe más luz de la que quiere: cuidado con las quemaduras.' };
  return { nivel: 'bien', texto: 'La luz del día va bien para su especie.' };
}
