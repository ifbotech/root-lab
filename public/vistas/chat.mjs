/* chat.mjs — hablar con tu planta.
 *
 * La planta contesta como ella misma: con su nombre, la personalidad de su
 * Rooti y lo que miden sus sensores AHORA (el servidor arma el contexto,
 * ver server/ficha.mjs). Sólo habla de su cuidado: si le preguntás otra
 * cosa, te lo dice con su estilo.
 *
 * El plan gratis trae unos pocos mensajes por día (los dice el servidor en
 * `cuota`). Se muestran siempre, antes de escribir, para que nadie se quede
 * a mitad de una pregunta: cuando se terminan, el campo se apaga y queda la
 * promesa de ROOTLAB Pro, sin nada que comprar todavía.
 */
import { h, render, icono } from '../lib/ui.mjs';
import { caraDeNodo } from './hoy.mjs';

const PREGUNTAS = [
  '¿Cómo estás hoy?',
  '¿Cuándo tengo que regarte?',
  '¿Te gusta la luz que tenés?',
  '¿Sos tóxica para mi gato?',
];

const hora = (t) => new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit' }).format(new Date(t));

export function vistaChat(ctx) {
  const { estado, coleccion, plantaId, api, avisar, volver, config, irA } = ctx;
  const n = (estado?.nodes || []).find((x) => x.id === plantaId);
  const cont = h('div', { class: 'vista chat' });

  if (!n) {
    render(cont, h('section', { class: 'panel vacio' },
      h('p', {}, 'Esa planta ya no está.'),
      h('button', { class: 'boton', type: 'button', onClick: volver }, 'Volver')));
    return cont;
  }

  const modelo = (coleccion?.catalogo || []).find((m) => m.id === n.modelo);
  const nombre = n.nombre || 'tu planta';
  const maximo = config?.chat_max || 500;

  const lista = h('div', { class: 'mensajes', role: 'log', 'aria-live': 'polite', 'aria-label': `Charla con ${nombre}` });
  const texto = h('textarea', {
    id: 'chat-texto', rows: '1', maxlength: String(maximo), enterkeyhint: 'send',
    placeholder: `Escribile a ${nombre}…`, 'aria-label': `Mensaje para ${nombre}`,
  });
  const enviar = h('button', { class: 'boton primario', type: 'submit', 'aria-label': 'Enviar' }, icono('flecha', 20));
  const cuotaEt = h('span');
  const contador = h('span', { 'aria-hidden': 'true' });
  const pro = h('div', { class: 'pro', hidden: true },
    h('b', {}, 'ROOTLAB Pro · muy pronto'),
    h('p', { class: 'nota' }, `Charlá sin límite con todas tus plantas. Por ahora, ${nombre} te espera mañana.`));
  const form = h('form', { class: 'composer' },
    h('div', { class: 'composer-fila' }, texto, enviar),
    h('div', { class: 'cuota' }, cuotaEt, contador));

  let mensajes = [];
  let cuota = null;
  let enviando = false;

  const burbuja = (m) => h('div', { class: `mensaje de-${m.rol}${m.escribiendo ? ' escribiendo' : ''}` },
    m.rol === 'planta' ? h('b', {}, nombre) : null,
    m.texto,
    m.t ? h('time', { datetime: new Date(m.t).toISOString() }, hora(m.t)) : null);

  const bajar = () => requestAnimationFrame(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));

  function pintarLista() {
    if (!mensajes.length) {
      render(lista, h('div', { class: 'chat-vacio' },
        h('p', {}, `${nombre} sabe cómo está su tierra, su luz y su aire ahora mismo. Preguntale lo que quieras sobre su cuidado.`),
        h('div', { class: 'preguntas' },
          PREGUNTAS.map((p) => h('button', { type: 'button', onClick: () => mandar(p) }, p)))));
      return;
    }
    render(lista, mensajes.map(burbuja));
    bajar();
  }

  function pintarCuota() {
    const sinCuota = cuota && cuota.restantes <= 0;
    texto.disabled = enviando || sinCuota;
    enviar.disabled = enviando || sinCuota || !texto.value.trim();
    pro.hidden = !sinCuota;
    if (cuota) {
      render(cuotaEt, sinCuota
        ? 'Se terminaron los mensajes de hoy'
        : h('span', {}, 'Te quedan ', h('b', {}, `${cuota.restantes} de ${cuota.limite}`), ' mensajes hoy'));
    }
    contador.textContent = texto.value.length > maximo * 0.8 ? `${texto.value.length}/${maximo}` : '';
  }

  async function mandar(contenido) {
    const limpio = String(contenido || '').trim();
    if (!limpio || enviando) return;
    enviando = true;
    texto.value = '';
    const provisorio = [{ rol: 'persona', texto: limpio, t: Date.now() }, { rol: 'planta', texto: 'escribiendo…', escribiendo: true }];
    mensajes = [...mensajes, ...provisorio];
    pintarLista();
    pintarCuota();
    try {
      const r = await api(`/api/plantas/${n.id}/chat`, { metodo: 'POST', cuerpo: { texto: limpio } });
      mensajes = [...mensajes.filter((m) => !provisorio.includes(m)), ...r.mensajes];
      cuota = r.cuota;
    } catch (e) {
      mensajes = mensajes.filter((m) => !provisorio.includes(m));
      texto.value = limpio;
      if (e.estado === 429) cuota = { ...(cuota || { limite: 0 }), restantes: 0 };
      avisar(e.message, true);
    } finally {
      enviando = false;
      pintarLista();
      pintarCuota();
      if (!texto.disabled) texto.focus();
    }
  }

  form.addEventListener('submit', (ev) => { ev.preventDefault(); mandar(texto.value); });
  texto.addEventListener('input', () => {
    texto.style.height = 'auto';
    texto.style.height = `${Math.min(140, texto.scrollHeight)}px`;
    pintarCuota();
  });
  texto.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) {
      ev.preventDefault();
      mandar(texto.value);
    }
  });

  const cabecera = h('header', { class: 'chat-cab' },
    h('button', { class: 'boton chico', type: 'button', onClick: volver, 'aria-label': 'Volver' }, '‹'),
    caraDeNodo(n, 56, { fondo: modelo?.fondo, fps: 12 }),
    h('div', {},
      h('h2', {}, nombre),
      h('p', {}, [n.especie_info?.nombre, n.reason].filter(Boolean).join(' · '))));

  render(cont, cabecera, h('p', { class: 'nota' }, 'Cargando la charla…'));

  (async () => {
    try {
      const r = await api(`/api/plantas/${n.id}/chat`);
      if (!r.disponible) {
        render(cont, cabecera, h('section', { class: 'panel vacio' },
          h('p', {}, `Para charlar, primero conozcamos a ${nombre}: sacale una foto y reconozco su especie.`),
          h('button', { class: 'boton primario', type: 'button', onClick: () => irA('especie', n.id) }, icono('camara', 20), 'Sacar la foto')));
        return;
      }
      mensajes = r.mensajes;
      cuota = r.cuota;
      render(cont, cabecera,
        r.ia === 'simulada' ? h('p', { class: 'nota' }, 'Modo de prueba: las respuestas son simuladas.') : null,
        lista, pro, form);
      pintarLista();
      pintarCuota();
    } catch (e) {
      render(cont, cabecera, h('p', { class: 'errores' }, e.message));
    }
  })();

  return cont;
}
