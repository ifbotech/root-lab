/* cofre.mjs — qué Rooti es cada aparato, y qué piel sale del cofre.
 *
 * LA FIGURA ES EL PERSONAJE
 *
 * Qué Rooti es un ROOTKIT lo decide la figura impresa que viene en la caja:
 * la fábrica lo graba en la NVS y el aparato lo cuenta en cada sync
 * (`persona`). La app lo reconoce apenas se vincula ("¡Conectaste a tu
 * Brote!"): no hay nada que sortear, la persona ya lo tiene en la mano.
 *
 * Una placa de desarrollo sin persona grabada es siempre el mismo Rooti,
 * elegido por su id: así el emulador y los prototipos también tienen uno, y
 * no cambia entre un sync y el siguiente.
 *
 * EL COFRE SORTEA LA PIEL
 *
 * Al abrir el cofre sale la rareza, una sola vez por vínculo: común (70 %),
 * rara (25 %) o épica (5 %). Cada una es una paleta de ese Rooti, en la app y
 * en la pantalla de la maceta. Las probabilidades son públicas —la app las
 * muestra antes de abrir— y no hay nada que comprar para cambiarlas.
 */
import { randomInt, createHash } from 'node:crypto';
import { MODELOS, RAREZAS, modeloPorId } from '../public/lib/rooties.mjs';

/* Probabilidad de cada rareza, en milésimas. */
export const PROBABILIDADES = { comun: 700, raro: 250, epico: 50 };

export const probabilidadDe = (rareza) => (PROBABILIDADES[rareza] ?? 0) / 1000;

/** Sortea la rareza. `azar(n)` devuelve un entero en [0, n). */
export function sortearRareza(azar = randomInt) {
  let r = azar(1000);
  for (const rareza of RAREZAS) {
    if (r < PROBABILIDADES[rareza]) return rareza;
    r -= PROBABILIDADES[rareza];
  }
  return 'comun';
}

/* Los Rooties de la primera tanda, por si una placa vieja todavía los tiene
 * grabados o una base vieja los guardó. Cada uno pasa al más parecido de los
 * nuevos, y su rareza de caja a la de piel. */
export const LEGADO = {
  cresta: { persona: 'pinchito', rareza: 'comun' },
  kawaii: { persona: 'brote', rareza: 'comun' },
  visor: { persona: 'bulbo', rareza: 'comun' },
  ciclope: { persona: 'bulbo', rareza: 'raro' },
  hongo: { persona: 'champi', rareza: 'raro' },
  'chico-malo': { persona: 'pinchito', rareza: 'comun' },
  'chica-chill': { persona: 'musgo', rareza: 'comun' },
  glitch: { persona: 'bulbo', rareza: 'epico' },
};

/** Un id de Rooti válido, traduciendo los de la primera tanda; null si no es ninguno. */
export function normalizarPersona(id) {
  const s = String(id || '').trim().toLowerCase();
  if (modeloPorId(s)) return s;
  return LEGADO[s]?.persona || null;
}

/** Qué Rooti es un aparato: el grabado en fábrica, o uno fijo por su id. */
export function personaDeAparato(d) {
  const grabada = normalizarPersona(d?.persona_fabrica);
  if (grabada) return grabada;
  const h = createHash('sha256').update(String(d?.id || '')).digest();
  return MODELOS[h[0] % MODELOS.length].id;
}
