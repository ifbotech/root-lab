/* plantas.mjs — la lista y el detalle de cada maceta.
 *
 * Acá viven los números. Es la pantalla a la que va alguien que ya sabe que
 * algo pasa y quiere ver por qué, así que no se ahorra información: los
 * sensores con su rango, cómo vinieron las últimas horas, la batería, el
 * vínculo y los ajustes de la pantalla de la maceta.
 *
 * Cada número viene con su rango. Un 34 % no significa nada solo; un 34 %
 * sobre una barra que marca "esta especie quiere entre 25 y 60" se lee sin
 * pensar.
 */
import { h, render, icono, medidor, progreso, botonVolver, seccion } from '../lib/ui.mjs';
import {
  MOOD_ES, LINK_ES, ETAPA_ES, formatTemp, formatLux, formatEdad,
  ordenarNodos, etapaDe, progresoEtapa, bateriaDe, energiaDe,
} from '../lib/model.mjs';
import { caraDeNodo } from './hoy.mjs';
import { token } from '../lib/tema.mjs';
import { heroeMascota } from './mascota.mjs';
import { panelBotanica } from './botanica.mjs';
import { panelSensor } from './calibrar.mjs';

/* Qué decir del firmware del Rooti (server/firmware.mjs, root-kit/docs/ota.md). */
export function textoFirmware(nodo) {
  const a = nodo?.actualizacion;
  const version = nodo?.fw || a?.version || '';
  if (!version) return '—';
  if (a?.estado === 'bajando') return `${version} · bajando la ${a.intento || a.disponible || 'nueva'}…`;
  if (a?.estado === 'verificando') return `${version} · recién instalada, probándose`;
  if (a?.disponible) {
    return a.estado === 'fallo' && a.intento === a.disponible
      ? `${version} · la ${a.disponible} no se pudo instalar: reintenta sola`
      : `${version} · hay una nueva (${a.disponible}): se instala sola${nodo.usb ? '' : ', con batería de sobra o enchufado'}`;
  }
  return `${version} · al día`;
}

const CUIDADO_ES = {
  riego: 'Riego', luz: 'Luz', temperatura: 'Temperatura', humedad: 'Humedad', sustrato: 'Sustrato',
  abono: 'Abono', poda: 'Poda', plagas: 'Plagas', toxicidad: 'Toxicidad', curiosidad: 'Dato curioso',
};

const SEV_CLASE = { URGENT: 'urgente', WATCH: 'atencion', OK: 'bien' };
const CUIDADOR_DIAS = [3, 7, 15];
const fecha = (ms) => new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long' }).format(new Date(ms));

function medidores(n, esp) {
  const t = n.tel || {};
  const m = n.mood;
  const estado = (mala) => (mala ? SEV_CLASE[n.severity] || 'ok' : 'ok');
  return [
    medidor({
      etiqueta: 'Tierra', texto: t.soil_pct === null ? '—' : `${t.soil_pct} %`,
      valor: t.soil_pct, min: 0, max: 100, lo: esp?.soil_min, hi: esp?.soil_max,
      estado: estado(m === 'THIRSTY' || m === 'DROWNING'),
    }),
    medidor({
      etiqueta: 'Temperatura', texto: formatTemp(t.temp_dc),
      valor: t.temp_dc, min: 0, max: 450, lo: esp?.temp_min_dc, hi: esp?.temp_max_dc,
      estado: estado(m === 'COLD' || m === 'HOT'),
    }),
    medidor({
      etiqueta: 'Luz', texto: formatLux(t.lux),
      valor: Math.min(t.lux ?? 0, 40000) / 400, min: 0, max: 100,
      lo: (esp?.lux_min ?? 0) / 400, hi: Math.min(esp?.lux_max ?? 40000, 40000) / 400,
      estado: estado(m === 'DARK' || m === 'SCORCHED'),
    }),
    medidor({
      etiqueta: 'Humedad del aire', texto: t.rh_pct === null ? '—' : `${t.rh_pct} %`,
      valor: t.rh_pct, min: 0, max: 100, lo: esp?.rh_min, hi: 100,
      estado: estado(m === 'PARCHED_AIR'),
    }),
    Number.isFinite(t.suelo_dc)
      ? medidor({ etiqueta: 'Temperatura de la tierra', texto: formatTemp(t.suelo_dc), valor: t.suelo_dc, min: 0, max: 450 })
      : null,
  ];
}

