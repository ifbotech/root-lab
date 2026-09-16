/* ajustes.mjs — la cuenta, las notificaciones y lo demás.
 *
 * Las plantas viven en la cuenta, no en el teléfono (ver lib/api.mjs): para
 * verlas en otro lado alcanza con entrar con el mismo email. Por eso esta
 * pantalla sólo tiene lo que se toca de vez en cuando: el nombre, la
 * contraseña, cerrar la sesión y borrar todo.
 */
import { h, render } from '../lib/ui.mjs';
import { motivoSinAvisos, activarAvisos, avisosActivos } from '../lib/dispositivo.mjs';

export function vistaAjustes(ctx) {
  const { api, avisar, config, cuenta } = ctx;
  const cont = h('div', { class: 'vista' });
  const claveMin = config?.clave_min || 8;

  /* ------------------------------------------------------ notificaciones --- */
  const estadoAvisos = h('span', {}, '…');
  const botonAvisos = h('button', { class: 'boton chico', type: 'button', hidden: true });
  const refrescarAvisos = async () => {
    const activos = await avisosActivos();
    const motivo = motivoSinAvisos();
    estadoAvisos.textContent = activos ? 'Activadas en este teléfono.' : (motivo || 'Desactivadas.');
    botonAvisos.hidden = false;
    render(botonAvisos, activos ? 'Probar' : 'Activar');
    botonAvisos.disabled = !activos && Boolean(motivo);
    botonAvisos.onclick = async () => {
      try {
        if (activos) {
          const r = await api('/api/push/probar', { metodo: 'POST' });
          avisar(r.enviados ? 'Te mandé una de prueba.' : 'No pude mandarla. Probá desactivarlas y activarlas de nuevo.');
        } else {
          await activarAvisos(api);
          avisar('Listo, te aviso.');
          refrescarAvisos();
        }
      } catch (e) { avisar(e.message, true); }
    };
  };
  refrescarAvisos();

  /* -------------------------------------------------------------- nombre --- */
  const inputNombre = h('input', { type: 'text', id: 'ajustes-nombre', maxlength: '40', value: cuenta?.nombre || '', autocomplete: 'given-name' });
  const guardarNombre = async (ev) => {
    ev.preventDefault();
    try {
      await api('/api/cuenta', { metodo: 'PATCH', cuerpo: { nombre: inputNombre.value } });
      await ctx.recargar();
      avisar('Guardado.');
    } catch (e) { avisar(e.message, true); }
  };

  /* ---------------------------------------------------------- contraseña --- */
  const claveActual = h('input', { type: 'password', id: 'ajustes-clave-actual', autocomplete: 'current-password', maxlength: '200' });
  const claveNueva = h('input', { type: 'password', id: 'ajustes-clave-nueva', autocomplete: 'new-password', minlength: String(claveMin), maxlength: '200' });
  const errorClave = h('p', { class: 'errores', role: 'alert', hidden: true });
  const cambiarClave = async (ev) => {
    ev.preventDefault();
    errorClave.hidden = true;
    if (claveNueva.value.length < claveMin) {
      errorClave.textContent = `La contraseña nueva tiene que tener al menos ${claveMin} caracteres.`;
      errorClave.hidden = false;
      return;
    }
    try {
      await api('/api/cuenta/clave', { metodo: 'POST', cuerpo: { actual: claveActual.value, nueva: claveNueva.value } });
      claveActual.value = '';
      claveNueva.value = '';
      avisar('Cambiada. Las sesiones en otros teléfonos se cerraron.');
    } catch (e) {
      errorClave.textContent = e.message;
      errorClave.hidden = false;
    }
  };

  /* --------------------------------------------------------- borrar todo --- */
  const zonaBorrar = h('div', { class: 'form' });
  const pedirBorrar = () => {
    const clave = h('input', { type: 'password', id: 'ajustes-clave-borrar', autocomplete: 'current-password', maxlength: '200' });
    const error = h('p', { class: 'errores', role: 'alert', hidden: true });
    render(zonaBorrar,
      h('p', { class: 'nota' }, 'Se borran la cuenta, todas tus plantas y su historial, en todos los teléfonos. Tus ROOTKIT vuelven a mostrar el QR. No se puede deshacer.'),
      h('div', { class: 'campo' }, h('label', { for: 'ajustes-clave-borrar' }, 'Tu contraseña, para confirmar'), clave),
      error,
      h('div', { class: 'fila-botones' },
        h('button', { class: 'boton', type: 'button', onClick: () => render(zonaBorrar, botonBorrar) }, 'Cancelar'),
        h('button', {
          class: 'boton peligro', type: 'button',
          onClick: async () => {
            error.hidden = true;
            try {
              await api('/api/cuenta', { metodo: 'DELETE', cuerpo: { clave: clave.value } });
              avisar('Tu cuenta se borró.');
              ctx.cerrarSesionLocal();
              await ctx.salir();
            } catch (e) {
              error.textContent = e.message;
              error.hidden = false;
            }
          },
        }, 'Borrar todo')));
    clave.focus();
  };
  const botonBorrar = h('button', { class: 'enlace-boton peligro', type: 'button', onClick: pedirBorrar }, 'Borrar mi cuenta');
  render(zonaBorrar, botonBorrar);

  render(cont,
    h('header', { class: 'vista-cab' }, h('h2', {}, 'Ajustes')),

    h('section', { class: 'panel' },
      h('h3', { class: 'panel-tit' }, 'Tu cuenta'),
      h('div', { class: 'fila-ajuste' },
        h('div', {}, h('b', {}, cuenta?.email || '—'), h('span', {}, 'Entrá con este email en cualquier teléfono y vas a ver tus plantas.')),
        h('button', { class: 'boton chico', type: 'button', onClick: () => ctx.salir() }, 'Salir'))),

    h('section', { class: 'panel' },
      h('h3', { class: 'panel-tit' }, 'Notificaciones'),
      h('div', { class: 'fila-ajuste' },
        h('div', {}, h('b', {}, 'Avisos de tus plantas'), estadoAvisos),
        botonAvisos)),

    h('form', { class: 'panel form', onSubmit: guardarNombre },
      h('h3', { class: 'panel-tit' }, 'Tu nombre'),
      h('div', { class: 'con-boton' }, inputNombre, h('button', { class: 'boton chico', type: 'submit' }, 'Guardar'))),

    h('form', { class: 'panel form', onSubmit: cambiarClave },
      h('h3', { class: 'panel-tit' }, 'Cambiar la contraseña'),
      h('div', { class: 'campo' }, h('label', { for: 'ajustes-clave-actual' }, 'La actual'), claveActual),
      h('div', { class: 'campo' },
        h('label', { for: 'ajustes-clave-nueva' }, 'La nueva'), claveNueva,
        h('span', { class: 'campo-ayuda' }, `Al menos ${claveMin} caracteres.`)),
      errorClave,
      h('button', { class: 'boton ancho', type: 'submit' }, 'Cambiar')),

    h('section', { class: 'panel' },
      h('h3', { class: 'panel-tit' }, 'Sobre ROOTKIT'),
      h('dl', { class: 'datos' },
        h('div', {}, h('dt', {}, 'Versión'), h('dd', {}, config?.version || '—')),
        h('div', {}, h('dt', {}, 'Reconocimiento'), h('dd', {}, config?.ia === 'claude' ? 'Claude' : 'Simulado'))),
      h('p', { class: 'nota', style: 'margin-top:12px' }, 'Para desvincular un ROOTKIT, entrá a la planta y bajá hasta el final. En la maceta, mantener apretado el botón 10 segundos la reinicia por completo.')),

    h('section', { class: 'panel' }, zonaBorrar));

  return cont;
}
