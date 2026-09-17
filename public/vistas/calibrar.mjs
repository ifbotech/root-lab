/* calibrar.mjs — el sensor de tierra y la maceta, en la ficha de la planta.
 *
 * CALIBRAR
 *
 * El capacitivo da un número crudo que cambia con cada sensor y con cada
 * sustrato (lib/riego.mjs). Calibrar son dos mediciones:
 *
 *   1. SECO     el sensor afuera, al aire, limpio y seco
 *   2. MOJADO   clavado en la tierra recién regada a fondo (que escurra)
 *
 * Mientras dura, la nube le pide al Rooti que mida y cuente cada pocos
 * segundos (POST /api/plantas/:id/calibrar) y acá se muestra el número crudo
 * en vivo, consultando la planta cada tres segundos. Cada paso toma el
 * número cuando la persona dice "ya está"; la validación es la misma que la
 * del firmware. Se guarda en la nube, que se la manda al Rooti: a partir de
 * ahí, el porcentaje es el de ESA tierra.
 *
 * LA MACETA
 *
 * Con el diámetro, las tareas y los avisos dicen cuánta agua ("unos 180 ml,
 * un vaso") en vez de "regá".
 */
import { h, render, icono } from '../lib/ui.mjs';
import {
  errorDeCalibracion, litrosDeSustrato, aguaEnPalabras, CRUDO_PISO, CRUDO_TECHO, MACETA,
} from '../lib/riego.mjs';

const CADA_MS = 3000;
const FRESCA_S = 40;
const fecha = (ms) => new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long' }).format(new Date(ms));

