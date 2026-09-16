/* cuenta.mjs — crear la cuenta o entrar.
 *
 * Se usa en dos lugares: como paso del alta (después de instalar la app y
 * antes de vincular, para que la maceta quede a nombre de alguien) y como
 * pantalla propia cuando se abre la app sin sesión.
 *
 * El formulario es uno solo con dos modos. Quien llega por el QR de un
 * ROOTKIT nuevo casi siempre no tiene cuenta, así que arranca en "crear";
 * quien abre la app sin sesión casi siempre ya la tiene, y arranca en
 * "entrar".
 */
import { h, render, icono } from '../lib/ui.mjs';
import { cara } from '../lib/caras.mjs';

export function formularioCuenta(ctx, { modo: modoInicial = 'crear', alListo }) {
  let modo = modoInicial;
  const claveMin = ctx.config?.clave_min || 8;

  const nombre = h('input', { type: 'text', id: 'cuenta-nombre', autocomplete: 'given-name', maxlength: '40', placeholder: 'Cómo te llamás' });
  const email = h('input', { type: 'email', id: 'cuenta-email', autocomplete: 'email', inputmode: 'email', required: true, maxlength: '254', placeholder: 'vos@ejemplo.com', autocapitalize: 'none' });
  const clave = h('input', { type: 'password', id: 'cuenta-clave', required: true, minlength: String(claveMin), maxlength: '200' });
  const ver = h('button', {
    type: 'button', class: 'ver-clave', 'aria-label': 'Mostrar la contraseña',
    onClick: () => {
      const oculta = clave.type === 'password';
      clave.type = oculta ? 'text' : 'password';
      ver.setAttribute('aria-label', oculta ? 'Ocultar la contraseña' : 'Mostrar la contraseña');
      ver.textContent = oculta ? 'Ocultar' : 'Ver';
    },
  }, 'Ver');
  const error = h('p', { class: 'errores', role: 'alert', hidden: true });
  const enviar = h('button', { class: 'boton primario ancho', type: 'submit' });
  const campoNombre = h('div', { class: 'campo' }, h('label', { for: 'cuenta-nombre' }, 'Tu nombre'), nombre);
  const ayudaClave = h('span', { class: 'campo-ayuda' });
  const pestanas = h('div', { class: 'pestanas', role: 'tablist' });

  const pintarModo = () => {
    const crear = modo === 'crear';
    campoNombre.hidden = !crear;
    clave.autocomplete = crear ? 'new-password' : 'current-password';
    ayudaClave.textContent = crear ? `Al menos ${claveMin} caracteres.` : '';
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
      if (!email.value.trim() || !clave.value) {
        error.textContent = 'Completá el email y la contraseña.';
        error.hidden = false;
        return;
      }
      if (modo === 'crear' && clave.value.length < claveMin) {
        error.textContent = `La contraseña tiene que tener al menos ${claveMin} caracteres.`;
        error.hidden = false;
        clave.focus();
        return;
      }
      enviar.disabled = true;
      try {
        const r = modo === 'crear'
          ? await ctx.api('/api/cuenta/registro', {
            metodo: 'POST', token: null,
            cuerpo: { email: email.value, clave: clave.value, nombre: nombre.value, tz: Intl.DateTimeFormat().resolvedOptions().timeZone },
          })
          : await ctx.api('/api/cuenta/entrar', { metodo: 'POST', token: null, cuerpo: { email: email.value, clave: clave.value } });
        await alListo(r);
      } catch (e) {
        error.textContent = e.message;
        error.hidden = false;
        if (e.estado === 409) { modo = 'entrar'; pintarModo(); }
      } finally {
        enviar.disabled = false;
      }
    },
  },
  pestanas,
  campoNombre,
  h('div', { class: 'campo' }, h('label', { for: 'cuenta-email' }, 'Email'), email),
  h('div', { class: 'campo' },
    h('label', { for: 'cuenta-clave' }, 'Contraseña'),
    h('div', { class: 'con-boton' }, clave, ver),
    ayudaClave),
  error,
  enviar);

  pintarModo();
  return form;
}

/** La pantalla cuando se abre la app sin sesión. */
export function vistaEntrar(ctx) {
  const cont = h('div', { class: 'alta' });
  render(cont,
    h('div', { class: 'alta-cuerpo' },
      h('div', { class: 'cara-marco' }, cara({ modo: 'dormida', lado: 120 })),
      h('h1', { class: 'alta-titulo' }, 'Tus plantas te esperan'),
      h('p', { class: 'alta-texto' }, 'Entrá con tu cuenta para ver cómo están.'),
      formularioCuenta(ctx, { modo: 'entrar', alListo: ctx.alEntrar }),
      h('div', { class: 'separador' }, h('span', {}, '¿Tenés un ROOTKIT nuevo?')),
      h('p', { class: 'nota' }, 'Encendelo y escaneá con la cámara el QR que aparece en su pantalla.'),
      h('button', { class: 'enlace-boton', type: 'button', onClick: () => ctx.irA('agregar') },
        icono('mas', 16), ' Escribir el código a mano')));
  return cont;
}
