/* ui.mjs — las cuatro funciones que reemplazan a un framework.
 *
 * POR QUÉ NO HAY REACT ACÁ
 *
 * No por purismo: por despliegue. Sin build step, publicar la app es copiar
 * una carpeta, `make serve` anda sin instalar nada, y no hay un `node_modules`
 * que se pudra entre una sesión y la siguiente. Para una app que mantiene una
 * persona y que se actualiza cuando esa persona tiene un rato, eso vale más
 * que el azúcar sintáctico.
 *
 * Lo que sí hace falta de un framework es no escribir `document.createElement`
 * cuarenta veces, y eso son las cuatro funciones de abajo. Si algún día el
 * proyecto necesita React de verdad, entra por CDN sin tocar el resto.
 *
 * LA REGLA DE SEGURIDAD
 *
 * `h()` escapa TODO lo que recibe como texto. Nada de lo que venga del
 * servidor —un nombre de planta que puso el usuario, un lema, un mensaje de
 * error— toca `innerHTML` sin pasar por acá.
 */

/** Escapa texto para meterlo en HTML. */
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/**
 * Crea un elemento. `attrs` acepta:
 *   class, id, y cualquier atributo como string
 *   on<Evento>: función        -> addEventListener
 *   dataset: { k: v }
 *   html: string               -> innerHTML, ya escapado por quien llama
 * Los hijos pueden ser nodos, strings (se escapan solos) o null.
 */
export function h(tag, attrs = {}, ...hijos) {
  const el = document.createElement(tag);

  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'html') { el.innerHTML = v; continue; }
    if (k === 'dataset') { Object.assign(el.dataset, v); continue; }
    if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), v);
      continue;
    }
    if (v === true) { el.setAttribute(k, ''); continue; }
    el.setAttribute(k, String(v));
  }

  for (const c of hijos.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** Vacía un contenedor y le pone hijos nuevos. */
export function render(contenedor, ...hijos) {
  if (!contenedor) return;
  contenedor.replaceChildren(...hijos.flat(Infinity).filter(Boolean));
}

/** Atajo de querySelector, que se usa en todos lados. */
export const $ = (sel, raiz = document) => raiz.querySelector(sel);

/* ------------------------------------------------------------- iconos --- */
/* SVG inline en vez de una fuente de iconos o PNGs: son doce formas simples,
   escalan sin pixelarse, toman el color del texto y no agregan un pedido de
   red. El viewBox es 24x24 en todos para que se puedan intercambiar. */
const TRAZOS = {
  gota: 'M12 3 C12 3 5 11 5 15 a7 7 0 0 0 14 0 C19 11 12 3 12 3 Z',
  'gota-no': 'M12 3 C12 3 5 11 5 15 a7 7 0 0 0 14 0 C19 11 12 3 12 3 Z M4 4 L20 20',
  sol: 'M12 7 a5 5 0 1 0 0 10 a5 5 0 0 0 0-10 Z M12 1 L12 3 M12 21 L12 23 M1 12 L3 12 M21 12 L23 12 M4 4 L6 6 M18 18 L20 20 M20 4 L18 6 M6 18 L4 20',
  luna: 'M20 14 A9 9 0 1 1 10 4 a7 7 0 0 0 10 10 Z',
  copo: 'M12 2 L12 22 M3 7 L21 17 M21 7 L3 17',
  termometro: 'M14 14.5 V4 a2 2 0 0 0-4 0 v10.5 a4 4 0 1 0 4 0 Z',
  viento: 'M3 8 h11 a3 3 0 1 0-3-3 M3 13 h15 a3 3 0 1 1-3 3 M3 18 h8',
  antena: 'M12 20 V9 M8 9 a4 4 0 0 1 8 0 M5 9 a7 7 0 0 1 14 0 M4 4 L20 20',
  pila: 'M2 8 h16 v8 H2 Z M20 11 v2 M5 10 v4',
  lupa: 'M11 4 a7 7 0 1 0 0 14 a7 7 0 0 0 0-14 Z M16 16 L21 21',
  caja: 'M3 7 L12 3 L21 7 v10 L12 21 L3 17 Z M3 7 L12 11 L21 7 M12 11 v10',
  hoja: 'M20 4 C20 4 6 3 6 13 a6 6 0 0 0 12 0 C18 8 12 8 9 16 M4 20 L9 16',
  rayo: 'M13 2 L4 14 h6 l-1 8 L18 10 h-6 Z',
  llama: 'M12 2 s5 5 5 9 a5 5 0 0 1-10 0 c0-2 2-4 2-4 s1 2 2 2 s1-5 1-7 Z',
  tilde: 'M4 12 L9 18 L20 5',
  camara: 'M3 7 h4 l2-2 h6 l2 2 h4 v12 H3 Z M12 16 a3.5 3.5 0 1 0 0-7 a3.5 3.5 0 0 0 0 7 Z',
  casa: 'M3 11 L12 3 L21 11 M5 10 v10 h14 V10',
  reloj: 'M12 3 a9 9 0 1 0 0 18 a9 9 0 0 0 0-18 Z M12 7 v5 l3 2',
  trofeo: 'M7 4 h10 v5 a5 5 0 0 1-10 0 Z M7 5 H4 v2 a3 3 0 0 0 3 3 M17 5 h3 v2 a3 3 0 0 1-3 3 M12 14 v4 M8 20 h8',
  wifi: 'M2 9 a15 15 0 0 1 20 0 M5 12.5 a10 10 0 0 1 14 0 M8.5 16 a5 5 0 0 1 7 0 M12 19.5 h.01',
  campana: 'M6 16 V11 a6 6 0 0 1 12 0 v5 l2 2 H4 Z M10 21 h4',
  mas: 'M12 5 v14 M5 12 h14',
  compartir: 'M12 3 v12 M7 8 l5-5 5 5 M5 13 v7 h14 v-7',
  telefono: 'M7 2 h10 v20 H7 Z M11 18 h2',
  flecha: 'M5 12 h14 M13 6 l6 6 -6 6',
  basura: 'M4 7 h16 M9 7 V4 h6 v3 M6 7 l1 13 h10 l1-13',
  enchufe: 'M9 2 v6 M15 2 v6 M6 8 h12 v4 a6 6 0 0 1-12 0 Z M12 18 v4',
  chat: 'M4 5 h16 v11 H10 l-5 4 v-4 H4 Z M8 9.5 h8 M8 12.5 h5',
  candado: 'M6 11 h12 v10 H6 Z M8.5 11 V8 a3.5 3.5 0 0 1 7 0 v3 M12 15 v2',
  paleta: 'M12 3 a9 9 0 1 0 0 18 c1.5 0 2-1 2-2 s-1-2 0-3 h3 a4 4 0 0 0 4-4 C21 7 17 3 12 3 Z M7.5 12 h.01 M9 7.5 h.01 M15 7.5 h.01',
};

/** Un icono SVG. `lado` en pixeles. */
export function icono(nombre, lado = 20) {
  const d = TRAZOS[nombre] || TRAZOS.hoja;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(lado));
  svg.setAttribute('height', String(lado));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', d);
  svg.append(path);
  return svg;
}

