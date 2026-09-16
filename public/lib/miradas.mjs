/* miradas.mjs — hacia dónde mira cada Rooti en el invernadero.
 *
 * En el estante están todos juntos, y los Rooties se miran: cada tanto uno
 * le echa un vistazo al de al lado, y cuando uno tiene sed o frío, los
 * vecinos lo miran con preocupación (art/face.c, rk_face_draw_mirada, vía
 * WebAssembly). No cambia nada de lo que miden: es la escena, no el dato.
 *
 * Todo es función del tiempo y de la fila: dos teléfonos abiertos en el
 * mismo instante muestran las mismas miradas, y se prueba sin navegador.
 */

/* Los ánimos que preocupan a los vecinos. */
export const PREOCUPANTES = new Set(['THIRSTY', 'COLD', 'DROWNING']);

/* Cuánto dura un ciclo de vistazos y cuándo, dentro de él, mira. */
export const CICLO_S = 11;
export const VISTAZO = [4, 5.6];
export const VISTAZO_CORTO = [8.5, 9.4];
/* Preocupado, mira al vecino 6 de cada 9 segundos: hasta el más
 * preocupado descansa la vista. */
export const CICLO_PREOCUPADO_S = 9;
export const MIRA_PREOCUPADO_S = 6;

const enfermo = (n) => Boolean(n?.revelado) && PREOCUPANTES.has(n.mood);

/** El vecino con problemas más cercano a `i` (índice), o -1. */
export function vecinoEnfermo(i, nodos) {
  let mejor = -1;
  for (let j = 0; j < nodos.length; j++) {
    if (j === i || !enfermo(nodos[j])) continue;
    if (mejor < 0 || Math.abs(j - i) < Math.abs(mejor - i)) mejor = j;
  }
  return mejor;
}

/**
 * La mirada del Rooti `i` de la fila `nodos` en el instante `tMs`:
 * `{ mira_x, mira_y, preocupado }` (-100..100, -100..100, 0..100).
 */
export function miradaDe(i, nodos, tMs) {
  const quieta = { mira_x: 0, mira_y: 0, preocupado: 0 };
  const n = nodos[i];
  if (!n || !n.revelado || nodos.length < 2 || enfermo(n)) return quieta;
  const s = tMs / 1000;

  const j = vecinoEnfermo(i, nodos);
  if (j >= 0) {
    const dist = Math.abs(j - i);
    const fase = (s + i * 1.3) % CICLO_PREOCUPADO_S;
    if (fase >= MIRA_PREOCUPADO_S) return quieta;
    const lado = Math.sign(j - i);
    return {
      mira_x: lado * (dist === 1 ? 85 : 60),
      mira_y: dist === 1 ? 25 : 10,
      preocupado: dist === 1 ? 100 : 60,
    };
  }

  /* Todos bien: un vistazo al de al lado cada tanto, a destiempo entre uno
     y otro para que no parezca coreografía. */
  const fase = (s + i * 2.3) % CICLO_S;
  const derecha = i + 1 < nodos.length;
  const izquierda = i > 0;
  if (fase >= VISTAZO[0] && fase < VISTAZO[1]) {
    return { mira_x: derecha ? 70 : -70, mira_y: 0, preocupado: 0 };
  }
  if (fase >= VISTAZO_CORTO[0] && fase < VISTAZO_CORTO[1]) {
    return { mira_x: izquierda ? -70 : 70, mira_y: 0, preocupado: 0 };
  }
  return quieta;
}

/** Las miradas de toda la fila. */
export const miradasDe = (nodos, tMs) => nodos.map((_, i) => miradaDe(i, nodos, tMs));