const dato = (ico, texto, mal = false) => h('span', { class: `dato ${mal ? 'mal' : ''}` }, icono(ico, 14), texto);

function fila(n, esp, alAbrir) {
  const bat = bateriaDe(n);
  const t = n.tel || {};
  return h('li', {
    class: `planta sev-${SEV_CLASE[n.severity] || 'bien'}`, tabindex: '0', role: 'button',
    onClick: () => alAbrir(n.id),
    onKeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alAbrir(n.id); } },
  },
    caraDeNodo(n, 84, { fps: 12 }),
    h('div', { class: 'planta-cuerpo' },
      h('div', { class: 'planta-cab' },
        h('h3', {}, n.nombre || 'Sin nombre'),
        h('span', { class: 'chip chip-estado' }, n.revelado ? (MOOD_ES[n.mood] || n.mood) : 'dormido')),
      h('p', { class: 'planta-especie' }, esp?.nombre || 'sin identificar'),
      h('div', { class: 'planta-mini' },
        t.soil_pct !== null ? dato('gota', `${t.soil_pct} %`, n.mood === 'THIRSTY' || n.mood === 'DROWNING') : null,
        t.temp_dc !== null ? dato('termometro', formatTemp(t.temp_dc), n.mood === 'COLD' || n.mood === 'HOT') : null,
        t.lux !== null ? dato('sol', formatLux(t.lux), n.mood === 'DARK' || n.mood === 'SCORCHED') : null,
        t.usb ? dato('enchufe', t.batt_mv > 0 ? 'cargando' : 'enchufado') : bat !== null ? dato('pila', `${bat} %`, bat < 15) : null),
      h('div', { class: 'planta-pie' },
        h('span', { class: `enlace-${(n.link || '').toLowerCase()}` }, LINK_ES[n.link] || '—'),
        h('span', {}, formatEdad(t.age_s)))));
}

export function vistaPlantas(ctx) {
  const { estado, especies, alAbrir, irA } = ctx;
  const nodos = ordenarNodos(estado?.nodes || []);
  const porId = new Map((especies || []).map((e) => [e.id, e]));
  const cont = h('div', { class: 'vista' });

  render(cont,
    h('header', { class: 'vista-cab' },
      h('h2', {}, 'Mis plantas'),
      h('button', { class: 'boton chico azul', type: 'button', onClick: () => irA('agregar') },
        icono('mas', 16), 'Agregar')),
    nodos.length === 0
      ? h('section', { class: 'panel vacio' }, h('p', {}, 'Todavía no tenés ningún Rooti.'))
      : h('ul', { class: 'plantas' }, nodos.map((n) => fila(n, porId.get(n.especie), alAbrir))));
  return cont;
}

/* ------------------------------------------------------------ gráfico --- */
/* Los colores salen de la paleta aplicada (tokens dato-*), no de acá. */
const SERIES = [
  { clave: 'soil_pct', nombre: 'Tierra', token: 'dato-tierra', max: () => 100 },
  { clave: 'temp_dc', nombre: 'Temperatura', token: 'dato-temperatura', max: (p) => Math.max(350, ...p) },
  { clave: 'lux', nombre: 'Luz', token: 'dato-luz', max: (p) => Math.max(1000, ...p) },
];
const colorDe = (s) => token(s.token) || '#277da1';

function grafico(puntos, horas, esp) {
  const ns = 'http://www.w3.org/2000/svg';
  const W = 320;
  const H = 120;
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'grafico');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Últimas ${horas} horas`);
  const ahora = Date.now();
  const x = (t) => ((t - (ahora - horas * 3600e3)) / (horas * 3600e3)) * W;

  /* zona cómoda de la tierra */
  if (esp) {
    const zona = document.createElementNS(ns, 'rect');
    zona.setAttribute('x', 0);
    zona.setAttribute('width', W);
    zona.setAttribute('y', H - (esp.soil_max / 100) * (H - 8) - 4);
    zona.setAttribute('height', ((esp.soil_max - esp.soil_min) / 100) * (H - 8));
    zona.setAttribute('fill', colorDe(SERIES[0]));
    zona.setAttribute('fill-opacity', '.12');
    svg.append(zona);
  }
  for (let i = 1; i < 4; i++) {
    const l = document.createElementNS(ns, 'line');
    l.setAttribute('x1', 0); l.setAttribute('x2', W);
    l.setAttribute('y1', (H / 4) * i); l.setAttribute('y2', (H / 4) * i);
    l.setAttribute('stroke', 'rgba(255,255,255,.06)');
    svg.append(l);
  }
  for (const s of SERIES) {
    const pts = puntos.filter((p) => Number.isFinite(p[s.clave]));
    if (pts.length < 2) continue;
    const max = s.max(pts.map((p) => p[s.clave]));
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${(H - 4 - (p[s.clave] / max) * (H - 8)).toFixed(1)}`).join(' ');
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', colorDe(s));
    path.setAttribute('stroke-width', '3');
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('stroke-linecap', 'round');
    svg.append(path);
    const u = pts[pts.length - 1];
    const c = document.createElementNS(ns, 'circle');
    c.setAttribute('cx', x(u.t)); c.setAttribute('cy', H - 4 - (u[s.clave] / max) * (H - 8));
    c.setAttribute('r', 4.5); c.setAttribute('fill', colorDe(s));
    svg.append(c);
  }
  return svg;
}

