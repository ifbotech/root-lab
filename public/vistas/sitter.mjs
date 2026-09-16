/* sitter.mjs — lo que ve quien cuida tu planta mientras no estás.
 *
 * Un enlace /sitter/<token> que el dueño crea desde la planta (vale 3, 7 o
 * 15 días) abre esta vista sin cuenta ni instalación: la cara del Rooti en
 * vivo, qué necesita hoy (las mismas tareas que ve el dueño, sólo las que
 * salen de los sensores), cómo se riega y cuánta luz quiere, y un botón
 * "Ya regué" que queda anotado como riego de la planta y le manda un push
 * al dueño. No muestra nada de la cuenta: ni email, ni otras plantas.
 *
 * Se refresca sola cada minuto: si el cuidador riega, en un rato la cara
 * cambia y la tarea desaparece, igual que en la app.
 */
import { h, render, icono } from '../lib/ui.mjs';
import { cara } from '../lib/caras.mjs';
import { tareasDe, URGENCIA_ES } from '../lib/tareas.mjs';
import { formatEdad } from '../lib/model.mjs';

const REFRESCO_MS = 60000;
/* Después de "ya regué", el botón descansa este rato: el sensor tarda. */
const DESCANSO_MS = 2 * 3600 * 1000;
/* Sólo lo que sale de los sensores: lo demás es del dueño. */
const TAREAS_DEL_CUIDADOR = new Set(['regar', 'drenar', 'sombra', 'luz', 'abrigar', 'refrescar', 'humedad', 'escurrio']);

const fecha = (ms) => new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long' }).format(new Date(ms));
const hace = (ms, ahora = Date.now()) => formatEdad(Math.max(0, Math.floor((ahora - ms) / 1000)));

const leer = (k) => { try { return Number(localStorage.getItem(k)) || 0; } catch { return 0; } };
const escribir = (k, v) => { try { localStorage.setItem(k, String(v)); } catch { /* privado */ } };

export function vistaSitter(ctx) {
  const { plantaId: token, api, avisar } = ctx;
  const cont = h('div', { class: 'vista sitter' });
  const claveDescanso = `rootlab:sitter:${String(token).slice(0, 12)}`;
  let datos = null;

  function tarea(t) {
    return h('li', { class: `tarea tarea-${t.urgencia}` },
      h('div', { class: 'tarea-icono' }, icono(t.icono, 24)),
      h('div', { class: 'tarea-ir' },
        h('h3', {}, t.titulo),
        h('p', { class: 'tarea-detalle' }, t.detalle),
        h('span', { class: 'tarea-urgencia' }, URGENCIA_ES[t.urgencia])));
  }

  function pintar() {
    const { planta: p, dueno, vence, riegos, ahora } = datos;
    const nombre = p.nombre || 'la planta';
    const tareas = tareasDe(p, p.especie_info).filter((t) => TAREAS_DEL_CUIDADOR.has(t.tipo));
    const ultimoRiego = riegos?.[0] || null;
    const descansando = Date.now() - leer(claveDescanso) < DESCANSO_MS;

    const boton = h('button', {
      class: 'boton primario ancho', type: 'button', disabled: descansando,
      onClick: async (ev) => {
        ev.currentTarget.disabled = true;
        try {
          await api(`/api/sitter/${token}/riego`, { metodo: 'POST', cuerpo: {} });
          escribir(claveDescanso, Date.now());
          avisar(`Gracias. Le avisamos${dueno ? ` a ${dueno}` : ''}.`);
          await cargar();
        } catch (e) {
          avisar(e.message, true);
          ev.target.disabled = false;
        }
      },
    }, icono('gota', 20), 'Ya regué');

    render(cont,
      h('header', { class: 'sitter-cab' },
        h('p', { class: 'saludo-hora' }, 'Estás cuidando a'),
        h('h2', {}, nombre),
        h('p', { class: 'nota' }, [dueno ? `de ${dueno}` : null, `hasta el ${fecha(vence)}`].filter(Boolean).join(' · '))),

      h('section', { class: `heroe sev-${{ URGENT: 'urgente', WATCH: 'atencion' }[p.severity] || 'bien'}` },
        h('div', { class: 'cara-marco' }, cara({
          persona: p.revelado ? p.modelo : '', modo: p.revelado ? 'cara' : 'dormida', animo: p.mood,
          lado: 150, fps: 20, clave: `sitter:${token}`, lux: p.tel?.lux ?? null,
          etiqueta: `${nombre}: ${p.reason || ''}`,
        })),
        p.reason ? h('p', { class: 'dice' }, p.reason) : null,
        h('p', { class: 'heroe-sub' },
          [p.especie_info?.nombre, p.tel?.age_s !== null ? `medido ${formatEdad(p.tel?.age_s)}` : null].filter(Boolean).join(' · '))),

      h('section', {},
        h('h3', { class: 'panel-tit' }, 'Hoy'),
        tareas.length
          ? h('ul', { class: 'tareas' }, tareas.map(tarea))
          : h('div', { class: 'panel panel-libre' }, icono('tilde', 28), h('p', {}, `${nombre} está cómoda. Hoy no hay nada que hacer.`))),

      h('section', { class: 'panel' },
        boton,
        h('p', { class: 'nota', style: 'margin-top:10px' }, descansando
          ? 'Anotado. La tierra tarda un par de horas en repartir el agua: si después sigue con sed, la tarea vuelve.'
          : 'Tocá cuando riegues: queda anotado y le avisamos al dueño. El Rooti mide la tierra y en un rato la cara lo confirma.'),
        ultimoRiego ? h('p', { class: 'nota', style: 'margin-top:6px' }, `Último riego anotado: ${ultimoRiego.quien || 'alguien'}, ${hace(ultimoRiego.t, ahora)}.`) : null),

      p.ficha
        ? h('section', { class: 'panel' },
            h('h3', { class: 'panel-tit' }, 'Cómo se cuida'),
            h('dl', { class: 'cuidados' },
              [['Riego', p.ficha.cuidados.riego], ['Luz', p.ficha.cuidados.luz], ['Temperatura', p.ficha.cuidados.temperatura], ['Humedad', p.ficha.cuidados.humedad]]
                .filter(([, v]) => v)
                .map(([k, v]) => h('div', { class: 'cuidado' }, h('dt', {}, k), h('dd', {}, v)))))
        : null,

      h('p', { class: 'nota sitter-pie' }, 'Los números salen del Rooti, la maceta con sensores. Este enlace muestra sólo esta planta.'));
  }

  async function cargar() {
    try {
      datos = await api(`/api/sitter/${token}`);
      if (cont.isConnected || !datos) pintar();
    } catch (e) {
      render(cont, h('section', { class: 'panel vacio' },
        h('div', { class: 'cara-marco' }, cara({ modo: 'dormida', lado: 120 })),
        h('h2', {}, e.estado === 404 ? 'Este enlace ya no vale' : 'No pude cargar la planta'),
        h('p', { class: 'nota' }, e.message)));
    }
  }

  render(cont, h('p', { class: 'nota' }, 'Cargando…'));
  cargar();
  const reloj = setInterval(() => {
    if (!cont.isConnected) { clearInterval(reloj); return; }
    if (!document.hidden) cargar();
  }, REFRESCO_MS);
  return cont;
}
