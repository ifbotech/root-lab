/* cuenta.mjs — crear la cuenta, entrar, recuperar la contraseña y confirmar
 * el email.
 *
 * El formulario se usa en dos lugares: como paso del alta (después de
 * instalar la app y antes de vincular, para que el Rooti quede a nombre de
 * alguien) y como pantalla propia cuando se abre la app sin sesión. Tiene dos
 * modos: quien llega por el QR de un Rooti nuevo casi siempre no tiene cuenta
 * y arranca en "crear"; quien abre la app sin sesión casi siempre ya la tiene
 * y arranca en "entrar".
 *
 * RECUPERAR LA CONTRASEÑA
 *
 * "¿Olvidaste tu contraseña?" pide el email y el servidor manda un enlace de
 * un solo uso que vence en 30 minutos (#clave/<token>). La respuesta en
 * pantalla es la misma exista o no la cuenta: no se puede usar para averiguar
 * quién está registrado. El enlace abre `vistaRestablecer`, que primero
 * pregunta si sigue vigente (así no se escribe una contraseña para nada) y al
 * guardarla entra directo.
 */
import { h, render, icono } from '../lib/ui.mjs';
import { cara } from '../lib/caras.mjs';

function campoClave({ id, etiqueta, autocomplete, minimo }) {
  const input = h('input', { type: 'password', id, required: true, autocomplete, maxlength: '200', ...(minimo ? { minlength: String(minimo) } : {}) });
  const ver = h('button', {
    type: 'button', class: 'ver-clave', 'aria-label': 'Mostrar la contraseña', 'aria-controls': id,
    onClick: () => {
      const oculta = input.type === 'password';
      input.type = oculta ? 'text' : 'password';
      ver.setAttribute('aria-label', oculta ? 'Ocultar la contraseña' : 'Mostrar la contraseña');
      ver.textContent = oculta ? 'Ocultar' : 'Ver';
    },
  }, 'Ver');
  const ayuda = h('span', { class: 'campo-ayuda' });
  const campo = h('div', { class: 'campo' }, h('label', { for: id }, etiqueta), h('div', { class: 'con-boton' }, input, ver), ayuda);
  return { input, campo, ayuda };
}

