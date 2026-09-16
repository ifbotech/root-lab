/* cofre.mjs — qué personaje sale del cofre.
 *
 * DOS CASOS
 *
 * 1. La maceta trae persona de fábrica (el caso del producto): la carcasa
 *    impresa ya es un personaje, así que el cofre REVELA la que viene
 *    grabada. No hay azar en el software; el azar ocurrió al armar la caja.
 *
 * 2. La maceta no trae persona (prototipos, placas de desarrollo): el cofre
 *    tira. Las probabilidades son públicas —la app las muestra antes de
 *    abrir— y no hay nada que comprar para cambiarlas: el cofre viene con
 *    el aparato y se abre una vez.
 */
import { randomInt } from 'node:crypto';
import { MODELOS, modeloPorId } from './catalogo.mjs';

/* Probabilidad de cada rareza, en milésimas. */
export const PROBABILIDADES = { COMUN: 700, RARO: 250, SECRETO: 50 };

export function probabilidadDe(modelo) {
  const mismos = MODELOS.filter((m) => m.rareza === modelo.rareza).length;
  return PROBABILIDADES[modelo.rareza] / mismos / 1000;
}

/** Tira el cofre. `azar(n)` devuelve un entero en [0, n). */
export function tirarCofre(azar = randomInt) {
  let r = azar(1000);
  for (const rareza of ['COMUN', 'RARO', 'SECRETO']) {
    const p = PROBABILIDADES[rareza];
    if (r < p) {
      const deEsa = MODELOS.filter((m) => m.rareza === rareza);
      return deEsa[azar(deEsa.length)];
    }
    r -= p;
  }
  return MODELOS[0];
}

export function abrirCofre(personaDeFabrica, azar = randomInt) {
  return modeloPorId(personaDeFabrica) || tirarCofre(azar);
}
