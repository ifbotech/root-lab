/* reloj.mjs — la hora con la que la mascota decide si es de noche.
 *
 * Es la hora local del teléfono, salvo que haya una HORA DE PRUEBA: el
 * emulador (y quien quiera ver al Rooti dormido a las tres de la tarde)
 * guarda una hora en localStorage, `rootlab:demo-hora`, y la app la usa en
 * su lugar y lo avisa con una píldora. Como el emulador y la app comparten
 * origen, el cambio llega en vivo por el evento `storage`.
 *
 * Sólo cambia la escena (sentarse, gorrito, Zzz): ni los avisos, ni el
 * silencio de la voz de noche, ni nada que vaya al servidor.
 */

export const CLAVE_HORA = 'rootlab:demo-hora';

/** La hora de prueba (0 a 23), o null si no hay. */
export function horaDePrueba(almacen = globalThis.localStorage) {
  try {
    const v = almacen?.getItem(CLAVE_HORA);
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isInteger(n) && n >= 0 && n < 24 ? n : null;
  } catch {
    return null;
  }
}

/** Pone (0 a 23) o saca (null) la hora de prueba. */
export function fijarHoraDePrueba(hora, almacen = globalThis.localStorage) {
  try {
    if (hora === null || hora === undefined) almacen?.removeItem(CLAVE_HORA);
    else almacen?.setItem(CLAVE_HORA, String(Math.max(0, Math.min(23, Math.floor(hora)))));
  } catch { /* navegación privada: no queda */ }
}

/* Cómo se decide si la app se ve de noche (lib/tema.mjs y tema.js). */
export const MODOS = ['auto', 'sistema', 'dia', 'noche'];
export const MODO_POR_DEFECTO = 'auto';
export const MODO_ES = {
  auto: 'Con tu Rooti, de noche de 22 a 8',
  sistema: 'Como el teléfono',
  dia: 'Siempre de día',
  noche: 'Siempre de noche',
};

/** ¿Se ve de noche? Puro: recibe el modo, la hora y lo que dice el sistema. */
export function esModoNoche(modo, hora, oscuroDelSistema = false) {
  switch (modo) {
    case 'noche': return true;
    case 'dia': return false;
    case 'sistema': return Boolean(oscuroDelSistema);
    default: return hora >= 22 || hora < 8;
  }
}

/** La hora que usa la escena. */
export const horaLocal = (ahora = new Date(), almacen = globalThis.localStorage) => horaDePrueba(almacen) ?? ahora.getHours();

/** Avisa cuando otra pestaña (el emulador) cambia la hora de prueba. Devuelve el deshacer. */
export function alCambiarHora(f) {
  if (typeof window === 'undefined') return () => {};
  const oyente = (ev) => { if (ev.key === CLAVE_HORA || ev.key === null) f(horaLocal()); };
  window.addEventListener('storage', oyente);
  return () => window.removeEventListener('storage', oyente);
}
