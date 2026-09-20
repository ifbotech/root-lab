/* mascota.mjs — el Rooti entero en la ficha de la planta, y sus cuidados.
 *
 * Arriba de todo en la ficha: el cuerpo (lib/cuerpo.mjs) con la cara viva y
 * las dos barras del "Pou botánico" (lib/mascota.mjs tiene las reglas):
 *
 *   Salud      la dan los sensores; acá sólo se muestra
 *   Felicidad  la dan los gestos de abajo
 *
 * Los gestos:
 *
 *   ACARICIAR  pasar el dedo por el cuerpo (lib/caricias.mjs): ronronea,
 *              vibra, corazones. La primera caricia de cada tanda se le
 *              cuenta al servidor, que suma como mucho una vez cada 4 h.
 *   LIMPIAR    con polvo, "Limpiar" pone la esponja: se frota sobre las
 *              motas, que se van con burbujas. Al sacar la última suma.
 *   SNACK      una gota de rocío vuela a la boca: ñam.
 *
 * De 22 a 8 (lib/reloj.mjs, con la hora de prueba del emulador) el Rooti se
 * sienta con su gorrito. Los gestos siguen andando.
 *
 * El servidor es quien guarda y decide; si no contesta, la escena igual se
 * ve (el ronroneo no espera a la red) y las barras quedan como estaban.
 */
import { h, icono, progreso } from '../lib/ui.mjs';
import { cuerpo } from '../lib/cuerpo.mjs';
import { acariciarCara, vibrar } from '../lib/caricias.mjs';
import { soltarParticulas } from '../lib/particulas.mjs';
import { burbujear, bocado } from '../lib/voz.mjs';
import { esNoche, CARICIA, LIMPIEZA, SNACK, GOTAS } from '../lib/mascota.mjs';
import { horaLocal, horaDePrueba, alCambiarHora } from '../lib/reloj.mjs';
import { ETAPAS, etapaDe } from '../lib/model.mjs';
import { pielDe } from '../lib/rooties.mjs';

const duracion = (ms) => {
  const min = Math.ceil(ms / 60000);
  if (min < 60) return `${min} min`;
  const hs = Math.floor(min / 60);
  return min % 60 ? `${hs} h ${min % 60} min` : `${hs} h`;
};

/** El Rooti de una planta, como cuerpo entero. */
export function cuerpoDeNodo(n, lado, extra = {}) {
  return cuerpo({
    persona: n.modelo,
    rareza: n.rareza || 'comun',
    dormido: !n.revelado,
    animo: n.mood,
    etapa: ETAPAS.indexOf(etapaDe(n.bond?.dias_sanos ?? 0)),
    lado,
    noche: n.revelado && esNoche(horaLocal()),
    polvo: n.mascota?.polvo || 0,
    clave: n.id,
    lux: n.tel?.lux ?? null,
    etiqueta: `${n.nombre || 'Tu Rooti'}: ${n.reason || ''}`,
    ...extra,
  });
}

function barra(etiqueta, valor, nota, clase) {
  const sin = valor === null || valor === undefined;
  return h('div', { class: `barra-mascota ${clase}` },
    h('div', { class: 'barra-mascota-cab' },
      h('span', {}, etiqueta),
      h('b', {}, sin ? '—' : `${valor} %`)),
    progreso(sin ? 0 : valor, sin ? 'vacia' : ''),
    h('small', {}, nota));
}

/**
 * El héroe de la ficha: el cuerpo, el nombre y las barras con los gestos.
 * Devuelve { heroe, panel } para que la ficha los ponga donde van.
 */
