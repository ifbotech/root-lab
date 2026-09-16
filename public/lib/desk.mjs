/* desk.mjs — las reglas del modo escritorio (Desk Pet), sin DOM.
 *
 * El modo escritorio es el Rooti a pantalla completa en un teléfono viejo
 * apoyado en el escritorio: sólo la cara, grande, con la pantalla que no se
 * apaga (Wake Lock) y, si el navegador deja, a pantalla completa. Estas son
 * las decisiones que se pueden probar sin navegador; la vista está en
 * vistas/desk.mjs.
 */

/* De noche la pantalla se apaga casi del todo: con menos de 10 lux en la
 * maceta (la pieza a oscuras) o entre las 23:00 y las 07:00, pase lo que
 * pase con la luz. Una pantalla brillante en una mesa de luz molesta más de
 * lo que acompaña. */
export const LUX_NOCHE = 10;
export const NOCHE_DESDE = 23;
export const NOCHE_HASTA = 7;

export function esDeNoche({ lux = null, hora = new Date().getHours() } = {}) {
  if (hora >= NOCHE_DESDE || hora < NOCHE_HASTA) return true;
  return lux !== null && lux !== undefined && Number.isFinite(Number(lux)) && Number(lux) < LUX_NOCHE;
}

/* El lado de la cara: casi todo el ancho en un teléfono parado, casi todo
 * el alto en uno acostado, y nunca más que lo que el renderer dibuja
 * (512 px) ni tan chico que no se vea de lejos. */
export const LADO_MAX = 512;
export const LADO_MIN = 160;

export function ladoDesk(ancho, alto) {
  const l = Math.min(ancho * 0.92, alto * 0.74, LADO_MAX);
  return Math.max(LADO_MIN, Math.round(l));
}

/* Cada cuánto vuelve a mirar la hora para entrar o salir de la noche. */
export const RELOJ_MS = 60000;

/* Los controles se esconden solos a los pocos segundos. */
export const OCULTAR_CONTROLES_MS = 4000;
