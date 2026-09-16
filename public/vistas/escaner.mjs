/* escaner.mjs — la cámara, fuera del alta.
 *
 * DIAGNOSTICAR: sacarle una foto a una planta que ya está vinculada para
 * cruzar lo que se ve con lo que miden los sensores. La IA sólo describe
 * hallazgos visibles; la causa sale de lib/diagnostico.mjs, que los cruza
 * con la última lectura. Ver ahí por qué.
 *
 * CAMBIAR ESPECIE: la misma identificación del alta, para una planta
 * existente (se equivocó la foto, o se cambió la planta de maceta).
 *
 * AGREGAR: vincular otro ROOTKIT tipeando el código que muestra debajo de
 * su QR. Escanear el QR con la cámara del teléfono lleva al mismo lugar.
 */
import { h, render, icono } from '../lib/ui.mjs';
import { diagnosticar, HALLAZGO_ES } from '../lib/diagnostico.mjs';
import { prepararFoto } from '../lib/dispositivo.mjs';
import { selectorEspecie } from './alta.mjs';

function tarjetaConclusion(c) {
  return h('li', { class: `conclusion grav-${c.gravedad} ${c.confirma ? '' : 'revela'}` },
    h('div', { class: 'conclusion-cab' },
      h('h4', {}, c.causa),
      h('span', { class: 'conclusion-visto' }, HALLAZGO_ES[c.hallazgo] || c.hallazgo)),
    h('p', {}, c.detalle),
    c.accion ? h('p', { class: 'conclusion-accion' }, icono('tilde', 14), ' ', c.accion) : null,
    !c.confirma ? h('p', { class: 'conclusion-nota' }, 'Ningún sensor puede detectar esto: sólo se ve mirando.') : null);
}

export function vistaDiagnostico(ctx) {
  const { estado, especies, plantaId, api, volver } = ctx;
  const n = (estado?.nodes || []).find((x) => x.id === plantaId);
  const cont = h('div', { class: 'vista' });
  if (!n) {
    render(cont, h('section', { class: 'panel vacio' }, h('p', {}, 'Esa maceta ya no está.'),
      h('button', { class: 'boton', type: 'button', onClick: volver }, 'Volver')));
    return cont;
  }
  const esp = n.especie_info || (especies || []).find((e) => e.id === n.especie);
  const zona = h('div', { class: 'escaner-zona' });

  async function analizar(archivo) {
    let foto;
    try { foto = await prepararFoto(archivo); } catch (e) { ctx.avisar(e.message, true); return; }
    render(zona,
      h('div', { class: 'escaneando' }, h('img', { src: foto.vista, alt: 'Tu planta' })),
      h('p', { class: 'cargando' }, 'Comparando la foto con los sensores…'));
    try {
      const r = await api('/api/diagnosticar', {
        metodo: 'POST', cuerpo: { planta: n.id, image_b64: foto.image_b64, mime: foto.mime },
      });
      const d = diagnosticar(r.hallazgos, n.tel, esp);
      render(zona,
        h('img', { class: 'preview', src: foto.vista, alt: 'Tu planta' }),
        h('div', { class: `veredicto veredicto-${d.veredicto}` }, h('h3', {}, d.titulo), h('p', {}, d.resumen)),
        r.observacion ? h('p', { class: 'nota' }, r.observacion) : null,
        d.conclusiones.length ? h('ul', { class: 'conclusiones' }, d.conclusiones.map(tarjetaConclusion)) : null,
        r.fuente === 'simulada' ? h('p', { class: 'nota' }, 'Modo de prueba: los hallazgos son simulados.') : null,
        h('p', { class: 'nota' }, 'Es una orientación, no un diagnóstico de laboratorio. Si algo no cierra, mirá las raíces.'));
    } catch (e) {
      render(zona, h('p', { class: 'errores' }, `No pude analizarla: ${e.message}`));
    }
  }

  render(cont,
    h('header', { class: 'vista-cab' },
      h('button', { class: 'boton chico', type: 'button', onClick: volver }, '‹'),
      h('h2', {}, `Diagnóstico de ${n.nombre || 'tu planta'}`)),
    h('section', { class: 'panel' },
      h('p', { class: 'nota', style: 'margin-bottom:12px' },
        `Ahora mismo: tierra ${n.tel?.soil_pct ?? '—'} %, ${esp?.nombre || 'especie sin identificar'}. Sacá una foto de la planta entera, con luz y sin contraluz.`),
      h('label', { class: 'foto-campo' }, icono('camara', 42), h('span', {}, 'Sacar la foto'),
        h('input', {
          type: 'file', accept: 'image/*', capture: 'environment', class: 'oculto',
          onChange: (ev) => { const f = ev.target.files?.[0]; if (f) analizar(f); },
        })),
      zona));
  return cont;
}

export function vistaEspecie(ctx) {
  const { estado, plantaId, api, avisar, volver, recargar } = ctx;
  const n = (estado?.nodes || []).find((x) => x.id === plantaId);
  const cont = h('div', { class: 'alta' });
  if (!n) {
    render(cont, h('p', {}, 'Esa maceta ya no está.'));
    return cont;
  }
  render(cont,
    h('header', { class: 'vista-cab' }, h('button', { class: 'boton chico', type: 'button', onClick: volver }, '‹')),
    selectorEspecie({ ...ctx, alta: { nombre: n.nombre } }, {
      textoGuardar: 'Guardar',
      alGuardar: async (e) => {
        try {
          await api(`/api/plantas/${n.id}`, {
            metodo: 'PATCH', cuerpo: { especie: ctx.especies?.some((x) => x.id === e.id) ? e.id : e },
          });
          avisar(`Listo: ${e.nombre}. La maceta lo aplica en su próxima consulta.`);
          await recargar();
          volver();
        } catch (err) { avisar(err.message, true); }
      },
    }));
  return cont;
}

export function vistaAgregar(ctx) {
  const { volver, alCodigo } = ctx;
  const input = h('input', {
    type: 'text', id: 'codigo', maxlength: '9', autocomplete: 'off', autocapitalize: 'characters',
    placeholder: 'K7Q2-M9XA', class: 'mono', style: 'text-align:center;font-size:26px;letter-spacing:.14em',
    'aria-label': 'Código del ROOTKIT',
  });
  const error = h('p', { class: 'errores', role: 'alert', hidden: true });
  const seguir = (ev) => {
    ev?.preventDefault();
    const c = input.value.toUpperCase().replace(/[-\s]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1').replace(/U/g, 'V');
    if (!/^[0-9A-HJKMNP-TV-Z]{8}$/.test(c)) {
      error.textContent = 'El código tiene 8 letras y números, como K7Q2-M9XA.';
      error.hidden = false;
      return;
    }
    alCodigo(c);
  };
  const cont = h('div', { class: 'alta' });
  render(cont,
    h('header', { class: 'vista-cab' }, h('button', { class: 'boton chico', type: 'button', onClick: volver }, '‹')),
    h('form', { class: 'alta-cuerpo', onSubmit: seguir },
      h('h1', { class: 'alta-titulo' }, 'Agregar un ROOTKIT'),
      h('p', { class: 'alta-texto' },
        'Encendelo: en su pantalla aparece un QR. Escanealo con la cámara del teléfono, o escribí acá el código que está debajo.'),
      input, error),
    h('div', { class: 'alta-pie' }, h('button', { class: 'boton primario ancho', type: 'button', onClick: seguir }, 'Seguir')));
  setTimeout(() => input.focus(), 50);
  return cont;
}