/**
 * Barra de rango con la zona cómoda marcada.
 *
 * Es el widget que convierte un número suelto en algo interpretable: un "34%"
 * no dice nada sin saber que la especie quiere entre 25 y 60. Es el mismo
 * gráfico que el firmware dibujaba en la pantalla del aparato antes de que
 * los datos se mudaran acá.
 */
export function medidor({ valor, min, max, lo, hi, etiqueta, texto, estado }) {
  const span = max - min;
  const pct = (v) => Math.min(100, Math.max(0, ((v - min) * 100) / span));
  const hayRango = Number.isFinite(lo) && Number.isFinite(hi) && span > 0;

  return h('div', { class: `medidor medidor-${estado || 'ok'}` },
    h('div', { class: 'medidor-cab' },
      h('span', { class: 'medidor-et' }, etiqueta),
      h('span', { class: 'medidor-val' }, texto)),
    h('div', { class: 'medidor-pista' },
      hayRango
        ? h('i', {
            class: 'medidor-zona',
            style: `left:${pct(lo)}%;width:${Math.max(2, pct(hi) - pct(lo))}%`,
          })
        : null,
      Number.isFinite(valor)
        ? h('b', { class: 'medidor-tick', style: `left:${pct(valor)}%` })
        : null));
}

/** Barra de progreso simple, para vínculo y nivel. */
export function progreso(pct, clase = '') {
  const p = Math.min(100, Math.max(0, Math.round(pct || 0)));
  return h('div', { class: `progreso ${clase}` },
    h('i', { style: `width:${p}%` }));
}
