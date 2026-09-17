/* desk.mjs — el modo escritorio: tu Rooti a pantalla completa.
 *
 * Un teléfono viejo apoyado en el escritorio, con la cara de la planta y
 * nada más. Es la maceta, vista desde el escritorio: la misma cara que está
 * poniendo el Rooti ahora, grande, con la luz que hay donde está la planta
 * (lib/luz.mjs) y que se deja acariciar (lib/caricias.mjs).
 *
 *   - La pantalla no se apaga (Wake Lock) mientras la vista esté abierta y
 *     visible; se vuelve a pedir al volver a la pestaña.
 *   - Pantalla completa, con un botón, donde el navegador lo permite.
 *   - De noche (lib/desk.mjs: menos de 10 lux, o de 23 a 7) se apaga casi
 *     del todo, sin dejar de estar.
 *
 * Los controles (volver, pantalla completa) se esconden solos; tocar la
 * pantalla los trae. Se llega desde la planta ("Modo escritorio") o por la
 * URL /desk/<id>, que sirve para dejarla como página de inicio. La app la
 * repinta sola cuando cambia el estado (app.js, refrescar), y la cara nueva
 * arranca desde el ánimo que tenía la anterior (lib/caras.mjs, `clave`).
 */
import { h, render, icono } from '../lib/ui.mjs';
import { cara } from '../lib/caras.mjs';
import { pielDe } from '../lib/rooties.mjs';
import { acariciarCara } from '../lib/caricias.mjs';
import { esDeNoche, ladoDesk, RELOJ_MS, OCULTAR_CONTROLES_MS } from '../lib/desk.mjs';
import { ETAPAS, etapaDe } from '../lib/model.mjs';

/* Un solo pedido de Wake Lock para toda la app: pedirlo dos veces no hace
   nada; se suelta cuando la vista se va. */
let candado = null;
let pidiendo = false;

async function pedirCandado() {
  if (pidiendo || (candado && !candado.released) || !navigator.wakeLock || document.hidden) return;
  pidiendo = true;
  try { candado = await navigator.wakeLock.request('screen'); } catch { candado = null; }
  pidiendo = false;
}

async function soltarCandado() {
  const c = candado;
  candado = null;
  if (c && !c.released) await c.release().catch(() => {});
}

export function vistaDesk(ctx) {
  const { estado, plantaId, irA, repintar } = ctx;
  const n = (estado?.nodes || []).find((x) => x.id === plantaId);
  const cont = h('div', { class: 'desk' });

  if (!n) {
    render(cont, h('section', { class: 'panel vacio' },
      h('p', {}, 'Esa planta ya no está.'),
      h('button', { class: 'boton', type: 'button', onClick: () => irA('plantas') }, 'Volver')));
    return cont;
  }

  const lado = ladoDesk(window.innerWidth, window.innerHeight);
  const lux = n.tel?.lux ?? null;

  const piel = n.revelado ? pielDe(n.modelo, n.rareza || 'comun') : null;
  const lienzo = cara({
    persona: n.modelo || '',
    rareza: n.rareza || 'comun',
    modo: n.revelado ? 'cara' : 'dormida',
    animo: n.mood,
    etapa: ETAPAS.indexOf(etapaDe(n.bond?.dias_sanos ?? 0)),
    lado,
    fps: 24,
    clave: n.id,
    lux,
    etiqueta: `${n.nombre || 'Tu Rooti'}: ${n.reason || ''}`,
  });

  const marco = h('div', { class: 'desk-cara', style: piel ? `--piel:${piel.fondo}` : '' }, lienzo);
  const nombre = h('p', { class: 'desk-nombre' }, h('b', {}, n.nombre || 'Tu Rooti'), h('span', {}, n.reason || ''));
  const noche = h('span', { class: 'desk-noche', 'aria-hidden': 'true' }, icono('luna', 22));

  const volver = h('button', { class: 'boton chico', type: 'button', onClick: () => irA('planta', n.id) }, icono('volver', 18), 'Volver');
  const pantalla = document.fullscreenEnabled
    ? h('button', {
        class: 'boton chico', type: 'button',
        onClick: async () => {
          try {
            if (document.fullscreenElement) await document.exitFullscreen();
            else await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
          } catch { /* el navegador no quiso: no pasa nada */ }
          mostrarControles();
        },
      }, icono('pantalla', 16), 'Pantalla completa')
    : null;
  const controles = h('div', { class: 'desk-controles' }, volver, pantalla);

  /* Los controles se esconden solos; tocar la pantalla los trae. */
  let ocultador = null;
  const mostrarControles = () => {
    cont.classList.add('con-controles');
    clearTimeout(ocultador);
    ocultador = setTimeout(() => cont.classList.remove('con-controles'), OCULTAR_CONTROLES_MS);
  };
  cont.addEventListener('pointerdown', (ev) => { if (ev.target === cont || nombre.contains(ev.target)) mostrarControles(); });
  mostrarControles();

  /* La caricia: en el escritorio no hay scroll, vale cualquier dirección. */
  const quitarCaricia = n.revelado ? acariciarCara(lienzo, { escenario: cont, direccion: 'none' }) : () => {};

  /* La noche, revisada cada minuto (la hora cambia aunque la luz no). */
  const revisarNoche = () => cont.classList.toggle('noche', esDeNoche({ lux }));
  revisarNoche();
  const reloj = setInterval(revisarNoche, RELOJ_MS);

  /* La pantalla que no se apaga. */
  pedirCandado();
  const alVisible = () => { if (!document.hidden && cont.isConnected) pedirCandado(); };
  document.addEventListener('visibilitychange', alVisible);

  /* Girar el teléfono cambia el lado de la cara: se vuelve a pintar. */
  let tGiro = null;
  const alGirar = () => { clearTimeout(tGiro); tGiro = setTimeout(() => { if (cont.isConnected) repintar?.(); }, 200); };
  window.addEventListener('resize', alGirar);

  /* Cuando la vista se va (otra ruta), se suelta todo. */
  const vigia = new MutationObserver(() => {
    if (cont.isConnected) return;
    vigia.disconnect();
    clearInterval(reloj);
    clearTimeout(ocultador);
    clearTimeout(tGiro);
    window.removeEventListener('resize', alGirar);
    document.removeEventListener('visibilitychange', alVisible);
    quitarCaricia();
    /* Si sólo se repintó el modo escritorio, el candado y la pantalla
       completa siguen; si se fue a otra vista, se sueltan. */
    if (!document.body.classList.contains('desk')) {
      soltarCandado();
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    }
  });
  queueMicrotask(() => { if (cont.parentNode) vigia.observe(cont.parentNode, { childList: true }); });

  render(cont, controles, noche, marco, nombre);
  return cont;
}
