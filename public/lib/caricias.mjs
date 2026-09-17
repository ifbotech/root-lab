/* caricias.mjs — acariciar a un Rooti en la pantalla del teléfono.
 *
 * Pasar el dedo por la cara (en la planta y en el modo escritorio) la pone
 * contenta: cierra los ojos en ^ ^, ronronea (art/face.c, rk_face_draw_mimo,
 * vía el mismo WebAssembly que dibuja el resto), el teléfono vibra un
 * poquito y suben corazones. Soltar la devuelve a su ánimo en un tercio de
 * segundo. No cambia nada del lado de la maceta: la planta no está mejor
 * porque la acaricien, y la cara vuelve a decir la verdad.
 *
 * Es con Pointer Events, así que anda con dedo, mouse y lápiz. Cuenta como
 * caricia un movimiento, no un toque: tocar la cara sin moverse no hace
 * nada, y en la planta el desplazamiento vertical sigue siendo para hacer
 * scroll (touch-action: pan-y); en el modo escritorio no hay scroll y vale
 * cualquier dirección.
 */

import { soltarParticulas } from './particulas.mjs';
import { ronronear } from './voz.mjs';

/* Vibración: dos toques cortos con un respiro. En ms. */
export const PATRON_VIBRACION = Object.freeze([20, 40, 20]);

/* Cuánto hay que moverse para que cuente como una caricia (px CSS). */
export const UMBRAL_CARICIA_PX = 14;

/* Al soltar, cuánto sigue contenta antes de volver a su ánimo. */
export const SOLTAR_MS = 700;

/* Entre dos vibraciones (y dos tandas de corazones), como mínimo. */
export const CADA_MS = 260;

/** Si moverse (dx, dy) desde el último punto es una caricia. */
export const esCaricia = (dx, dy) => Math.hypot(dx, dy) >= UMBRAL_CARICIA_PX;

/** Vibra si el aparato sabe. Devuelve si pudo. */
export function vibrar(nav = typeof navigator !== 'undefined' ? navigator : null) {
  try {
    return Boolean(nav && typeof nav.vibrate === 'function' && nav.vibrate(PATRON_VIBRACION));
  } catch {
    return false;
  }
}

/**
 * Hace acariciable un elemento. Llama `alEmpezar()` con la primera caricia,
 * `alCaricia({ x, y })` en cada tramo (como mucho cada CADA_MS, con las
 * coordenadas relativas al elemento) y `alSoltar()` SOLTAR_MS después de
 * levantar el dedo. Devuelve la función que lo deshace.
 */
export function hacerAcariciable(el, { alEmpezar = () => {}, alCaricia = () => {}, alSoltar = () => {}, cadaMs = CADA_MS } = {}) {
  let puntero = null;
  let ancla = null;
  let acariciando = false;
  let ultima = -Infinity;
  let soltar = null;

  const relativo = (ev) => {
    const r = el.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  };

  const bajar = (ev) => {
    if (puntero !== null || (ev.pointerType === 'mouse' && ev.button !== 0)) return;
    puntero = ev.pointerId;
    ancla = { x: ev.clientX, y: ev.clientY };
    clearTimeout(soltar);
    soltar = null;
  };

  const mover = (ev) => {
    if (ev.pointerId !== puntero || !ancla) return;
    if (!esCaricia(ev.clientX - ancla.x, ev.clientY - ancla.y)) return;
    ancla = { x: ev.clientX, y: ev.clientY };
    if (!acariciando) {
      acariciando = true;
      try { el.setPointerCapture(puntero); } catch { /* no hace falta */ }
      alEmpezar();
    }
    const ahora = performance.now();
    if (ahora - ultima >= cadaMs) {
      ultima = ahora;
      alCaricia(relativo(ev));
    }
  };

  const levantar = (ev) => {
    if (ev.pointerId !== puntero) return;
    puntero = null;
    ancla = null;
    if (!acariciando) return;
    soltar = setTimeout(() => {
      acariciando = false;
      alSoltar();
    }, SOLTAR_MS);
  };

  el.addEventListener('pointerdown', bajar);
  el.addEventListener('pointermove', mover);
  el.addEventListener('pointerup', levantar);
  el.addEventListener('pointercancel', levantar);
  el.addEventListener('lostpointercapture', levantar);

  return () => {
    clearTimeout(soltar);
    el.removeEventListener('pointerdown', bajar);
    el.removeEventListener('pointermove', mover);
    el.removeEventListener('pointerup', levantar);
    el.removeEventListener('pointercancel', levantar);
    el.removeEventListener('lostpointercapture', levantar);
  };
}

/**
 * Todo junto, para una cara de lib/caras.mjs: la caricia pone el mimo en el
 * lienzo (`acariciar`), vibra, suelta corazones sobre `escenario` (un
 * ancestro con position; si no, el padre del lienzo) y ronronea.
 * `direccion` es el touch-action: 'pan-y' deja hacer scroll vertical (la
 * planta), 'none' toma todo (el modo escritorio). Sirve igual para un
 * Rooti entero de lib/cuerpo.mjs, que también tiene `acariciar`.
 * `alEmpezar` avisa de cada caricia nueva (la mascota la cuenta).
 * Devuelve el deshacer.
 */
export function acariciarCara(lienzo, { escenario = null, direccion = 'pan-y', alEmpezar = () => {} } = {}) {
  if (!lienzo) return () => {};
  lienzo.style.touchAction = direccion;
  const donde = () => escenario || lienzo.parentElement;
  let pararRonroneo = null;
  const quitar = hacerAcariciable(lienzo, {
    alEmpezar: () => {
      lienzo.acariciar?.(true);
      pararRonroneo?.();
      pararRonroneo = ronronear();
      alEmpezar();
    },
    alCaricia: ({ x, y }) => {
      vibrar();
      const esc = donde();
      if (!esc) return;
      const a = lienzo.getBoundingClientRect();
      const b = esc.getBoundingClientRect();
      soltarParticulas(esc, { x: x + a.left - b.left, y: y + a.top - b.top });
    },
    alSoltar: () => {
      lienzo.acariciar?.(false);
      pararRonroneo?.();
      pararRonroneo = null;
    },
  });
  return () => {
    pararRonroneo?.();
    quitar();
  };
}