export function formularioCuenta(ctx, { modo: modoInicial = 'crear', alListo }) {
  let modo = modoInicial;
  const claveMin = ctx.config?.clave_min || 8;
  const contenedor = h('div', { class: 'cuenta-form' });

  const nombre = h('input', { type: 'text', id: 'cuenta-nombre', autocomplete: 'given-name', maxlength: '40', placeholder: 'Cómo te llamás' });
  const email = h('input', { type: 'email', id: 'cuenta-email', autocomplete: 'email', inputmode: 'email', required: true, maxlength: '254', placeholder: 'vos@ejemplo.com', autocapitalize: 'none', spellcheck: 'false' });
  const clave = campoClave({ id: 'cuenta-clave', etiqueta: 'Contraseña', autocomplete: 'new-password' });
  const error = h('p', { class: 'errores', role: 'alert', hidden: true });
  const enviar = h('button', { class: 'boton primario ancho', type: 'submit' });
  const campoNombre = h('div', { class: 'campo' }, h('label', { for: 'cuenta-nombre' }, 'Tu nombre'), nombre);
  const pestanas = h('div', { class: 'pestanas', role: 'tablist' });
  const olvide = h('button', { class: 'enlace-boton', type: 'button', onClick: () => pedirEnlace() }, '¿Olvidaste tu contraseña?');

  const mostrarError = (texto) => { error.textContent = texto; error.hidden = false; };

  const pintarModo = () => {
    const crear = modo === 'crear';
    campoNombre.hidden = !crear;
    olvide.hidden = crear;
    clave.input.autocomplete = crear ? 'new-password' : 'current-password';
    clave.ayuda.textContent = crear ? `Al menos ${claveMin} caracteres.` : '';
    render(enviar, crear ? 'Crear cuenta' : 'Entrar');
    render(pestanas,
      ['crear', 'entrar'].map((m) => h('button', {
        type: 'button', role: 'tab', class: m === modo ? 'activa' : '', 'aria-selected': m === modo ? 'true' : 'false',
        onClick: () => { modo = m; error.hidden = true; pintarModo(); },
      }, m === 'crear' ? 'Crear cuenta' : 'Ya tengo cuenta')));
  };

  const form = h('form', {
    class: 'cuenta-form', novalidate: true,
    onSubmit: async (ev) => {
      ev.preventDefault();
      error.hidden = true;
      if (!email.value.trim() || !clave.input.value) {
        mostrarError('Completá el email y la contraseña.');
        return;
      }
      if (modo === 'crear' && clave.input.value.length < claveMin) {
        mostrarError(`La contraseña tiene que tener al menos ${claveMin} caracteres.`);
        clave.input.focus();
        return;
      }
      enviar.disabled = true;
      try {
        const r = modo === 'crear'
          ? await ctx.api('/api/cuenta/registro', {
            metodo: 'POST', token: null,
            cuerpo: { email: email.value, clave: clave.input.value, nombre: nombre.value, tz: Intl.DateTimeFormat().resolvedOptions().timeZone },
          })
          : await ctx.api('/api/cuenta/entrar', { metodo: 'POST', token: null, cuerpo: { email: email.value, clave: clave.input.value } });
        await alListo(r);
      } catch (e) {
        mostrarError(e.message);
        if (e.estado === 409) { modo = 'entrar'; pintarModo(); }
      } finally {
        enviar.disabled = false;
      }
    },
  },
  pestanas,
  campoNombre,
  h('div', { class: 'campo' }, h('label', { for: 'cuenta-email' }, 'Email'), email),
  clave.campo,
  error,
  enviar,
  olvide);

  function pedirEnlace() {
    const correo = h('input', {
      type: 'email', id: 'olvide-email', autocomplete: 'email', inputmode: 'email', required: true,
      maxlength: '254', autocapitalize: 'none', spellcheck: 'false', value: email.value,
    });
    const err = h('p', { class: 'errores', role: 'alert', hidden: true });
    const boton = h('button', { class: 'boton primario ancho', type: 'submit' }, 'Mandarme el enlace');
    const volver = h('button', { class: 'enlace-boton', type: 'button', onClick: () => render(contenedor, form) }, 'Volver');
    const pedido = h('form', {
      class: 'cuenta-form', novalidate: true,
      onSubmit: async (ev) => {
        ev.preventDefault();
        err.hidden = true;
        if (!correo.value.trim()) {
          err.textContent = 'Escribí el email de tu cuenta.';
          err.hidden = false;
          return;
        }
        boton.disabled = true;
        try {
          await ctx.api('/api/cuenta/olvide', { metodo: 'POST', token: null, cuerpo: { email: correo.value } });
          render(contenedor, h('div', { class: 'cuenta-form', role: 'status' },
            h('h2', { class: 'alta-titulo', style: 'font-size:24px' }, 'Revisá tu correo'),
            h('p', { class: 'alta-texto' }, `Si hay una cuenta con ${correo.value.trim()}, te mandamos un enlace para elegir una contraseña nueva. Vence en 30 minutos.`),
            h('p', { class: 'nota' }, '¿No llega? Mirá en spam o promociones, y esperá un par de minutos antes de pedir otro.'),
            h('button', { class: 'boton ancho', type: 'button', onClick: () => { render(contenedor, form); modo = 'entrar'; pintarModo(); } }, 'Volver a entrar')));
        } catch (e) {
          err.textContent = e.message;
          err.hidden = false;
          boton.disabled = false;
        }
      },
    },
    h('h2', { class: 'alta-titulo', style: 'font-size:24px' }, 'Recuperar la contraseña'),
    h('p', { class: 'nota' }, 'Te mandamos un enlace para elegir una nueva.'),
    h('div', { class: 'campo' }, h('label', { for: 'olvide-email' }, 'Email de tu cuenta'), correo),
    err, boton, volver);
    render(contenedor, pedido);
    setTimeout(() => correo.focus(), 30);
  }

  pintarModo();
  render(contenedor, form);
  return contenedor;
}

/** La pantalla cuando se abre la app sin sesión. */
export function vistaEntrar(ctx) {
  const cont = h('div', { class: 'alta' });
  render(cont,
    h('div', { class: 'alta-cuerpo' },
      h('div', { class: 'cara-marco' }, cara({ modo: 'dormida', lado: 120 })),
      h('h1', { class: 'alta-titulo' }, 'Tus plantas te esperan'),
      h('p', { class: 'alta-texto' }, 'Entrá a ROOTLAB para ver cómo están.'),
      formularioCuenta(ctx, { modo: 'entrar', alListo: ctx.alEntrar }),
      h('div', { class: 'separador' }, h('span', {}, '¿Tenés un Rooti nuevo?')),
      h('p', { class: 'nota' }, 'Encendelo y escaneá con la cámara el QR que aparece en su pantalla.'),
      h('button', { class: 'enlace-boton', type: 'button', onClick: () => ctx.irA('agregar') },
        icono('mas', 16), ' Escribir el código a mano')));
  return cont;
}

