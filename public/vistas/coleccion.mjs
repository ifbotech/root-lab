/* coleccion.mjs — los personajes que ya salieron de tus cofres, y los logros.
 *
 * Cada ROOTKIT trae un cofre y el cofre trae un personaje. La colección se
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

function ficha(m) {
  return h('li', { class: `modelo rar-${m.rareza.toLowerCase()} ${m.tengo ? 'tengo' : 'falta'}` },
    h('div', { class: 'cara-marco', style: `background:${m.fondo}` },
      cara({ persona: m.id, animo: 'HAPPY', lado: 96, fps: m.tengo ? 12 : 1, etiqueta: m.tengo ? m.nombre : 'Un personaje que todavía no tenés' })),
    h('h3', {}, m.tengo ? m.nombre : '???'),
    h('span', { class: 'modelo-rareza' }, RAREZA_ES[m.rareza] || m.rareza),
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
      h('h2', {}, 'Colección'),
      h('span', { class: 'coleccion-cuenta' }, String(p.tengo), h('small', {}, ` / ${p.total}`))),

    h('ul', { class: 'modelos' }, ordenarColeccion(catalogo).map(ficha)),

    p.completa && !p.secretos
      ? h('p', { class: 'nota' }, 'Tenés los cinco. Dicen que hay uno más.')
      : h('p', { class: 'nota' }, 'Cada ROOTKIT trae un cofre. Las probabilidades son las mismas para todos y no hay nada que comprar para cambiarlas.'),

    h('section', { class: 'panel' },
      h('h3', { class: 'panel-tit' }, 'Logros'),
      h('ul', { class: 'logros' },
        logros.map((l) => h('li', { class: l.cumplido ? 'logro hecho' : 'logro' },
          icono(l.cumplido ? 'trofeo' : 'hoja', 20),
          h('div', {}, h('b', {}, l.nombre), h('span', {}, l.detalle)))))));
  return cont;
}
