/* invernadero.mjs — todos los Rooties en un estante, mirándose.
 *
 * Es la escena de la casa: las plantas una al lado de la otra, cada Rooti
 * entero (lib/cuerpo.mjs) con la cara que está poniendo ahora. Y se miran (lib/miradas.mjs): un
 * vistazo al de al lado cada tanto y, cuando uno tiene sed o frío, los
 * vecinos lo miran con preocupación. Sirve para saber de un vistazo quién
 * necesita algo sin leer nada: el que tiene a todos mirándolo.
 *
 * Las miradas son función del tiempo; acá sólo se le pasan a cada lienzo
 * cuatro veces por segundo (lib/caras.mjs las suaviza).
 */
import { h, render, icono, botonVolver } from '../lib/ui.mjs';
import { MOOD_ES } from '../lib/model.mjs';
import { miradaDe } from '../lib/miradas.mjs';
import { cuerpoDeNodo } from './mascota.mjs';

const PASO_MS = 250;
const SEV = { URGENT: 'sev-urgente', WATCH: 'sev-atencion' };

export function vistaInvernadero(ctx) {
  const { estado, alAbrir, volver, irA } = ctx;
  const nodos = (estado?.nodes || []);
  const cont = h('div', { class: 'vista invernadero' });

  if (nodos.length === 0) {
    render(cont, h('section', { class: 'panel vacio' },
      h('p', {}, 'El invernadero está vacío: todavía no tenés ningún Rooti.'),
      h('button', { class: 'boton primario', type: 'button', onClick: () => irA('agregar') }, icono('mas', 20), 'Agregar mi Rooti')));
    return cont;
  }

  const lado = Math.max(96, Math.min(150, Math.floor((Math.min(window.innerWidth, 560) - 32 - 12 * (nodos.length - 1)) / Math.max(2, Math.min(nodos.length, 3)))));
  const lienzos = nodos.map((n) => cuerpoDeNodo(n, lado, { fps: 20 }));

  const macetas = nodos.map((n, i) => {
    if (SEV[n.severity]) lienzos[i].dataset.sev = SEV[n.severity];
    return h('button', { class: 'maceta', type: 'button', onClick: () => alAbrir(n.id), 'aria-label': `${n.nombre || 'Tu Rooti'}, ${MOOD_ES[n.mood] || ''}` },
      lienzos[i],
      h('b', {}, n.nombre || 'Sin nombre'),
      h('span', {}, n.revelado ? (MOOD_ES[n.mood] || '') : 'dormido'));
  });

  /* Las miradas, cuatro veces por segundo mientras la vista esté. */
  const reloj = setInterval(() => {
    if (!cont.isConnected) { clearInterval(reloj); return; }
    if (document.hidden) return;
    const t = Date.now();
    lienzos.forEach((c, i) => c.actualizar({ mirada: miradaDe(i, nodos, t) }));
  }, PASO_MS);

  const preocupados = nodos.filter((n) => n.revelado && ['THIRSTY', 'COLD', 'DROWNING'].includes(n.mood));
  render(cont,
    h('header', { class: 'vista-cab' },
      botonVolver(volver),
      h('h2', {}, 'El invernadero')),
    h('div', { class: 'estante-marco' },
      h('div', { class: 'estante', role: 'list' }, macetas),
      h('div', { class: 'estante-tabla' })),
    h('p', { class: 'nota' }, preocupados.length
      ? `Los Rooties miran a ${preocupados.map((n) => n.nombre || 'uno').join(' y ')}: ${preocupados.length === 1 ? 'necesita' : 'necesitan'} algo.`
      : 'Se miran entre ellos cada tanto. Cuando uno tiene sed o frío, los vecinos lo miran preocupados: se nota de lejos.'));
  return cont;
}
