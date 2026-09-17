/* coleccion.mjs — las pieles que salieron de tus cofres, y los logros.
 *
 * Qué Rooti tenés lo decide la figura que compraste; el cofre de cada uno
 * sortea su piel: común (70 %), rara (25 %) o épica (5 %). La colección es
 * de pieles: cinco Rooties por tres rarezas, quince casilleros. Se llena
 * sola al abrir cofres: no hay nada que declarar ni que comprar adentro de
 * la app.
 *
 * Las que faltan se muestran en silueta con su probabilidad, para que el
 * azar sea transparente.
 */
import { h, render, icono } from '../lib/ui.mjs';
import { RAREZA_ES, ordenarColeccion, progresoColeccion } from '../lib/model.mjs';
import { evaluarLogros } from '../lib/gamificacion.mjs';
import { cuerpo } from '../lib/cuerpo.mjs';
import { paletaPorId } from '../lib/paletas.mjs';

function chipPaleta(id) {
  const p = paletaPorId(id);
  if (!p) return null;
  return h('span', { class: 'chip-paleta', title: `Pinta ROOTLAB: ${p.nombre}` },
    p.colores.map((c) => h('i', { style: `background:${c.hex}` })));
}

const pct = (p) => `${Math.round(p * 100)} %`;

function casillero(m, piel) {
  return h('li', { class: `piel rar-${piel.rareza} ${piel.tengo ? 'tengo' : 'falta'}` },
    h('div', { class: 'piel-escena', style: piel.tengo ? `background:${piel.fondo}` : '' },
      cuerpo({
        persona: m.id, rareza: piel.rareza, lado: 92, estatico: true, dormido: !piel.tengo,
        etiqueta: piel.tengo ? `${m.nombre}, piel ${piel.nombre}` : `Una piel ${RAREZA_ES[piel.rareza]} de ${m.nombre} que todavía no tenés`,
      })),
    h('span', { class: 'modelo-rareza' }, RAREZA_ES[piel.rareza] || piel.rareza),
    h('b', { class: 'piel-nombre' }, piel.tengo ? piel.nombre : '???'),
    piel.tengo && piel.paleta ? chipPaleta(piel.paleta) : h('small', { class: 'modelo-prob' }, `${pct(piel.probabilidad)} por cofre`));
}

function fila(m) {
  return h('li', { class: `modelo ${m.tengo ? 'tengo' : 'falta'}` },
    h('div', { class: 'modelo-cab' },
      h('h3', {}, m.nombre),
      h('p', { class: 'modelo-lema' }, m.tengo ? m.lema : 'Llega con su figura.')),
    h('ul', { class: 'pieles' }, m.pieles.map((p) => casillero(m, p))));
}

export function vistaColeccion(ctx) {
  const { coleccion, estado, racha } = ctx;
  const catalogo = ordenarColeccion(coleccion?.catalogo || []);
  const p = progresoColeccion(catalogo, coleccion?.tengo || []);
  const logros = evaluarLogros({ nodos: estado?.nodes || [], racha, coleccion: p });
  const cont = h('div', { class: 'vista' });

  render(cont,
    h('header', { class: 'vista-cab coleccion-cab' },
      h('h2', {}, 'Rooties'),
      h('span', { class: 'coleccion-cuenta', 'aria-label': `${p.tengo} de ${p.total} pieles` }, String(p.tengo), h('small', {}, ` / ${p.total}`))),

    h('ul', { class: 'modelos' }, catalogo.map(fila)),

    h('p', { class: 'nota' }, p.completa
      ? 'Tenés las quince pieles. Cada figura nueva es otro cofre.'
      : 'La figura dice qué Rooti es; su cofre sortea la piel. Las probabilidades son las mismas para todos y no hay nada que comprar para cambiarlas. Cada piel pinta ROOTLAB con sus colores.'),

    h('section', { class: 'panel' },
      h('h3', { class: 'panel-tit' }, 'Logros'),
      h('ul', { class: 'logros' },
        logros.map((l) => h('li', { class: l.cumplido ? 'logro hecho' : 'logro' },
          icono(l.cumplido ? 'trofeo' : 'hoja', 20),
          h('div', {}, h('b', {}, l.nombre), h('span', {}, l.detalle)))))));
  return cont;
}
