/* luz.mjs — la luz que mide el Rooti ilumina su cara en el teléfono.
 *
 * El BH1750 de la maceta dice cuánta luz hay donde está la planta. La cara
 * que se dibuja en la app se ve con esa luz: en penumbra se apaga, se
 * entibia y pierde color, como una cara a la luz de una lámpara lejana; a
 * pleno sol gana contraste y le cruza un brillo, como un vidrio al sol. En
 * el medio, nada: la cara de siempre.
 *
 * Este archivo sólo decide CUÁNTO de cada cosa, en números de 0 a 1, a
 * partir de los lux. Cómo se pinta está en caras.mjs (con operaciones de
 * mezcla del canvas, que andan en todos los navegadores). Es una función
 * pura y continua: no hay un salto al cruzar un umbral, cada efecto crece
 * desde cero.
 *
 * Los umbrales son los del producto: menos de 50 lux es una pieza a
 * oscuras; de 50 a 5000 es luz de interior; más de 10 000 es sol directo.
 * Nunca llega a la pantalla de la maceta: ahí la cara se ve con la luz real.
 */

export const UMBRALES = {
  penumbra: 50,       /* por debajo, la cara se apaga y se entibia         */
  neutroHasta: 5000,  /* hasta acá, luz de interior: la cara de siempre    */
  pleno: 10000,       /* desde acá, sol directo: contraste y brillo enteros */
};

/* La sin efecto, para comparar y para cuando no hay dato. */
export const NEUTRA = Object.freeze({
  modo: 'neutra', neutra: true,
  calidez: 0, desaturacion: 0, vineta: 0, contraste: 1, especular: 0,
});

const ajustar = (v) => Math.min(1, Math.max(0, v));

/**
 * Cuánto de cada efecto le toca a una cara con `lux` de luz ambiente.
 *
 *   modo          'penumbra' | 'neutra' | 'pleno'
 *   calidez       0..1  tinte cálido (soft-light ámbar)
 *   desaturacion  0..1  cuánto color pierde
 *   vineta        0..1  cuánto se oscurecen los bordes
 *   contraste     1..1.2
 *   especular     0..1  fuerza del brillo que cruza la cara
 *
 * Sin dato (null, undefined, NaN) es la cara de siempre.
 */
export function iluminacion(lux) {
  const l = Number(lux);
  if (lux === null || lux === undefined || !Number.isFinite(l)) return NEUTRA;
  if (l < UMBRALES.penumbra) {
    const i = ajustar(1 - l / UMBRALES.penumbra);
    return {
      modo: 'penumbra', neutra: false,
      calidez: i, desaturacion: 0.7 * i, vineta: 0.7 * i, contraste: 1, especular: 0,
    };
  }
  if (l > UMBRALES.neutroHasta) {
    const r = ajustar((l - UMBRALES.neutroHasta) / (UMBRALES.pleno - UMBRALES.neutroHasta));
    return {
      modo: r >= 1 ? 'pleno' : 'claro', neutra: false,
      calidez: 0, desaturacion: 0, vineta: 0, contraste: 1 + 0.2 * r, especular: r,
    };
  }
  return NEUTRA;
}

/* El brillo cruza la cara en diagonal, de una punta a la otra, y vuelve a
 * empezar: dónde está (0 antes de entrar, 1 después de salir) para un
 * instante. Es función del tiempo, así que dos caras van a la par. */
export const ESPECULAR_PERIODO_MS = 3600;

export function faseEspecular(tMs, periodo = ESPECULAR_PERIODO_MS) {
  const f = ((tMs % periodo) + periodo) % periodo / periodo;
  return -0.3 + f * 1.6;
}
