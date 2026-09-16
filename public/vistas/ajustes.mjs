/* ajustes.mjs — la cuenta, la paleta, las notificaciones y lo demás.
 *
 * Las plantas viven en la cuenta, no en el teléfono (ver lib/api.mjs): para
 * verlas en otro lado alcanza con entrar con el mismo email. Por eso esta
 * pantalla sólo tiene lo que se toca de vez en cuando: el nombre, la paleta,
 * la contraseña, cerrar la sesión y borrar todo.
 *
 * EL SONIDO
 *
 * Las plantas hablan con la voz de su Rooti mientras escriben, y ronronean
 * al acariciarlas (lib/voz.mjs). El interruptor de acá es el mute global de
 * este teléfono; de noche se callan solas aunque esté prendido.
 *
 * LA PALETA
 *
 * ROOTLAB se pinta con la paleta de tu Rooti al abrir su cofre. Acá se puede
 * volver a Vibrant Tones o elegir la de cualquier Rooti que ya tengas; las de
 * los que faltan se ven apagadas, con candado.
 */
import { h, render, icono } from '../lib/ui.mjs';
import { motivoSinAvisos, activarAvisos, avisosActivos } from '../lib/dispositivo.mjs';
import { paletasDisponibles, PALETA_POR_DEFECTO } from '../lib/paletas.mjs';
import { estaSilenciado, silenciar, SILENCIO_DESDE, SILENCIO_HASTA } from '../lib/voz.mjs';

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

  /* -------------------------------------------------------------- sonido --- */
  const sonido = h('input', {
    type: 'checkbox', id: 'ajustes-sonido', checked: !estaSilenciado(),
    onChange: (ev) => {
      silenciar(!ev.target.checked);
      avisar(ev.target.checked ? 'Tus plantas hablan con su voz.' : 'Sonido apagado. El texto sale igual.');
    },
  });

  /* -------------------------------------------------------------- paleta --- */
  const actual = cuenta?.paleta || PALETA_POR_DEFECTO;
  const paletas = h('div', { class: 'paletas', role: 'radiogroup', 'aria-label': 'Paleta de colores' },
    paletasDisponibles(cuenta?.coleccion || []).map((p) => h('button', {
      type: 'button',
      class: `paleta ${p.id === actual ? 'activa' : ''}`,
      role: 'radio',
      'aria-checked': p.id === actual ? 'true' : 'false',
      'aria-disabled': p.bloqueada ? 'true' : null,
      onClick: async (ev) => {
        if (p.bloqueada) {
          avisar(`La paleta ${p.nombre} se desbloquea cuando te toca su Rooti en un cofre.`);
          return;
        }
        if (p.id === actual) return;
        const boton = ev.currentTarget;
        try {
          await api('/api/cuenta', { metodo: 'PATCH', cuerpo: { paleta: p.id } });
          await ctx.pintarApp(p.id, boton);
          await ctx.recargar();
        } catch (e) { avisar(e.message, true); }
      },
    },
    h('span', { class: 'muestras', 'aria-hidden': 'true' }, p.colores.map((c) => h('i', { style: `background:${c.hex}`, title: c.nombre }))),
    h('b', {}, p.nombre),
    h('small', {}, p.bloqueada ? 'Conseguí su Rooti' : p.rooti ? 'De tu Rooti' : 'La de ROOTLAB'),
    p.bloqueada ? h('span', { class: 'paleta-candado', 'aria-label': 'Bloqueada' }, icono('candado', 16)) : null)));

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
      avisar('Cambiada. Las sesiones en otros teléfonos se cerraron y te mandamos un aviso por email.');
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
      h('p', { class: 'nota' }, 'Se borran la cuenta, todas tus plantas, su historial y sus charlas, en todos los teléfonos. Tus Rooties vuelven a mostrar el QR. No se puede deshacer.'),
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

  /* ---------------------------------------------------- verificar email --- */
  const reenviar = h('button', {
    class: 'boton chico', type: 'button',
    onClick: async (ev) => {
      ev.currentTarget.disabled = true;
      try {
        await api('/api/cuenta/verificar/reenviar', { metodo: 'POST' });
        avisar(`Te mandamos el enlace a ${cuenta.email}.`);
      } catch (e) {
        avisar(e.message, true);
        ev.target.disabled = false;
      }
    },
  }, 'Reenviar');

  const limites = cuenta?.ia || config?.cuotas || {};

  render(cont,
    h('header', { class: 'vista-cab' }, h('h2', {}, 'Ajustes')),

    h('section', { class: 'panel' },
      h('h3', { class: 'panel-tit' }, 'Tu cuenta'),
      h('div', { class: 'fila-ajuste' },
        h('div', {}, h('b', {}, cuenta?.email || '—'), h('span', {}, 'Entrá con este email en cualquier teléfono y vas a ver tus plantas.')),
        h('button', { class: 'boton chico', type: 'button', onClick: () => ctx.salir() }, 'Salir')),
      cuenta && !cuenta.email_verificado
        ? h('div', { class: 'banda', role: 'status' }, icono('campana', 18),
            h('span', {}, 'Confirmá tu email: así podés recuperar la contraseña.'), reenviar)
        : null),

    h('section', { class: 'panel' },
      h('h3', { class: 'panel-tit' }, 'Paleta'),
      h('p', { class: 'nota', style: 'margin-bottom:12px' }, 'ROOTLAB se pinta con los colores de tu Rooti cuando sale del cofre. Podés cambiarla cuando quieras.'),
      paletas),

    h('section', { class: 'panel' },
      h('h3', { class: 'panel-tit' }, 'Notificaciones'),
      h('div', { class: 'fila-ajuste' },
        h('div', {}, h('b', {}, 'Avisos de tus plantas'), estadoAvisos),
        botonAvisos)),

    h('section', { class: 'panel' },
      h('h3', { class: 'panel-tit' }, 'Sonido'),
      h('div', { class: 'fila-ajuste' },
        h('label', { for: sonido.id }, h('b', {}, 'La voz de tus plantas'),
          h('span', {}, `Cada Rooti habla con su timbre mientras escribe y ronronea cuando lo acariciás. De ${SILENCIO_DESDE}:00 a 0${SILENCIO_HASTA}:00 se callan solos.`)),
        h('span', { class: 'interruptor' }, sonido, h('i')))),

    h('section', { class: 'panel' },
      h('h3', { class: 'panel-tit' }, 'Tu plan'),
      h('div', { class: 'fila-ajuste' },
        h('div', {},
          h('b', {}, cuenta?.plan === 'pro' ? 'ROOTLAB Pro' : 'Gratis'),
          h('span', {}, `${limites.chat ?? 3} mensajes por día con tus plantas, ${limites.identificar ?? 3} reconocimientos y ${limites.diagnosticar ?? 2} diagnósticos por día por Rooti.`)),
        cuenta?.plan === 'pro' ? null : h('span', { class: 'pildora plan' }, 'Pro, pronto'))),

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
      h('h3', { class: 'panel-tit' }, 'Sobre ROOTLAB'),
      h('dl', { class: 'datos' },
        h('div', {}, h('dt', {}, 'Versión'), h('dd', {}, config?.version || '—')),
        h('div', {}, h('dt', {}, 'Inteligencia'), h('dd', {}, config?.ia === 'claude' ? 'Claude' : 'Simulada'))),
      h('p', { class: 'nota', style: 'margin-top:12px' }, 'Tus datos personales (email, nombre y charlas) se guardan cifrados. Para desvincular un Rooti, entrá a su planta y bajá hasta el final; en el Rooti, mantener apretado el botón 10 segundos lo reinicia por completo.')),

    h('section', { class: 'panel' }, zonaBorrar));

  return cont;
}