/* ---------------------------------------------------------- cuidador --- */
/* El enlace recién creado se recuerda un rato: la vista se repinta sola cada
   tanto y hay que darle tiempo a la persona de copiarlo. */
const enlacesRecientes = new Map();
const ENLACE_RECUERDO_MS = 15 * 60 * 1000;

/* El enlace para quien cuida la planta mientras no estás (vistas/sitter.mjs). */
function panelCuidador(ctx, n) {
  const { api, avisar } = ctx;
  const nombre = h('input', { type: 'text', id: `cuidador-nombre-${n.id}`, maxlength: '30', placeholder: 'Cómo se llama (opcional)', autocomplete: 'off' });
  const zonaEnlace = h('div');
  const lista = h('div', { class: 'enlaces' });

  const mostrar = (r) => {
    enlacesRecientes.set(n.id, { r, t: Date.now() });
    const campo = h('input', { type: 'text', readonly: true, value: r.url, id: `cuidador-url-${n.id}`, 'aria-label': 'Enlace del cuidador' });
    const copiar = async () => {
      try { await navigator.clipboard.writeText(r.url); avisar('Copiado. Mandáselo por donde quieras.'); } catch { campo.select(); }
    };
    const compartir = () => navigator.share({ title: `Cuidá a ${n.nombre || 'mi planta'}`, text: `Mientras no estoy, acá ves cómo está ${n.nombre || 'mi planta'} y qué necesita.`, url: r.url }).catch(() => {});
    render(zonaEnlace, h('div', { class: 'enlace-nuevo' },
      campo,
      h('div', { class: 'fila-botones' },
        h('button', { class: 'boton chico', type: 'button', onClick: copiar }, 'Copiar'),
        typeof navigator.share === 'function' ? h('button', { class: 'boton chico azul', type: 'button', onClick: compartir }, icono('compartir', 16), 'Compartir') : null),
      h('p', { class: 'nota' }, `Vale hasta el ${fecha(r.vence)}. Quien lo abra ve sólo esta planta.`)));
  };
  const cargar = async () => {
    try {
      const r = await api(`/api/plantas/${n.id}/cuidador`);
      render(lista,
        r.enlaces.length
          ? h('div', { class: 'fila-ajuste' },
              h('div', {}, h('b', {}, r.enlaces.length === 1 ? '1 enlace activo' : `${r.enlaces.length} enlaces activos`),
                h('span', {}, `El último vale hasta el ${fecha(Math.max(...r.enlaces.map((e) => e.vence)))}.`)),
              h('button', {
                class: 'boton chico peligro', type: 'button',
                onClick: async () => { await api(`/api/plantas/${n.id}/cuidador`, { metodo: 'DELETE' }); enlacesRecientes.delete(n.id); render(zonaEnlace); avisar('Los enlaces dejaron de valer.'); cargar(); },
              }, 'Revocar'))
          : null,
        r.riegos.length ? h('p', { class: 'nota' }, `Último riego anotado: ${r.riegos[0].quien || 'alguien'}, el ${fecha(r.riegos[0].t)}.`) : null);
    } catch { /* sin red: el panel queda igual */ }
  };
  cargar();
  const reciente = enlacesRecientes.get(n.id);
  if (reciente && Date.now() - reciente.t < ENLACE_RECUERDO_MS) mostrar(reciente.r);

  return seccion('planta-cuidador', 'Cuidador', [
    h('p', { class: 'nota' }, `¿Te vas unos días? Compartí un enlace: quien cuide a ${n.nombre || 'tu planta'} ve su cara, qué necesita y cómo se riega, sin instalar nada, y puede anotar "ya regué".`),
    h('div', { class: 'campo' }, nombre),
    h('div', { class: 'fila-botones' }, CUIDADOR_DIAS.map((d) => h('button', {
      class: 'boton chico', type: 'button',
      onClick: async () => {
        try { mostrar(await api(`/api/plantas/${n.id}/cuidador`, { metodo: 'POST', cuerpo: { dias: d, nombre: nombre.value } })); cargar(); } catch (e) { avisar(e.message, true); }
      },
    }, `${d} días`))),
    zonaEnlace,
    lista,
  ]);
}