export function panelSensor(ctx, n) {
  const { api, avisar, recargar } = ctx;
  const zona = h('div', { class: 'calibrar' });
  let reloj = null;
  let vivo = n;

  const parar = () => { clearInterval(reloj); reloj = null; };
  const terminar = async (activo) => {
    parar();
    if (!activo) api(`/api/plantas/${n.id}/calibrar`, { metodo: 'POST', cuerpo: { activo: false }, cache: false }).catch(() => {});
  };

  function resumen() {
    const c = vivo.calibracion;
    render(zona,
      h('p', {}, c
        ? [h('b', {}, 'Calibrado'), ` el ${fecha(c.t)}: el porcentaje de tierra es el de esta maceta.`]
        : [h('b', {}, 'Con la calibración de fábrica'), ': el porcentaje es aproximado. Calibrarlo lleva dos minutos y un vaso de agua.']),
      h('div', { class: 'fila-botones' },
        h('button', { class: 'boton chico', type: 'button', id: `calibrar-${n.id}`, onClick: empezar }, icono('gota', 16), c ? 'Volver a calibrar' : 'Calibrar el sensor'),
        c ? h('button', {
          class: 'boton chico', type: 'button',
          onClick: async () => {
            if (!confirm('¿Volver a la calibración de fábrica?')) return;
            try {
              vivo = await api(`/api/plantas/${n.id}`, { metodo: 'PATCH', cuerpo: { calibracion: null } });
              avisar('Listo: tu Rooti vuelve a la calibración de fábrica.');
              resumen();
            } catch (e) { avisar(e.message, true); }
          },
        }, 'Volver a la de fábrica') : null));
  }

  async function empezar() {
    ctx.contar?.('vista:calibrar');
    try {
      vivo = await api(`/api/plantas/${n.id}/calibrar`, { metodo: 'POST', cuerpo: { activo: true }, cache: false });
    } catch (e) { avisar(e.message, true); return; }
    const medidas = { seco: null, mojado: null };
    paso('seco', medidas);
    reloj = setInterval(async () => {
      if (!zona.isConnected) { terminar(false); return; }
      try {
        vivo = await api(`/api/plantas/${n.id}`, { cache: false });
        zona.querySelector('.calibrar-crudo')?.replaceChildren(...lectura());
        const boton = zona.querySelector('.calibrar-tomar');
        if (boton) boton.disabled = !lecturaUtil();
      } catch { /* sin red un momento: se reintenta */ }
    }, CADA_MS);
  }

  const lecturaUtil = () => {
    const crudo = vivo.tel?.suelo_raw;
    return Number.isFinite(crudo) && crudo >= CRUDO_PISO && crudo <= CRUDO_TECHO && vivo.tel?.age_s !== null && vivo.tel.age_s <= FRESCA_S;
  };
  const lectura = () => {
    const crudo = vivo.tel?.suelo_raw;
    if (!Number.isFinite(crudo)) return [h('b', {}, '—'), h('small', {}, 'Esperando la primera medición…')];
    const vieja = !(vivo.tel?.age_s <= FRESCA_S);
    return [h('b', {}, String(crudo)), h('small', {}, vieja ? 'Esperando una medición nueva de tu Rooti…' : 'medición cruda, en vivo')];
  };

  function paso(cual, medidas) {
    const seco = cual === 'seco';
    render(zona,
      h('p', { class: 'calibrar-paso' }, seco ? 'Paso 1 de 2 · En seco' : 'Paso 2 de 2 · Mojada'),
      h('p', {}, seco
        ? 'Sacá el sensor de la tierra, limpialo y dejalo al aire, sin tocarlo con la mano.'
        : 'Regá la maceta a fondo, hasta que escurra por abajo, y clavá el sensor hasta la línea.'),
      h('div', { class: 'calibrar-crudo', 'aria-live': 'polite' }, lectura()),
      h('div', { class: 'fila-botones' },
        h('button', {
          class: 'boton chico primario calibrar-tomar', type: 'button', disabled: !lecturaUtil(),
          onClick: async () => {
            medidas[cual] = vivo.tel.suelo_raw;
            if (seco) { paso('mojado', medidas); return; }
            const error = errorDeCalibracion(medidas);
            if (error) {
              avisar(error, true);
              paso('seco', { seco: null, mojado: null });
              return;
            }
            try {
              vivo = await api(`/api/plantas/${n.id}`, { metodo: 'PATCH', cuerpo: { calibracion: medidas } });
              parar();
              avisar('Calibrado. En unos segundos tu Rooti mide con la tierra de esta maceta.');
              resumen();
              recargar?.();
            } catch (e) { avisar(e.message, true); }
          },
        }, seco ? 'Está seco: tomar' : 'Está empapada: tomar'),
        h('button', { class: 'boton chico', type: 'button', onClick: () => { terminar(false); resumen(); } }, 'Cancelar')),
      h('p', { class: 'nota' }, 'Tu Rooti mide cada pocos segundos mientras calibrás (y no se duerme). A los diez minutos vuelve solo a su ritmo.'));
  }

  /* ------------------------------------------------------------- maceta --- */
  const diametro = h('input', {
    type: 'number', id: `maceta-${n.id}`, min: String(MACETA.min_cm), max: String(MACETA.max_cm), step: '1', inputmode: 'numeric',
    value: n.maceta?.diametro_cm ? String(n.maceta.diametro_cm) : '', placeholder: 'cm',
  });
  const notaMaceta = h('p', { class: 'nota' });
  const pintarMaceta = () => {
    const litros = litrosDeSustrato(vivo.maceta);
    notaMaceta.textContent = litros === null
      ? 'Con el diámetro de la maceta, ROOTLAB te dice cuánta agua echarle, no sólo "regá".'
      : `Unos ${String(litros.toFixed(1)).replace('.', ',')} litros de sustrato.${vivo.agua_ml > 0 ? ` Ahora le vendrían bien unos ${aguaEnPalabras(vivo.agua_ml)}.` : ''}`;
  };
  const guardarMaceta = async (ev) => {
    ev.preventDefault();
    try {
      const valor = diametro.value.trim();
      vivo = await api(`/api/plantas/${n.id}`, { metodo: 'PATCH', cuerpo: { maceta: valor ? { diametro_cm: Number(valor) } : null } });
      avisar(valor ? 'Guardado.' : 'Sin maceta: vuelvo a decir sólo "regá".');
      pintarMaceta();
      recargar?.();
    } catch (e) { avisar(e.message, true); }
  };

  resumen();
  pintarMaceta();
  return h('section', { class: 'panel panel-sensor' },
    h('h3', { class: 'panel-tit' }, 'Sensor de tierra y maceta'),
    zona,
    h('form', { class: 'form', onSubmit: guardarMaceta, style: 'margin-top:14px' },
      h('div', { class: 'campo' },
        h('label', { for: diametro.id }, 'Diámetro de la maceta, arriba (cm)'),
        h('div', { class: 'con-boton' }, diametro, h('button', { class: 'boton chico', type: 'submit' }, 'Guardar'))),
      notaMaceta));
}
