/* coleccion.mjs — los Rooties que ya salieron de tus cofres, y los logros.
 *
 * Cada Rooti trae un cofre y el cofre revela quién es. La colección se
 * llena sola al abrirlos: no hay nada que declarar ni que comprar adentro de
 * la app.
 *
 * Los que faltan se muestran en silueta con su probabilidad, para que el
 * azar sea transparente. El secreto no se lista hasta que aparece: mostrarlo
 * en gris ya contaría que existe.
 */
import { h, render, icono } from '../lib/ui.mjs';
import { RAREZA_ES, ordenarColeccion, progresoColeccion } from '../lib/model.mjs';
import { evaluarLogros } from '../lib/gamificacion.mjs';
import { cara } from '../lib/caras.mjs';
import { paletaPorId } from '../lib/paletas.mjs';

function chipPaleta(id) {
  const p = paletaPorId(id);
  if (!p) return null;
  return h('span', { class: 'chip-paleta', title: `Pinta ROOTLAB: paleta ${p.nombre}` },
    p.colores.filter((_, i) => i % 2 === 0).slice(0, 5).map((c) => h('i', { style: `background:${c.hex}` })));
}

function ficha(m) {
  return h('li', { class: `modelo rar-${m.rareza.toLowerCase()} ${m.tengo ? 'tengo' : 'falta'}` },
    h('div', { class: 'cara-marco', style: `background:${m.fondo}` },
      cara({ persona: m.id, animo: 'HAPPY', lado: 96, fps: m.tengo ? 12 : 1, etiqueta: m.tengo ? m.nombre : 'Un Rooti que todavía no tenés' })),
    h('h3', {}, m.tengo ? m.nombre : '???'),
    h('span', { class: 'modelo-rareza' }, RAREZA_ES[m.rareza] || m.rareza),
    m.tengo && m.paleta ? chipPaleta(m.paleta) : null,
    m.tengo ? h('p', { class: 'modelo-lema' }, m.lema) : h('p', { class: 'modelo-prob' }, `${(m.probabilidad * 100).toFixed(m.probabilidad < 0.1 ? 1 : 0)} % por cofre`));
}

export function vistaColeccion(ctx) {
  const { coleccion, estado, racha } = ctx;
  const catalogo = coleccion?.catalogo || [];
  const p = progresoColeccion(catalogo, coleccion?.tengo || []);
  const logros = evaluarLogros({ nodos: estado?.nodes || [], racha, coleccion: p });
  const cont = h('div', { class: 'vista' });

  render(cont,
    h('header', { class: 'vista-cab coleccion-cab' },
      h('h2', {}, 'Rooties'),
      h('span', { class: 'coleccion-cuenta' }, String(p.tengo), h('small', {}, ` / ${p.total}`))),

    h('ul', { class: 'modelos' }, ordenarColeccion(catalogo).map(ficha)),

    p.completa && !p.secretos
      ? h('p', { class: 'nota' }, `Tenés los ${p.total}. Dicen que hay uno más.`)
      : h('p', { class: 'nota' }, 'Cada Rooti trae un cofre. Las probabilidades son las mismas para todos y no hay nada que comprar para cambiarlas. Los que tienen paleta pintan ROOTLAB con sus colores.'),

    h('section', { class: 'panel' },
      h('h3', { class: 'panel-tit' }, 'Logros'),
      h('ul', { class: 'logros' },
        logros.map((l) => h('li', { class: l.cumplido ? 'logro hecho' : 'logro' },
          icono(l.cumplido ? 'trofeo' : 'hoja', 20),
          h('div', {}, h('b', {}, l.nombre), h('span', {}, l.detalle)))))));
  return cont;
}
