/* botanica.mjs — la pestaña "Avanzado · Botánica" del detalle de la planta.
 *
 * Para quien quiere ir más allá de la cara: el VPD (cuánta agua le tira el
 * aire a la hoja), el DLI (cuánta luz recibió en el día entero) y la
 * previsión de riego con el pronóstico (server/clima.mjs). Los cálculos
 * están en lib/botanica.mjs; acá sólo se muestran, con la misma barra de
 * rango que usan los demás números, y se cargan al abrir la pestaña, no
 * antes: la mayoría no la abre.
 */
import { h, render, medidor, seccion } from '../lib/ui.mjs';
import { vpd, zonaVpd, dliHoyYAyer, dliObjetivo, juicioDli } from '../lib/botanica.mjs';

const ESTADO_VPD = { 'muy-bajo': 'urgente', bajo: 'atencion', ideal: 'ok', alto: 'atencion', 'muy-alto': 'urgente' };
const ESTADO_DLI = { poco: 'atencion', bien: 'ok', mucho: 'atencion' };
const coma = (v, d = 1) => Number(v).toFixed(d).replace('.', ',');
const cuando = (ms) => new Intl.DateTimeFormat('es-AR', { weekday: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(ms));

function bloqueVpd(n) {
  const v = vpd(n.tel?.temp_dc, n.tel?.rh_pct);
  const z = zonaVpd(v);
  return h('div', { class: 'botanica-bloque' },
    v === null
      ? h('p', { class: 'nota' }, 'Sin temperatura o humedad del aire no hay VPD.')
      : medidor({ etiqueta: 'VPD ahora', texto: `${coma(v, 2)} kPa`, valor: v, min: 0, max: 2.4, lo: 0.8, hi: 1.2, estado: ESTADO_VPD[z.nivel] }),
    z ? h('p', { class: 'nota' }, z.texto) : null,
    h('p', { class: 'nota botanica-que' }, 'El déficit de presión de vapor dice cuánta agua le "tira" el aire a la hoja: sale de la temperatura y la humedad. Entre 0,8 y 1,2 kPa la mayoría de las plantas de interior transpira cómoda.'));
}

function bloqueDli(puntos, esp) {
  const { hoy, ayer, horasDeHoy } = dliHoyYAyer(puntos);
  const objetivo = dliObjetivo(esp);
  const juicio = juicioDli({ hoy, horasDeHoy, objetivo });
  const tope = Math.max(20, objetivo ? objetivo.max * 1.5 : 0, ayer * 1.2, hoy * 1.2);
  return h('div', { class: 'botanica-bloque' },
    medidor({
      etiqueta: `DLI de hoy (${coma(horasDeHoy)} h)`, texto: `${coma(hoy, 1)} mol/m²`, valor: hoy, min: 0, max: tope,
      lo: objetivo?.min, hi: objetivo?.max, estado: juicio ? ESTADO_DLI[juicio.nivel] : 'ok',
    }),
    h('p', { class: 'nota' }, [
      `Ayer: ${coma(ayer, 1)} mol/m².`,
      objetivo ? `Su especie pide entre ${coma(objetivo.min)} y ${coma(objetivo.max)} con 12 h de luz.` : null,
      juicio?.texto,
    ].filter(Boolean).join(' ')),
    h('p', { class: 'nota botanica-que' }, 'La luz diaria integrada suma cada lectura del sensor de luz a lo largo del día (lux × 0,0185 µmol/m²/s): es la que usan los invernaderos, porque las plantas viven de la luz del día entero, no de la del mediodía.'));
}

function bloquePrevision(r, irA) {
  if (!r.disponible) {
    const motivo = {
      ubicacion: 'Para anticipar el riego con el pronóstico, decime en qué ciudad están tus plantas.',
      historial: 'Todavía no hay bastante historial: hacen falta unas horas de tierra secándose para saber a qué velocidad lo hace.',
      lectura: 'Sin una lectura de tierra reciente no hay previsión.',
      clima: 'No pude pedir el pronóstico ahora. Vuelvo a intentar en un rato.',
    }[r.motivo] || 'Sin previsión por ahora.';
    return h('div', { class: 'botanica-bloque' },
      h('p', { class: 'nota' }, motivo),
      r.motivo === 'ubicacion'
        ? h('button', { class: 'boton chico', type: 'button', style: 'margin-top:8px', onClick: () => irA('ajustes') }, 'Decir dónde están')
        : null);
  }
  const c = r.clima;
  const ya = r.horas_hasta_sed <= 0;
  return h('div', { class: 'botanica-bloque' },
    h('p', { class: 'prevision-titulo' }, ya
      ? 'Ya está por debajo de lo que le gusta.'
      : `Va a tener sed en unas ${Math.round(r.horas_hasta_sed)} h: ${cuando(r.cuando)}.`),
    h('p', { class: 'nota' }, [
      `La tierra está al ${r.suelo} % y baja ${coma(r.tasa_pct_h, 2)} puntos por hora`,
      r.factor !== 1 ? ` (${r.factor > 1 ? 'más rápido' : 'más despacio'} con el clima que viene, ×${coma(r.factor, 2)})` : '',
      `; su especie pide más de ${r.soil_min} %.`,
    ].join('')),
    c ? h('p', { class: 'nota' }, `Próximas 48 h en ${r.ubicacion?.nombre || 'tu ciudad'}: de ${Math.round(c.temp_min_dc / 10)} a ${Math.round(c.temp_max_dc / 10)} °C, humedad mínima ${c.hr_min} %.`) : null,
    h('p', { class: 'nota botanica-que' }, 'Regla de tres con una corrección: la velocidad a la que se secó estos días, más rápido si viene calor seco. Si la sed llega dentro de las próximas 36 h y el clima empeora, te avisamos antes.'));
}

/* La vista de la planta se repinta sola cada tanto (app.js, refrescar): la
   pestaña recuerda si estaba abierta para no cerrarse en la cara de quien
   la lee. */
const abiertas = new Set();

/** La sección, plegada. Se llena al abrirla. */
export function panelBotanica(ctx, n, esp) {
  const { api, irA } = ctx;
  const cuerpo = h('div', { class: 'botanica' }, h('p', { class: 'nota' }, 'Calculando…'));
  const det = seccion('planta-botanica', 'Botánica', cuerpo,
    { abierta: abiertas.has(n.id), resumen: 'VPD, DLI y riego' });
  let cargado = false;
  const cargar = async () => {
    if (cargado) return;
    cargado = true;
    const [hist, prev] = await Promise.all([
      api(`/api/plantas/${n.id}/historial?horas=48`).catch(() => null),
      api(`/api/plantas/${n.id}/prevision`).catch((e) => ({ disponible: false, motivo: 'clima', error: e.message })),
    ]);
    render(cuerpo,
      h('h4', {}, 'Aire'), bloqueVpd(n),
      h('h4', {}, 'Luz'), hist ? bloqueDli(hist.puntos, esp) : h('p', { class: 'nota' }, 'No pude cargar el historial de luz.'),
      h('h4', {}, 'Riego'), bloquePrevision(prev, irA));
  };
  det.addEventListener('toggle', () => {
    if (det.open) abiertas.add(n.id); else abiertas.delete(n.id);
    if (det.open) cargar();
  });
  if (det.open) cargar();
  return det;
}