export function heroeMascota(ctx, n, { encabezado = [] } = {}) {
  const { api, avisar } = ctx;
  const bicho = cuerpoDeNodo(n, 220, { fps: 24 });
  const escena = h('div', { class: 'escena-mascota' }, bicho);
  /* El degradado de atrás va con `escena`, el tinte claro de la piel: el
     color del cuerpo, que es de juguete de vinilo, no deja leer nada. */
  const fondo = n.revelado ? pielDe(n.modelo, n.rareza || 'comun')?.escena : null;
  const heroe = h('section', { class: 'heroe heroe-mascota', style: fondo ? `--piel:${fondo}` : '' }, escena, ...encabezado);
  if (!n.revelado) return { heroe, panel: null, bicho };

  let m = n.mascota || { felicidad: 0, polvo: 0, gotas: 0, caricia_en_ms: 0, optimo_pct: 0 };
  let recibida = performance.now();
  const faltaCaricia = () => Math.max(0, m.caricia_en_ms - (performance.now() - recibida));

  const zonaBarras = h('div', { class: 'barras-mascota' });
  const pista = h('p', { class: 'nota mascota-pista', 'aria-live': 'polite' });
  const bLimpiar = h('button', { class: 'boton chico', type: 'button', id: `limpiar-${n.id}` }, icono('gota', 16), 'Limpiar');
  const bSnack = h('button', { class: 'boton chico oro', type: 'button', id: `snack-${n.id}` });
  const noche = h('p', { class: 'mascota-noche', hidden: true });

  function pintarBarras() {
    zonaBarras.replaceChildren(
      barra('Salud', n.salud, 'La dan los sensores: se sube cuidando la planta.', 'salud'),
      barra('Felicidad', m.felicidad, 'La dan tus mimos: caricias, limpieza y snacks.', 'felicidad'));
    bSnack.replaceChildren(icono('gota', 16), `Snack de rocío · ${m.gotas}`);
    bSnack.disabled = m.gotas < 1;
    bSnack.title = m.gotas < 1 ? `Sin gotas: se gana una cada ${GOTAS.cadaMs / 3600000} h con la planta cómoda (${m.optimo_pct} % de la próxima).` : `+${SNACK.suma} de felicidad`;
    bLimpiar.disabled = m.polvo < 1;
    bLimpiar.title = m.polvo < 1 ? 'Está limpio: el polvo aparece a los 3 días sin mimos.' : `+${LIMPIEZA.suma} de felicidad`;
    const falta = faltaCaricia();
    const partes = [];
    if (m.polvo > 0) partes.push(`Tiene polvo encima: ${m.polvo} motas.`);
    partes.push(falta > 0 ? `La próxima caricia suma en ${duracion(falta)}.` : `Pasá el dedo por su cuerpo: +${CARICIA.suma}.`);
    partes.push(m.gotas < GOTAS.maximo ? `Próxima gota: ${m.optimo_pct} %.` : 'Tiene todas las gotas que entran.');
    pista.textContent = partes.join(' ');
  }

  function actualizarNoche() {
    const hora = horaLocal();
    const es = esNoche(hora);
    bicho.actualizar({ noche: es });
    const prueba = horaDePrueba();
    noche.hidden = !es && prueba === null;
    noche.textContent = es
      ? `Son las ${hora} h: se sentó a dormir con su gorrito. Los mimos siguen valiendo.`
      : `Hora de prueba: ${prueba} h.`;
  }

  async function gesto(accion) {
    try {
      const r = await api(`/api/plantas/${n.id}/mascota`, { metodo: 'POST', cuerpo: { accion } });
      m = r.mascota;
      recibida = performance.now();
      n.mascota = m;
      bicho.actualizar({ polvo: accion === 'limpiar' ? 0 : bicho.estado.polvo });
      pintarBarras();
      if (r.suma > 0) avisar(`+${r.suma} de felicidad`);
      return r;
    } catch (e) {
      avisar(e.message, true);
      return null;
    }
  }

  /* Acariciar: el cuerpo entero. */
  acariciarCara(bicho, {
    escenario: escena,
    direccion: 'pan-y',
    alEmpezar: () => { if (faltaCaricia() === 0) gesto('caricia'); },
  });

  /* Limpiar: una capa encima del cuerpo toma el dedo mientras dura la esponja. */
  const capa = h('div', { class: 'esponja-capa', hidden: true, 'aria-hidden': 'true' }, h('span', { class: 'esponja' }));
  escena.append(capa);
  let ultimaBurbuja = 0;
  const salirEsponja = () => {
    capa.hidden = true;
    bLimpiar.classList.remove('activo');
    bLimpiar.setAttribute('aria-pressed', 'false');
  };
  const frotar = (ev) => {
    const r = bicho.getBoundingClientRect();
    const e = escena.getBoundingClientRect();
    const x = ev.clientX - r.left;
    const y = ev.clientY - r.top;
    capa.firstChild.style.transform = `translate(${ev.clientX - e.left}px, ${ev.clientY - e.top}px)`;
    if (ev.pointerType === 'mouse' && !(ev.buttons & 1)) return;
    const quedan = bicho.limpiarEn(x, y);
    if (quedan < 0) return;
    const t = performance.now();
    if (t - ultimaBurbuja > 140) {
      ultimaBurbuja = t;
      burbujear();
      vibrar();
    }
    soltarParticulas(escena, { x: ev.clientX - e.left, y: ev.clientY - e.top, cantidad: 3, formas: ['burbuja'] });
    if (quedan === 0) {
      salirEsponja();
      gesto('limpiar');
    }
  };
  capa.addEventListener('pointerdown', (ev) => { try { capa.setPointerCapture(ev.pointerId); } catch { /* no hace falta */ } frotar(ev); });
  capa.addEventListener('pointermove', frotar);
  bLimpiar.addEventListener('click', () => {
    if (!capa.hidden) { salirEsponja(); return; }
    capa.hidden = false;
    bLimpiar.classList.add('activo');
    bLimpiar.setAttribute('aria-pressed', 'true');
    /* El botón está debajo: el Rooti tiene que quedar a la vista para frotarlo. */
    const suave = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    escena.scrollIntoView({ behavior: suave ? 'smooth' : 'auto', block: 'center' });
    avisar('Frotá las motas con la esponja.');
  });

  /* Snack: la gota vuela a la boca. */
  bSnack.addEventListener('click', async () => {
    bSnack.disabled = true;
    const r = await gesto('snack');
    if (!r) { pintarBarras(); return; }
    bocado();
    const v = bicho.querySelector('.cuerpo-ventana').getBoundingClientRect();
    const e = escena.getBoundingClientRect();
    const gota = h('span', { class: 'gota-snack', 'aria-hidden': 'true' }, icono('gota', 26));
    gota.style.left = `${v.left - e.left + v.width / 2}px`;
    gota.style.top = `${v.top - e.top + v.height * 0.72}px`;
    escena.append(gota);
    setTimeout(() => gota.remove(), 900);
    bicho.acariciar(true);
    setTimeout(() => bicho.acariciar(false), 1100);
    soltarParticulas(escena, { x: v.left - e.left + v.width / 2, y: v.top - e.top, cantidad: 4 });
  });

  const panel = h('section', { class: 'panel panel-mascota' },
    h('h3', { class: 'panel-tit' }, 'Mimos'),
    zonaBarras,
    h('div', { class: 'fila-botones' }, bLimpiar, bSnack),
    pista,
    noche);

  pintarBarras();
  actualizarNoche();
  const reloj = setInterval(() => {
    if (!heroe.isConnected) { clearInterval(reloj); quitarHora(); return; }
    actualizarNoche();
    pintarBarras();
  }, 60000);
  const quitarHora = alCambiarHora(() => actualizarNoche());
  return { heroe, panel, bicho };
}
