/* tema.mjs — aplicar una paleta a la app, con la animación de pintar.
 *
 * Los colores salen de paletas.mjs (el motor que garantiza contraste); acá
 * sólo se aplican como variables de CSS en <html>, se recuerdan en el
 * teléfono para la próxima apertura (tema.js) y se actualiza el color de la
 * barra del sistema.
 *
 * CUANDO TE TOCA UN ROOTI, LA APP SE PINTA
 *
 * Con `animar`, el cambio usa View Transitions: la paleta nueva entra como un
 * círculo que crece desde `origen` (el cofre, o la muestra que tocaste en
 * Ajustes) hasta cubrir la pantalla. Donde no hay View Transitions, o si la
 * persona pidió menos movimiento, el cambio es instantáneo.
 */
import { PALETA_POR_DEFECTO, paletaPorId, temaDesdePaleta } from './paletas.mjs';

const CLAVE = 'rootlab:tema';

function leerGuardada() {
  try { return JSON.parse(localStorage.getItem(CLAVE) || 'null'); } catch { return null; }
}

let actual = leerGuardada()?.id || PALETA_POR_DEFECTO;

export const paletaActual = () => actual;

function pintar(paleta) {
  const tokens = temaDesdePaleta(paleta);
  const raiz = document.documentElement.style;
  for (const [k, v] of Object.entries(tokens)) raiz.setProperty(`--${k}`, v);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', tokens.fondo);
  try { localStorage.setItem(CLAVE, JSON.stringify({ id: paleta.id, tokens })); } catch { /* modo privado */ }
  actual = paleta.id;
}

/**
 * Aplica la paleta `id` (o la de ROOTLAB si no existe). Devuelve una promesa
 * que termina cuando terminó de pintarse; `true` si cambió algo.
 */
export function aplicarPaleta(id, { animar = false, origen = null } = {}) {
  const paleta = paletaPorId(id) || paletaPorId(PALETA_POR_DEFECTO);
  const yaPintada = Boolean(document.documentElement.style.getPropertyValue('--fondo'));
  if (paleta.id === actual && (yaPintada || paleta.id === PALETA_POR_DEFECTO)) return Promise.resolve(false);

  const menosMovimiento = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (animar && !menosMovimiento && typeof document.startViewTransition === 'function') {
    if (origen?.getBoundingClientRect) {
      const r = origen.getBoundingClientRect();
      document.documentElement.style.setProperty('--pintar-x', `${Math.round(r.left + r.width / 2)}px`);
      document.documentElement.style.setProperty('--pintar-y', `${Math.round(r.top + r.height / 2)}px`);
    }
    const t = document.startViewTransition(() => pintar(paleta));
    return t.finished.then(() => true, () => true);
  }
  pintar(paleta);
  return Promise.resolve(true);
}

/** Lee un token ya aplicado (para dibujar gráficos en canvas o SVG). */
export function token(nombre) {
  return getComputedStyle(document.documentElement).getPropertyValue(`--${nombre}`).trim();
}
