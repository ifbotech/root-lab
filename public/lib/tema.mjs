/* tema.mjs — aplicar una paleta a la app, de día o de noche, con la animación de pintar.
 *
 * Los colores salen de paletas.mjs (el motor que garantiza contraste); acá
 * sólo se aplican como variables de CSS en <html>, se recuerdan en el
 * teléfono para la próxima apertura (tema.js) y se actualiza el color de la
 * barra del sistema.
 *
 * DE DÍA Y DE NOCHE
 *
 * Cada paleta clara trae su versión de noche. Cuál se ve lo decide el MODO,
 * que se elige en Ajustes y se guarda en el teléfono (es de la pantalla, no
 * de la cuenta):
 *
 *   auto      de noche de 22 a 8, como el Rooti que se sienta a dormir
 *   sistema   lo que diga el teléfono (prefers-color-scheme)
 *   dia       siempre clara
 *   noche     siempre oscura
 *
 * `vigilarNoche()` vuelve a mirar cada minuto, cuando cambia el sistema y
 * cuando el emulador cambia la hora de prueba.
 *
 * CUANDO SALE LA PIEL, LA APP SE PINTA
 *
 * Con `animar`, el cambio usa View Transitions: la paleta nueva entra como un
 * círculo que crece desde `origen` (el cofre, o la muestra que tocaste en
 * Ajustes) hasta cubrir la pantalla. Donde no hay View Transitions, o si la
 * persona pidió menos movimiento, el cambio es instantáneo.
 */
import { PALETA_POR_DEFECTO, paletaPorId, temaDesdePaleta, temaNocheDePaleta } from './paletas.mjs';
import { MODOS, MODO_POR_DEFECTO, esModoNoche, horaLocal, alCambiarHora } from './reloj.mjs';

const CLAVE = 'rootlab:tema';
const CLAVE_MODO = 'rootlab:modo';

function leerGuardada() {
  try { return JSON.parse(localStorage.getItem(CLAVE) || 'null'); } catch { return null; }
}

let actual = leerGuardada()?.id || PALETA_POR_DEFECTO;
let nocheAplicada = null;

export const paletaActual = () => actual;

export function modoActual() {
  try {
    const m = localStorage.getItem(CLAVE_MODO);
    return MODOS.includes(m) ? m : MODO_POR_DEFECTO;
  } catch { return MODO_POR_DEFECTO; }
}

const oscuroDelSistema = () => Boolean(window.matchMedia?.('(prefers-color-scheme: dark)').matches);
export const esDeNocheAhora = () => esModoNoche(modoActual(), horaLocal(), oscuroDelSistema());

function pintar(paleta) {
  const dia = temaDesdePaleta(paleta);
  const noche = temaNocheDePaleta(paleta);
  const deNoche = esDeNocheAhora();
  const tokens = deNoche ? noche : dia;
  /* El estilo (claro, cristal, oled, solar) es lo que los tokens no pueden
     decir. Una paleta clara, de noche, deja de ser "clara". */
  const estilo = paleta.estilo || '';
  const estiloNoche = paleta.claro ? '' : estilo;
  const raiz = document.documentElement;
  for (const [k, v] of Object.entries(tokens)) raiz.style.setProperty(`--${k}`, v);
  raiz.dataset.estilo = deNoche ? estiloNoche : estilo;
  raiz.dataset.noche = deNoche ? '1' : '0';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', tokens.fondo);
  try {
    localStorage.setItem(CLAVE, JSON.stringify({ id: paleta.id, tokens: dia, tokensNoche: noche, estilo, estiloNoche }));
  } catch { /* modo privado */ }
  actual = paleta.id;
  nocheAplicada = deNoche;
}

/**
 * Aplica la paleta `id` (o la de ROOTLAB si no existe). Devuelve una promesa
 * que termina cuando terminó de pintarse; `true` si cambió algo.
 */
export function aplicarPaleta(id, { animar = false, origen = null } = {}) {
  const paleta = paletaPorId(id) || paletaPorId(PALETA_POR_DEFECTO);
  const yaPintada = Boolean(document.documentElement.style.getPropertyValue('--fondo'));
  if (paleta.id === actual && yaPintada && nocheAplicada === esDeNocheAhora()) return Promise.resolve(false);

  const menosMovimiento = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (animar && !menosMovimiento && typeof document.startViewTransition === 'function') {
    if (origen?.getBoundingClientRect) {
      const r = origen.getBoundingClientRect();
      document.documentElement.style.setProperty('--pintar-x', `${Math.round(r.left + r.width / 2)}px`);
      document.documentElement.style.setProperty('--pintar-y', `${Math.round(r.top + r.height / 2)}px`);
    }
    const t = document.startViewTransition(() => pintar(paleta));
    /* El navegador puede abortar la animación (la página se ocultó, cambió
       el tamaño...): los colores igual se aplican, sólo no hay círculo. */
    t.ready.catch(() => {});
    t.updateCallbackDone.catch(() => { if (actual !== paleta.id) pintar(paleta); });
    return t.finished.then(() => true, () => true);
  }
  pintar(paleta);
  return Promise.resolve(true);
}

/** Elige el modo (auto, sistema, dia, noche) y repinta. */
export function fijarModo(modo, opciones = {}) {
  try { localStorage.setItem(CLAVE_MODO, MODOS.includes(modo) ? modo : MODO_POR_DEFECTO); } catch { /* modo privado */ }
  nocheAplicada = null;
  return aplicarPaleta(actual, opciones);
}

/** Vuelve a mirar si es de noche: cada minuto, con el sistema y con la hora de prueba. */
export function vigilarNoche() {
  const mirar = () => { if (nocheAplicada !== esDeNocheAhora()) aplicarPaleta(actual); };
  const reloj = setInterval(mirar, 60000);
  const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
  mq?.addEventListener?.('change', mirar);
  const quitarHora = alCambiarHora(mirar);
  return () => { clearInterval(reloj); mq?.removeEventListener?.('change', mirar); quitarHora(); };
}

/** Lee un token ya aplicado (para dibujar gráficos en canvas o SVG). */
export function token(nombre) {
  return getComputedStyle(document.documentElement).getPropertyValue(`--${nombre}`).trim();
}