/** #clave/<token>: elegir la contraseña nueva. */
export function vistaRestablecer(ctx) {
  const token = ctx.plantaId || '';
  const claveMin = ctx.config?.clave_min || 8;
  const cuerpo = h('div', { class: 'alta-cuerpo' }, h('p', { class: 'espera', role: 'status' }, 'Revisando el enlace…'));
  const cont = h('div', { class: 'alta' }, cuerpo);

  const vencido = () => render(cuerpo,
    h('h1', { class: 'alta-titulo' }, 'Este enlace ya no sirve'),
    h('p', { class: 'alta-texto' }, 'Venció o ya se usó. Los enlaces para recuperar la contraseña duran 30 minutos y sirven una sola vez.'),
    h('button', { class: 'boton primario', type: 'button', onClick: () => ctx.irA('entrar') }, 'Pedir otro'));

  (async () => {
    let valido = false;
    try {
      valido = (await ctx.api(`/api/cuenta/restablecer?token=${encodeURIComponent(token)}`, { token: null })).valido;
    } catch { /* se trata como vencido */ }
    if (!valido) { vencido(); return; }

    const clave = campoClave({ id: 'nueva-clave', etiqueta: 'Contraseña nueva', autocomplete: 'new-password', minimo: claveMin });
    clave.ayuda.textContent = `Al menos ${claveMin} caracteres. Se cierra la sesión en todos tus teléfonos.`;
    const err = h('p', { class: 'errores', role: 'alert', hidden: true });
    const boton = h('button', { class: 'boton primario ancho', type: 'submit' }, 'Guardar y entrar');
    render(cuerpo,
      h('h1', { class: 'alta-titulo' }, 'Elegí una contraseña nueva'),
      h('form', {
        class: 'cuenta-form', novalidate: true,
        onSubmit: async (ev) => {
          ev.preventDefault();
          err.hidden = true;
          if (clave.input.value.length < claveMin) {
            err.textContent = `La contraseña tiene que tener al menos ${claveMin} caracteres.`;
            err.hidden = false;
            return;
          }
          boton.disabled = true;
          try {
            const r = await ctx.api('/api/cuenta/restablecer', { metodo: 'POST', token: null, cuerpo: { token, clave: clave.input.value } });
            ctx.avisar('Listo: contraseña nueva.');
            await ctx.alEntrar(r);
          } catch (e) {
            if (e.estado === 400 && /enlace/.test(e.message)) { vencido(); return; }
            err.textContent = e.message;
            err.hidden = false;
            boton.disabled = false;
          }
        },
      }, clave.campo, err, boton));
    setTimeout(() => clave.input.focus(), 30);
  })();
  return cont;
}

/* Un enlace de verificación se usa una vez: si la vista se vuelve a pintar,
   no se manda de nuevo. */
const verificaciones = new Map();

/** #verificar/<token>: confirmar el email. */
export function vistaVerificar(ctx) {
  const token = ctx.plantaId || '';
  const cuerpo = h('div', { class: 'alta-cuerpo' }, h('p', { class: 'espera', role: 'status' }, 'Confirmando tu email…'));
  const cont = h('div', { class: 'alta' }, cuerpo);
  if (!verificaciones.has(token)) {
    verificaciones.set(token, ctx.api('/api/cuenta/verificar', { metodo: 'POST', token: null, cuerpo: { token } }));
  }
  verificaciones.get(token).then(() => {
    render(cuerpo,
      h('div', { class: 'exito', 'aria-hidden': 'true' }, icono('tilde', 64)),
      h('h1', { class: 'alta-titulo' }, 'Email confirmado'),
      h('p', { class: 'alta-texto' }, 'Si alguna vez olvidás la contraseña, te podemos ayudar por ahí.'),
      h('button', { class: 'boton primario', type: 'button', onClick: () => ctx.irA(ctx.cuenta ? 'hoy' : 'entrar') }, 'Ir a ROOTLAB'));
    ctx.alVerificar?.();
  }, (e) => {
    render(cuerpo,
      h('h1', { class: 'alta-titulo' }, 'No pude confirmarlo'),
      h('p', { class: 'alta-texto' }, e.message),
      h('p', { class: 'nota' }, 'Podés pedir otro enlace desde Ajustes.'),
      h('button', { class: 'boton', type: 'button', onClick: () => ctx.irA(ctx.cuenta ? 'ajustes' : 'entrar') }, 'Seguir'));
  });
  return cont;
}
