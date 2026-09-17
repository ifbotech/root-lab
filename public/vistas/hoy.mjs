/* hoy.mjs — la primera pantalla: cómo están y qué hay que hacer.
 *
 * El orden de arriba hacia abajo es la jerarquía de lo que alguien necesita
 * al abrir la app:
 *
 *   1. las CARAS, porque contestan "¿están bien?" antes de leer nada: son
 *      las mismas que están poniendo los Rooties en este momento
 *   2. las TAREAS, porque son lo único accionable
 *   3. los CONTADORES, para el que tiene muchas plantas
 *   4. el VÍNCULO, porque es recompensa y la recompensa va después del
 *      trabajo: la etapa de cada planta (días sanos), la racha de la casa y
 *      el último logro. No hay XP ni niveles: salían de los mismos días
 *      sanos y eran dos barras para lo mismo (lib/gamificacion.mjs)
 */
import { h, render, icono, progreso } from '../lib/ui.mjs';
import { tareasDelDia, resumenDeTareas, contarEstados, URGENCIA_ES } from '../lib/tareas.mjs';
import { saludo, evaluarLogros } from '../lib/gamificacion.mjs';
import { ETAPAS, ETAPA_ES, ETAPA_DIAS, etapaDe, progresoEtapa, progresoColeccion } from '../lib/model.mjs';
import { cara } from '../lib/caras.mjs';
import { pielDe } from '../lib/rooties.mjs';

const SEV = { URGENT: 'sev-urgente', WATCH: 'sev-atencion' };

/** La cara de una planta en su marco, con el fondo de su piel. */
export function caraDeNodo(n, lado, extra = {}) {
  const fondo = n.revelado ? pielDe(n.modelo, n.rareza || 'comun')?.fondo : null;
  return h('div', { class: `cara-marco ${SEV[n.severity] || ''}`, style: fondo ? `background:${fondo}` : '' },
    cara({
      persona: n.modelo || '',
      rareza: n.rareza || 'comun',
      modo: n.revelado ? 'cara' : 'dormida',
      animo: n.mood,
      etapa: ETAPAS.indexOf(etapaDe(n.bond?.dias_sanos ?? 0)),
      lado,
      fps: extra.fps || 20,
      etiqueta: `${n.nombre || 'Tu Rooti'}: ${n.reason || ''}`,
      clave: n.id,
      /* La cara se ve con la luz que hay donde está la planta (lib/luz.mjs). */
      lux: n.tel?.lux ?? null,
    }));
}

function ronda(nodos, alAbrir, alAgregar) {
  return h('div', { class: 'ronda', role: 'list' },
    nodos.map((n) => h('button', {
      class: 'ronda-item', type: 'button', role: 'listitem', onClick: () => alAbrir(n.id),
    }, caraDeNodo(n, 88, { fps: 12 }), h('b', {}, n.nombre || 'Sin nombre'))),
    h('button', { class: 'ronda-item', type: 'button', onClick: alAgregar, 'aria-label': 'Agregar un Rooti' },
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

/* El vínculo de cada planta: en qué etapa está y cuánto le falta. */
function bloqueVinculo(nodos, racha, logros, alAbrir) {
  const cumplidos = logros.filter((l) => l.cumplido);
  const ultimo = cumplidos[cumplidos.length - 1];
  const reveladas = nodos.filter((n) => n.revelado);
  if (!reveladas.length) return null;
  return h('section', { class: 'panel panel-vinculo' },
    h('div', { class: 'nivel-cab' },
      h('h3', { class: 'panel-tit', style: 'margin:0' }, 'El vínculo'),
      racha.dias > 0
        ? h('div', { class: 'racha', title: `Días seguidos sin ninguna urgencia en casa. Mejor racha: ${racha.mejor}` },
            icono('llama', 20), h('b', {}, String(racha.dias)),
            h('span', {}, racha.dias === 1 ? 'día' : 'días'))
        : null),
    h('ul', { class: 'vinculos' }, reveladas.map((n) => {
      const sanos = n.bond?.dias_sanos ?? 0;
      const etapa = etapaDe(sanos);
      const i = ETAPAS.indexOf(etapa);
      const proxima = ETAPAS[i + 1];
      return h('li', {},
        h('button', { class: 'vinculo-fila', type: 'button', onClick: () => alAbrir(n.id) },
          h('span', { class: 'vinculo-nombre' }, h('b', {}, n.nombre || 'Sin nombre'), h('span', { class: 'etapa-chip' }, ETAPA_ES[etapa] || etapa)),
          progreso(progresoEtapa(sanos), 'progreso-nivel'),
          h('small', {}, proxima
            ? `${sanos} días sanos · faltan ${ETAPA_DIAS[i + 1] - sanos} para ${ETAPA_ES[proxima]}`
            : `${sanos} días sanos · llegó a la última etapa`)));
    })),
    ultimo ? h('p', { class: 'logro-ultimo' }, icono('trofeo', 16), ` ${ultimo.nombre}`) : null,
    h('p', { class: 'nivel-nota' }, 'Un día sano es un día sin nada urgente. Cada etapa le suma un adorno a la cara de tu Rooti. Abrir la app no suma.'));
}

export function vistaHoy(ctx) {
  const { estado, especies, hechas, racha, coleccion, alHacer, alAbrir, alTarea, irA } = ctx;
  const nodos = estado?.nodes || [];
  const tareas = tareasDelDia(nodos, especies, hechas);
  const resumen = resumenDeTareas(tareas);
  const cuenta = contarEstados(nodos);
  const logros = evaluarLogros({ nodos, racha, coleccion: progresoColeccion(coleccion?.catalogo, coleccion?.tengo) });
  const hayUrgentes = tareas.some((t) => t.urgencia === 'urgente');
  const cont = h('div', { class: 'vista' });

  if (nodos.length === 0) {
    render(cont,
      h('section', { class: 'panel vacio' },
        h('div', { class: 'cara-marco' }, cara({ modo: 'dormida', lado: 150 })),
        h('h2', {}, 'Todavía no tenés ningún Rooti'),
        h('p', { class: 'nota' }, 'Encendelo y escaneá con la cámara el QR que aparece en su pantalla. O escribí el código que está abajo del QR.'),
        h('button', { class: 'boton primario ancho', type: 'button', onClick: () => irA('agregar') },
          icono('mas', 20), 'Agregar mi Rooti')));
    return cont;
  }

  render(cont,
    h('header', { class: 'saludo' },
      h('div', { class: 'saludo-textos' },
        h('p', { class: 'saludo-hora' }, saludo(new Date().getHours(), hayUrgentes)),
        h('h2', { class: `saludo-titulo tono-${resumen.tono}` }, resumen.titulo),
        resumen.detalle ? h('p', { class: 'saludo-detalle' }, resumen.detalle) : null)),

    ronda(nodos, alAbrir, () => irA('agregar')),
    nodos.filter((n) => n.revelado).length >= 2
      ? h('div', { class: 'invernadero-enlace' },
          h('button', { class: 'boton chico', type: 'button', onClick: () => irA('invernadero') }, icono('hoja', 16), 'Ver el invernadero'))
      : null,

    tareas.length > 0
      ? h('section', {}, h('ul', { class: 'tareas' }, tareas.map((t) => tarjetaTarea(t, alHacer, alTarea))))
      : h('section', { class: 'panel panel-libre' }, icono('tilde', 28),
          h('p', {}, 'Nada pendiente. Tus plantas están cómodas.')),

    nodos.length > 1 ? bloqueContadores(cuenta) : null,
    bloqueVinculo(nodos, racha, logros, alAbrir));

  return cont;
}
