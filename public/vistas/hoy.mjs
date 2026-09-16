/* hoy.mjs — la primera pantalla: cómo están y qué hay que hacer.
 *
 * El orden de arriba hacia abajo es la jerarquía de lo que alguien necesita
 * al abrir la app:
 *
 *   1. las CARAS, porque contestan "¿están bien?" antes de leer nada: son
 *      las mismas que están poniendo las macetas en este momento
 *   2. las TAREAS, porque son lo único accionable
 *   3. los CONTADORES, para el que tiene muchas plantas
 *   4. el NIVEL, porque es recompensa y la recompensa va después del trabajo
 */
import { h, render, icono, progreso } from '../lib/ui.mjs';
import { tareasDelDia, resumenDeTareas, contarEstados, URGENCIA_ES } from '../lib/tareas.mjs';
import { xpTotal, nivelDe, saludo, evaluarLogros } from '../lib/gamificacion.mjs';
import { ETAPAS, etapaDe } from '../lib/model.mjs';
import { cara } from '../lib/caras.mjs';

const SEV = { URGENT: 'sev-urgente', WATCH: 'sev-atencion' };

export function caraDeNodo(n, lado, extra = {}) {
  const fondo = extra.fondo;
  return h('div', { class: `cara-marco ${SEV[n.severity] || ''}`, style: fondo ? `background:${fondo}` : '' },
    cara({
      persona: n.revelado ? n.modelo : '',
      modo: n.revelado ? 'cara' : 'dormida',
      animo: n.mood,
      etapa: ETAPAS.indexOf(etapaDe(n.bond?.dias_sanos ?? 0)),
      lado,
      fps: extra.fps || 20,
      etiqueta: `${n.nombre || 'Tu ROOTKIT'}: ${n.reason || ''}`,
    }));
}

function ronda(nodos, modelos, alAbrir, alAgregar) {
  const fondo = (n) => modelos.find((m) => m.id === n.modelo)?.fondo;
  return h('div', { class: 'ronda', role: 'list' },
    nodos.map((n) => h('button', {
      class: 'ronda-item', type: 'button', role: 'listitem', onClick: () => alAbrir(n.id),
    }, caraDeNodo(n, 88, { fondo: fondo(n), fps: 12 }), h('b', {}, n.nombre || 'Sin nombre'))),
    h('button', { class: 'ronda-item', type: 'button', onClick: alAgregar, 'aria-label': 'Agregar un ROOTKIT' },
      h('span', { class: 'ronda-agregar' }, icono('mas', 34)), h('b', {}, 'Agregar')));
}

function tarjetaTarea(t, alHacer, alIr) {
  return h('li', { class: `tarea tarea-${t.urgencia}`, dataset: { id: t.id } },
    h('div', { class: 'tarea-icono' }, icono(t.icono, 24)),
    h('button', { class: 'tarea-ir', type: 'button', onClick: () => alIr(t) },
      h('h3', {}, t.titulo),
      h('p', { class: 'tarea-detalle' }, t.detalle),
      h('span', { class: 'tarea-urgencia' }, URGENCIA_ES[t.urgencia])),
    t.auto
      ? h('button', {
          class: 'tarea-hecha', type: 'button',
          title: 'Ya lo hice: la escondo hasta que el sensor lo confirme',
          'aria-label': `Marcar como hecha: ${t.titulo}`,
          onClick: () => alHacer(t),
        }, icono('tilde', 22))
      : h('span'));
}

function bloqueContadores(c) {
  const celda = (n, et, clase) => h('div', { class: `contador ${clase}` },
    h('b', {}, String(n)), h('span', {}, et));
  return h('div', { class: 'contadores' },
    celda(c.total, c.total === 1 ? 'planta' : 'plantas', 'contador-total'),
    celda(c.urgente, c.urgente === 1 ? 'urgente' : 'urgentes', 'contador-urgente'),
    celda(c.atencion, 'para mirar', 'contador-atencion'),
    celda(c.bien, c.bien === 1 ? 'cómoda' : 'cómodas', 'contador-bien'));
}

function bloqueNivel(nivel, racha, logros) {
  const cumplidos = logros.filter((l) => l.cumplido);
  const ultimo = cumplidos[cumplidos.length - 1];
  return h('section', { class: 'panel panel-nivel' },
    h('div', { class: 'nivel-cab' },
      h('div', {},
        h('span', { class: 'nivel-num' }, `Nivel ${nivel.nivel}`),
        h('h3', {}, nivel.titulo)),
      racha.dias > 0
        ? h('div', { class: 'racha', title: `Mejor racha: ${racha.mejor} días` },
            icono('llama', 20), h('b', {}, String(racha.dias)),
            h('span', {}, racha.dias === 1 ? 'día' : 'días'))
        : null),
    progreso(nivel.progreso, 'progreso-nivel'),
    h('p', { class: 'nivel-pie' },
      nivel.siguiente ? `${nivel.faltan} XP para ${nivel.siguiente.titulo}` : 'Llegaste al último nivel'),
    ultimo ? h('p', { class: 'logro-ultimo' }, icono('trofeo', 16), ` ${ultimo.nombre}`) : null,
    h('p', { class: 'nivel-nota' }, 'La XP sale de días sanos de tus plantas. Abrir la app no suma.'));
}

export function vistaHoy(ctx) {
  const { estado, especies, hechas, racha, coleccion, alHacer, alAbrir, alTarea, irA } = ctx;
  const nodos = estado?.nodes || [];
  const tareas = tareasDelDia(nodos, especies, hechas);
  const resumen = resumenDeTareas(tareas);
  const cuenta = contarEstados(nodos);
  const nivel = nivelDe(xpTotal(nodos));
  const logros = evaluarLogros({ nodos, racha, coleccion });
  const hayUrgentes = tareas.some((t) => t.urgencia === 'urgente');
  const modelos = coleccion?.catalogo || [];
  const cont = h('div', { class: 'vista' });

  if (nodos.length === 0) {
    render(cont,
      h('section', { class: 'panel vacio' },
        h('div', { class: 'cara-marco' }, cara({ modo: 'dormida', lado: 150 })),
        h('h2', {}, 'Todavía no tenés ningún ROOTKIT'),
        h('p', { class: 'nota' }, 'Encendelo y escaneá con la cámara el QR que aparece en su pantalla. O escribí el código que está abajo del QR.'),
        h('button', { class: 'boton primario ancho', type: 'button', onClick: () => irA('agregar') },
          icono('mas', 20), 'Agregar mi ROOTKIT')));
    return cont;
  }

  render(cont,
    h('header', { class: 'saludo' },
      h('div', { class: 'saludo-textos' },
        h('p', { class: 'saludo-hora' }, saludo(new Date().getHours(), hayUrgentes)),
        h('h2', { class: `saludo-titulo tono-${resumen.tono}` }, resumen.titulo),
        resumen.detalle ? h('p', { class: 'saludo-detalle' }, resumen.detalle) : null)),

    ronda(nodos, modelos, alAbrir, () => irA('agregar')),

    tareas.length > 0
      ? h('section', {}, h('ul', { class: 'tareas' }, tareas.map((t) => tarjetaTarea(t, alHacer, alTarea))))
      : h('section', { class: 'panel panel-libre' }, icono('tilde', 28),
          h('p', {}, 'Nada pendiente. Tus plantas están cómodas.')),

    nodos.length > 1 ? bloqueContadores(cuenta) : null,
    bloqueNivel(nivel, racha, logros));

  return cont;
}
