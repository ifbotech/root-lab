/* ajustes.mjs — notificaciones, pasar la cuenta a otro teléfono y lo demás.
 *
 * La cuenta es anónima y vive en el teléfono (ver lib/api.mjs). Por eso lo
 * más importante de esta pantalla es el código para llevarla a otro lado:
 * sin él, cambiar de teléfono sería perder las plantas.
 */
import { h, render, icono } from '../lib/ui.mjs';
import { motivoSinAvisos, activarAvisos, avisosActivos, instalada } from '../lib/dispositivo.mjs';
import { guardarToken } from '../lib/api.mjs';

export function vistaAjustes(ctx) {
  const { api, avisar, config, recargar } = ctx;
  const cont = h('div', { class: 'vista' });

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

  const zonaTransferir = h('div', {});
  const transferir = async () => {
    try {
      const r = await api('/api/cuenta/transferir', { metodo: 'POST' });
      render(zonaTransferir,
        h('p', { class: 'codigo-grande mono' }, r.codigo),
        h('p', { class: 'nota' }, 'En el otro teléfono (o en la app instalada) abrí Ajustes y escribilo en “Traer mis plantas”. Vence en 10 minutos.'));
    } catch (e) { avisar(e.message, true); }
  };

  const inputRecuperar = h('input', { type: 'text', maxlength: '6', class: 'mono', placeholder: 'ABC123', 'aria-label': 'Código', autocapitalize: 'characters' });
  const recuperar = async () => {
    try {
      const r = await api('/api/cuenta/recuperar', { metodo: 'POST', cuerpo: { codigo: inputRecuperar.value }, token: null });
      guardarToken(r.token);
      avisar('Listo, tus plantas están acá.');
      await recargar();
      ctx.irA('hoy');
    } catch (e) { avisar(e.message, true); }
  };

  render(cont,
    h('header', { class: 'vista-cab' }, h('h2', {}, 'Ajustes')),

    h('section', { class: 'panel' },
      h('h3', { class: 'panel-tit' }, 'Notificaciones'),
      h('div', { class: 'fila-ajuste' },
        h('div', {}, h('b', {}, 'Avisos de tus plantas'), estadoAvisos),
        botonAvisos)),

    h('section', { class: 'panel form' },
      h('h3', { class: 'panel-tit' }, 'Llevar tus plantas a otro teléfono'),
      h('p', { class: 'nota' }, 'Tu cuenta vive en este teléfono. Generá un código y usalo en el otro.'),
      h('button', { class: 'boton ancho', type: 'button', onClick: transferir }, icono('telefono', 18), 'Generar código'),
      zonaTransferir),

    h('section', { class: 'panel form' },
      h('h3', { class: 'panel-tit' }, 'Traer mis plantas'),
      h('p', { class: 'nota' }, instalada()
        ? 'Si empezaste en el navegador, pedí el código en sus Ajustes.'
        : 'Si ya tenés plantas en otro teléfono, escribí el código que generaste allá.'),
      inputRecuperar,
      h('button', { class: 'boton ancho', type: 'button', onClick: recuperar }, 'Traer')),

    h('section', { class: 'panel' },
      h('h3', { class: 'panel-tit' }, 'Sobre ROOTKIT'),
      h('dl', { class: 'datos' },
        h('div', {}, h('dt', {}, 'Versión'), h('dd', {}, config?.version || '—')),
        h('div', {}, h('dt', {}, 'Reconocimiento'), h('dd', {}, config?.ia === 'claude' ? 'Claude' : 'Simulado'))),
      h('p', { class: 'nota', style: 'margin-top:12px' }, 'Para desvincular un ROOTKIT, entrá a la planta y bajá hasta el final. En la maceta, mantener apretado el botón 10 segundos la reinicia por completo.')));

  return cont;
}