/* ----------------------------------------------------------- detalle --- */
export function vistaDetalle(ctx) {
  const { estado, especies, coleccion, plantaId, volver, alDiagnosticar, api, avisar, alCambiarEspecie, recargar, irA } = ctx;
  const n = (estado?.nodes || []).find((x) => x.id === plantaId);
  const cont = h('div', { class: 'vista' });

  if (!n) {
    render(cont, h('section', { class: 'panel vacio' },
      h('p', {}, 'Esa planta ya no está.'),
      h('button', { class: 'boton', type: 'button', onClick: volver }, 'Volver')));
    return cont;
  }

  const esp = n.especie_info || (especies || []).find((e) => e.id === n.especie);
  const sanos = n.bond?.dias_sanos ?? 0;
  const etapa = etapaDe(sanos);
  const bat = bateriaDe(n);
  const modelo = (coleccion?.catalogo || []).find((m) => m.id === n.modelo);
  /* Sin una IA de verdad, charlar, reconocer y diagnosticar no se ofrecen. */
  const conIA = ctx.config?.ia_visible !== false;

  /* historial */
  let horas = 48;
  const zonaGrafico = h('div', {}, h('p', { class: 'nota' }, 'Cargando…'));
  const cargarHistorial = async () => {
    try {
      const r = await api(`/api/plantas/${n.id}/historial?horas=${horas}`);
      if (r.puntos.length < 2) {
        render(zonaGrafico, h('p', { class: 'nota' }, 'Todavía no hay suficientes lecturas. Vuelvo a mirar en un rato.'));
        return;
      }
      render(zonaGrafico, grafico(r.puntos, horas, esp),
        h('div', { class: 'grafico-leyenda' }, SERIES.map((s) => h('span', {}, h('i', { style: `background:${colorDe(s)}` }), s.nombre))));
    } catch (e) {
      render(zonaGrafico, h('p', { class: 'errores' }, e.message));
    }
  };
  const selector = h('div', { class: 'selector' },
    [24, 48, 168].map((hs) => h('button', {
      type: 'button', class: hs === horas ? 'activo' : '',
      onClick: (ev) => {
        horas = hs;
        [...selector.children].forEach((b) => b.classList.toggle('activo', b === ev.currentTarget));
        cargarHistorial();
      },
    }, hs === 168 ? '7 días' : `${hs} h`)));
  cargarHistorial();

  /* ajustes de la maceta */
  const siempre = h('input', {
    type: 'checkbox', id: `siempre-${n.id}`, checked: n.pantalla === 'siempre',
    onChange: async (ev) => {
      try {
        await api(`/api/plantas/${n.id}`, { metodo: 'PATCH', cuerpo: { pantalla: ev.target.checked ? 'siempre' : 'toque' } });
        avisar(ev.target.checked ? 'La pantalla va a quedar siempre encendida.' : 'La pantalla se va a apagar sola a batería.');
      } catch (e) { avisar(e.message, true); ev.target.checked = !ev.target.checked; }
    },
  });
  let tBrillo;
  const brillo = h('input', {
    type: 'range', min: '10', max: '100', step: '5', value: String(n.brillo ?? 80), id: `brillo-${n.id}`,
    onInput: (ev) => {
      clearTimeout(tBrillo);
      tBrillo = setTimeout(() => api(`/api/plantas/${n.id}`, { metodo: 'PATCH', cuerpo: { brillo: Number(ev.target.value) } })
        .catch((e) => avisar(e.message, true)), 400);
    },
  });

  const renombrar = async () => {
    const nuevo = prompt('¿Cómo se llama?', n.nombre || '');
    if (nuevo === null) return;
    try {
      await api(`/api/plantas/${n.id}`, { metodo: 'PATCH', cuerpo: { nombre: nuevo } });
      await recargar();
    } catch (e) { avisar(e.message, true); }
  };
  const desvincular = async () => {
    if (!confirm(`¿Desvincular a ${n.nombre || 'este Rooti'}? Va a volver a mostrar el QR. Su historial queda guardado en tu cuenta.`)) return;
    try {
      await api(`/api/plantas/${n.id}`, { metodo: 'DELETE' });
      avisar('Listo. En el Rooti va a aparecer el QR de nuevo.');
      await recargar();
      irA('plantas');
    } catch (e) { avisar(e.message, true); }
  };

  /* El Rooti entero, con sus mimos (vistas/mascota.mjs): se deja acariciar,
     limpiar y convidar un snack. */
  const { heroe, panel: panelMimos } = heroeMascota(ctx, n, { encabezado: [
    h('h2', {}, n.nombre || 'Sin nombre'),
    n.revelado ? h('p', { class: 'dice' }, n.reason || '') : null,
    h('p', { class: 'heroe-sub' },
      esp?.nombre || 'sin identificar', ' · ',
      h('span', { class: `enlace-${(n.link || '').toLowerCase()}` }, LINK_ES[n.link] || '—'), ' · ',
      formatEdad(n.tel?.age_s)),
    n.riego ? h('p', { class: 'heroe-sub' }, icono('gota', 14), ` ${n.riego.quien || 'Alguien'} regó ${formatEdad(Math.floor((Date.now() - n.riego.t) / 1000))}`) : null,
  ] });
  heroe.classList.add(`sev-${SEV_CLASE[n.severity] || 'bien'}`);

  render(cont,
    h('header', { class: 'vista-cab' },
      botonVolver(volver),
      h('h2', {}, ''),
      h('button', { class: 'boton chico', type: 'button', onClick: renombrar }, 'Renombrar')),

    heroe,

    !n.revelado
      ? h('section', { class: 'panel' },
          h('button', { class: 'boton oro ancho', type: 'button', onClick: () => ctx.alRetomarAlta(n) }, icono('caja', 20), 'Abrir el cofre'))
      : n.chat
        ? h('button', { class: 'boton primario ancho', type: 'button', onClick: () => ctx.alChat(n.id) },
            icono('chat', 20), `Hablar con ${n.nombre}`)
        : !esp
          ? h('section', { class: 'panel' },
              h('p', { class: 'nota', style: 'margin-bottom:10px' }, conIA
                ? `Para charlar con ${n.nombre || 'tu planta'}, primero reconozcamos su especie.`
                : `Decime qué planta cuida ${n.nombre || 'tu Rooti'}: con la especie sabe qué necesita.`),
              h('button', { class: 'boton azul ancho', type: 'button', onClick: () => alCambiarEspecie(n.id) },
                icono(conIA ? 'camara' : 'hoja', 20), conIA ? 'Sacarle una foto' : 'Elegir la especie'))
          : null,

    panelMimos,

    h('section', { class: 'panel' },
      h('h3', { class: 'panel-tit' }, 'Ahora'),
      medidores(n, esp)),


    h('section', { class: 'panel' },
      h('div', { class: 'vinculo-cab' }, h('h3', { class: 'panel-tit', style: 'margin:0' }, 'Últimas horas'), selector),
      zonaGrafico),

    conIA
      ? h('section', { class: 'panel' },
          h('button', { class: 'boton azul ancho', type: 'button', onClick: () => alDiagnosticar(n.id) },
            icono('lupa', 20), 'Diagnosticar con una foto'),
          h('p', { class: 'nota', style: 'margin-top:10px' },
            'Sirve cuando los números están bien y la planta igual se ve mal: hongos, plagas o falta de nutrientes no mueven ningún sensor.'))
      : null,

    /* De acá para abajo, lo que se toca una vez y después se deja: cada cosa
       en su sección plegada, con lo importante escrito al costado del título.
       La ficha pasó de cuatro pantallas de scroll a una. */
    seccion('planta-especie', 'La planta', [
      esp
        ? h('p', {}, h('b', {}, esp.nombre),
            esp.cientifico && esp.cientifico.toLowerCase() !== esp.nombre.toLowerCase()
              ? h('span', { class: 'nota' }, ` · ${esp.cientifico}`)
              : null)
        : h('p', { class: 'nota' }, 'Sin identificar.'),
      n.ficha
        ? h('dl', { class: 'cuidados' },
            Object.entries(n.ficha.cuidados || {})
              .sort(([a], [b]) => Object.keys(CUIDADO_ES).indexOf(a) - Object.keys(CUIDADO_ES).indexOf(b))
              .map(([k, v]) => h('div', { class: 'cuidado' }, h('dt', {}, CUIDADO_ES[k] || k), h('dd', {}, v))))
        : null,
      n.ficha?.fuente === 'ia'
        ? h('p', { class: 'nota' }, 'Los rangos son del catálogo de ROOTLAB; el resto lo sumó la IA al reconocerla.')
        : null,
      h('div', { class: 'fila-botones' },
        h('button', { class: 'boton chico', type: 'button', onClick: () => alCambiarEspecie(n.id) },
          icono(conIA ? 'camara' : 'hoja', 16), esp ? 'Cambiar la especie' : conIA ? 'Identificar' : 'Elegir la especie')),
    ], { abierta: !esp, resumen: esp ? (n.ficha ? `cuidados · ${n.ficha.dificultad}` : 'sin cuidados') : 'sin identificar' }),

    n.revelado ? panelSensor(ctx, n) : null,

    seccion('planta-vinculo', 'Vínculo', [
      h('div', { class: 'vinculo-cab' },
        h('span', { class: 'etapa-grande' }, ETAPA_ES[etapa] || etapa),
        h('span', { class: 'vinculo-dias' }, `${sanos} días sanos`)),
      progreso(progresoEtapa(sanos)),
      h('dl', { class: 'datos' },
        h('div', {}, h('dt', {}, 'Racha'), h('dd', {}, `${n.bond?.racha ?? 0} días`)),
        h('div', {}, h('dt', {}, 'Mejor racha'), h('dd', {}, `${n.bond?.mejor_racha ?? 0} días`))),
    ], { resumen: `${ETAPA_ES[etapa] || etapa} · ${sanos} d` }),

    n.revelado
      ? seccion('planta-recuerdos', 'Recuerdos', [
          h('p', { class: 'nota' }, 'Verla crecer foto a foto, y una hoja para imprimir con quién es y cómo estuvo.'),
          h('div', { class: 'fila-botones' },
            h('button', { class: 'boton chico', type: 'button', onClick: () => irA('album', n.id) }, icono('camara', 16), 'Álbum de fotos'),
            h('button', { class: 'boton chico', type: 'button', onClick: () => irA('pasaporte', n.id) }, icono('hoja', 16), 'Pasaporte botánico')),
        ], { resumen: 'álbum y pasaporte' })
      : null,

    n.revelado ? panelCuidador(ctx, n) : null,

    n.revelado ? panelBotanica(ctx, n, esp) : null,

    seccion('planta-aparato', 'Tu Rooti', [
      h('div', { class: 'fila-ajuste' },
        h('label', { for: siempre.id }, h('b', {}, 'Pantalla siempre encendida'),
          h('span', {}, 'A batería se apaga a los 20 s y se prende al tocarla. Siempre encendida dura días, no meses.')),
        h('span', { class: 'interruptor' }, siempre, h('i'))),
      h('div', { class: 'fila-ajuste', style: 'flex-direction:column;align-items:stretch' },
        h('label', { for: brillo.id }, h('b', {}, 'Brillo')), brillo),
      n.revelado
        ? h('div', {},
            h('button', { class: 'boton ancho', type: 'button', onClick: () => irA('desk', n.id) },
              icono('pantalla', 20), 'Modo escritorio'),
            h('p', { class: 'nota', style: 'margin-top:10px' },
              'La cara sola, a pantalla completa y sin que se apague: para un teléfono apoyado en el escritorio. Se deja acariciar.'))
        : null,
      h('dl', { class: 'datos' },
        h('div', {}, h('dt', {}, 'Energía'), h('dd', {}, energiaDe(n.tel, bat))),
        h('div', {}, h('dt', {}, 'Wifi'), h('dd', {}, n.nodo?.rssi ? `${n.nodo.rssi} dBm` : '—')),
        h('div', {}, h('dt', {}, 'Rooti'), h('dd', {}, modelo ? `${modelo.nombre}${n.revelado ? ` · ${modelo.pieles?.find((p) => p.rareza === n.rareza)?.nombre || ''}` : ''}` : '—')),
        h('div', { class: 'dato-ancho' }, h('dt', {}, 'Firmware'), h('dd', {}, textoFirmware(n.nodo)))),
      h('button', { class: 'boton peligro ancho', type: 'button', onClick: desvincular }, icono('basura', 18), 'Desvincular'),
    ], { resumen: energiaDe(n.tel, bat) }),
  );

  return cont;
}
