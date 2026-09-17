/* app.js — el armazón: rutas, estado, alta y refresco.
 *
 * Sin build: ES modules directos. Desplegar es copiar la carpeta, y no hay
 * un node_modules del lado del cliente que se pudra entre versiones.
 *
 * DOS PUERTAS DE ENTRADA
 *
 *   /v/<CÓDIGO>   lo que abre el QR de la maceta. Arranca (o retoma) el alta
 *                 de ese Rooti. Si ya es tuyo, va directo a su planta.
 *   /desk/<id>    el modo escritorio: la cara de esa planta a pantalla
 *                 completa (también #desk/<id>).
 *   /sitter/<t>   lo que ve el cuidador: sin cuenta, la cara de la planta,
 *                 qué necesita y el botón "ya regué".
 *   /#hoy ...     la app de todos los días.
 *
 * El estado del alta se guarda en el teléfono en cada paso: salir a los
 * ajustes de wifi y volver no pierde nada.
 *
 * SIN SESIÓN
 *
 * Sin cuenta sólo se ve el alta (que tiene su propio paso de cuenta), la
 * carga de un código y la pantalla de entrar. Todo lo demás pide entrar.
 *
 * LOCAL PRIMERO
 *
 * Con sesión, la app pinta lo último que vio (lib/almacen.mjs) antes de
 * tocar la red, y después se pone al día. Sin red muestra eso mismo con la
 * píldora "Sin conexión", y los cambios que se hagan esperan en una cola
 * (lib/cola.mjs) que sale sola cuando vuelve la conexión.
 */
import { $, h, render, icono } from './lib/ui.mjs';
import {
  api, ErrorApi, tokenGuardado, guardarToken, borrarToken, desdeCache, guardado, colaPendiente, alCambiarCola,
  contarCola, sincronizar,
} from './lib/api.mjs';
import { aplicarCola } from './lib/cola.mjs';
import { almacen } from './lib/almacen.mjs';
import { tareasDelDia, contarEstados } from './lib/tareas.mjs';
import { actualizarRacha } from './lib/gamificacion.mjs';
import { firmaTablero } from './lib/model.mjs';
import { cargarCaras } from './lib/caras.mjs';
import { horaDePrueba, fijarHoraDePrueba, alCambiarHora } from './lib/reloj.mjs';
import { enBase, rutaSinBase } from './lib/base.mjs';
import { vistaAlta, PASOS, saltear } from './vistas/alta.mjs';
import { vistaHoy } from './vistas/hoy.mjs';
import { vistaPlantas, vistaDetalle } from './vistas/plantas.mjs';
import { vistaDiagnostico, vistaEspecie, vistaAgregar } from './vistas/escaner.mjs';
import { vistaColeccion } from './vistas/coleccion.mjs';
import { vistaAjustes } from './vistas/ajustes.mjs';
import { vistaEntrar, vistaRestablecer, vistaVerificar } from './vistas/cuenta.mjs';
import { vistaChat } from './vistas/chat.mjs';
import { vistaDesk } from './vistas/desk.mjs';
import { vistaSitter } from './vistas/sitter.mjs';
import { vistaAlbum } from './vistas/album.mjs';
import { vistaPasaporte } from './vistas/pasaporte.mjs';
import { vistaInvernadero } from './vistas/invernadero.mjs';
import { aplicarPaleta, vigilarNoche } from './lib/tema.mjs';
import { PALETA_POR_DEFECTO } from './lib/paletas.mjs';
import { desactivarAvisos } from './lib/dispositivo.mjs';

const REFRESCO_MS = 15000;
const LS = { hechas: 'rootkit:hechas', racha: 'rootkit:racha', alta: 'rootkit:alta' };

const leer = (k, def) => { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch { return def; } };
const escribir = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* privado */ } };

const app = {
  cuenta: null,
  estado: null,
  config: null,
  sinRed: false,
  alta: leer(LS.alta, null),
  hechas: leer(LS.hechas, {}),
  racha: leer(LS.racha, { dias: 0, mejor: 0, ultimo: null }),
  firma: '',
};

/* ------------------------------------------------------------- avisos --- */
function avisar(texto, esError = false) {
  const el = $('#aviso');
  el.textContent = texto;
  el.classList.toggle('error', esError);
  el.hidden = false;
  clearTimeout(avisar.t);
  avisar.t = setTimeout(() => { el.hidden = true; }, 4200);
}

/* ----------------------------------------------------------- insignia --- */
/* El número en el ícono de la app instalada (Badging API): las tareas de
   hoy. Sin cuenta o sin tareas, se borra. Donde no existe, no pasa nada. */
function insignia(n) {
  if (typeof navigator.setAppBadge !== 'function') return;
  (n > 0 && app.cuenta ? navigator.setAppBadge(n) : navigator.clearAppBadge()).catch(() => {});
}

/* Los atajos del ícono (manifest: Regar, Ver cámara, Charla) llegan sin
   planta: se resuelven a la primera que sirva. */
function atajo(vista) {
  const nodos = app.estado?.nodes || [];
  if (vista === 'camara') {
    const p = nodos.find((n) => n.revelado) || nodos[0];
    return p ? `diagnostico/${p.id}` : 'agregar';
  }
  if (vista === 'charla') {
    const p = nodos.find((n) => n.chat) || nodos.find((n) => n.revelado) || nodos[0];
    return p ? (p.chat ? `chat/${p.id}` : `planta/${p.id}`) : 'agregar';
  }
  return 'hoy';
}

/* -------------------------------------------------------------- rutas --- */
const normalizar = (c) => String(c || '').toUpperCase().replace(/[-\s]/g, '')
  .replace(/O/g, '0').replace(/[IL]/g, '1').replace(/U/g, 'V');

function ruta() {
  const m = rutaSinBase().match(/^\/v\/([^/]+)\/?$/i);
  if (m) return { codigo: normalizar(decodeURIComponent(m[1])) };
  const d = rutaSinBase().match(/^\/(desk|sitter)\/([^/]+)\/?$/i);
  if (d) return { vista: d[1].toLowerCase(), id: decodeURIComponent(d[2]) };
  const [vista, id] = location.hash.replace(/^#/, '').split('/');
  return { vista: vista || 'hoy', id: id || null };
}

function irA(vista, id = null) {
  const destino = enBase(`#${id ? `${vista}/${id}` : vista}`);
  if (rutaSinBase() !== '/') {
    history.pushState(null, '', destino);
    pintar();
  } else {
    location.hash = id ? `${vista}/${id}` : vista;
  }
  window.scrollTo(0, 0);
}

/* -------------------------------------------------------------- datos --- */
async function recargar() {
  if (!app.cuenta) {
    app.estado = null;
    return;
  }
  try {
    app.estado = await api('/api/estado');
    /* Sin red, lo guardado; con los cambios encolados encima, para que la
       pantalla no desmienta lo que la persona acaba de hacer. */
    app.sinRed = desdeCache();
    if (app.sinRed) app.estado = aplicarCola(app.estado, (await almacen().leer('cola'))?.valor || []);
    app.cuenta = app.estado.cuenta || app.cuenta;
    /* La paleta es de la cuenta: si se cambió en otro teléfono, llega acá. */
    aplicarPaleta(app.cuenta?.paleta);
    const hoy = new Date().toISOString().slice(0, 10);
    const c = contarEstados(app.estado.nodes);
    app.racha = actualizarRacha(app.racha, c.urgente > 0, hoy);
    escribir(LS.racha, app.racha);
  } catch (e) {
    app.sinRed = !(e instanceof ErrorApi) || e.estado === 0;
    if (e instanceof ErrorApi && e.estado === 401) cerrarSesionLocal();
  }
}

function hacerTarea(t) {
  app.hechas = { ...app.hechas, [t.id]: Date.now() };
  escribir(LS.hechas, app.hechas);
  avisar('Anotado. Cuando el sensor lo confirme, desaparece sola.');
  pintar();
}

/* ------------------------------------------------------------- sesión --- */
function cerrarSesionLocal() {
  borrarToken();
  app.cuenta = null;
  app.estado = null;
}

const VISTAS_DE_CUENTA = new Set(['entrar', 'clave', 'verificar']);

/* Recién entró o creó la cuenta. Si estaba en medio del alta, se queda ahí. */
async function alEntrar(r, { quedarse = false } = {}) {
  guardarToken(r.token);
  app.cuenta = r.cuenta;
  aplicarPaleta(app.cuenta?.paleta);
  await recargar();
  if (!quedarse) {
    avisar(`Hola${app.cuenta?.nombre ? `, ${app.cuenta.nombre}` : ''}.`);
    if (VISTAS_DE_CUENTA.has(ruta().vista) || !location.hash) irA('hoy');
    else pintar();
  }
}

async function salir() {
  await desactivarAvisos(api).catch(() => {});
  await api('/api/cuenta/salir', { metodo: 'POST' }).catch(() => {});
  cerrarSesionLocal();
  app.alta = null;
  escribir(LS.alta, null);
  aplicarPaleta(PALETA_POR_DEFECTO);
  history.replaceState(null, '', enBase('#entrar'));
  pintar();
}

/* ----------------------------------------------------------- métricas --- */
/* Contadores anónimos (server/api.mjs, POST /api/evento): cuántos llegan a
   cada paso del alta y cuánto se usa cada pantalla. Ni cuenta ni planta; si
   falla o no hay red, no pasa nada. Cada evento, una vez por sesión de la app. */
const contados = new Set();
function contar(evento) {
  if (contados.has(evento)) return;
  contados.add(evento);
  fetch(enBase('api/evento'), {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ evento }), keepalive: true,
  }).catch(() => {});
}
const VISTAS_CONTADAS = new Set(['pasaporte', 'album', 'desk', 'invernadero', 'coleccion', 'chat', 'diagnostico', 'sitter']);

/* --------------------------------------------------------------- alta --- */
function guardarAlta(cambios) {
  app.alta = { ...(app.alta || {}), ...cambios };
  escribir(LS.alta, app.alta);
}

function irAPaso(paso) {
  guardarAlta({ paso });
  window.scrollTo(0, 0);
  pintar();
}

function siguientePaso() {
  let i = PASOS.indexOf(app.alta?.paso || 'hola') + 1;
  while (i < PASOS.length - 1 && saltear(PASOS[i], { cuenta: app.cuenta })) i += 1;
  irAPaso(PASOS[Math.min(i, PASOS.length - 1)]);
}

async function terminarAlta(plantaId) {
  app.alta = null;
  escribir(LS.alta, null);
  $('#manifest').href = enBase('manifest.webmanifest');
  await recargar();
  history.replaceState(null, '', enBase(plantaId ? `#planta/${plantaId}` : '#hoy'));
  pintar();
}

/* Ubica el alta según lo que ya pasó en la nube: si el Rooti ya es tuyo,
   no tiene sentido volver a pedir el wifi. */
async function entrarConCodigo(codigo) {
  if (!/^[0-9A-Z]{8}$/.test(codigo)) {
    history.replaceState(null, '', enBase('#agregar'));
    avisar('Ese código no es válido.', true);
    return;
  }
  $('#manifest').href = enBase(`manifest.webmanifest?codigo=${codigo}`);
  if (!app.alta || app.alta.codigo !== codigo) guardarAlta({ codigo, paso: 'hola', plantaId: null, persona: null, nombre: null });

  try {
    const v = await api(`/api/vinculo/${codigo}`);
    if (v.mio && v.planta) {
      await recargar();
      const n = app.estado?.nodes.find((x) => x.id === v.planta);
      guardarAlta({ plantaId: v.planta, persona: n?.modelo || null, rareza: n?.rareza || null, nombre: n?.nombre || null });
      const antes = PASOS.indexOf(app.alta.paso) < PASOS.indexOf('cofre');
      if (n && !n.revelado && antes) guardarAlta({ paso: 'cofre' });
      else if (n && n.revelado && !n.nombre && antes) guardarAlta({ paso: 'nombre' });
      else if (n && n.revelado && n.nombre && !n.especie && antes) guardarAlta({ paso: 'foto' });
      else if (n && n.revelado && n.nombre && n.especie && app.alta.paso !== 'listo') {
        await terminarAlta(v.planta);
      }
    }
  } catch { /* sin red: se sigue con lo guardado */ }
}

function retomarAlta(n) {
  guardarAlta({
    codigo: app.alta?.codigo || '', plantaId: n.id, persona: n.modelo, rareza: n.rareza || null, nombre: n.nombre,
    paso: !n.revelado ? 'cofre' : !n.nombre ? 'nombre' : 'foto',
  });
  irA('alta');
}

/* ------------------------------------------------------------- pintar --- */
function contexto() {
  const r = ruta();
  return {
    cuenta: app.cuenta,
    estado: app.estado,
    especies: app.estado?.especies || [],
    coleccion: app.estado?.coleccion || null,
    config: app.config,
    hechas: app.hechas,
    racha: app.racha,
    plantaId: r.id,
    alta: app.alta,
    api: (rutaApi, op) => api(rutaApi, op),
    avisar,
    irA,
    recargar: async () => { await recargar(); pintar(); },
    alHacer: hacerTarea,
    alAbrir: (id) => irA('planta', id),
    alDiagnosticar: (id) => irA('diagnostico', id),
    alCambiarEspecie: (id) => irA('especie', id),
    alRetomarAlta: retomarAlta,
    alTarea: (t) => {
      const n = app.estado?.nodes.find((x) => x.id === t.plantaId);
      if (t.tipo === 'cofre' && n) retomarAlta(n);
      else if (t.tipo === 'especie') irA('especie', t.plantaId);
      else irA('planta', t.plantaId);
    },
    alCodigo: (c) => {
      history.pushState(null, '', enBase(`v/${c}`));
      entrarConCodigo(c).then(pintar);
    },
    volver: () => (history.length > 1 ? history.back() : irA('hoy')),
    siguiente: siguientePaso,
    ir: irAPaso,
    guardarAlta,
    terminar: terminarAlta,
    alEntrar,
    salir,
    cerrarSesionLocal,
    alChat: (id) => irA('chat', id),
    repintar: () => pintar(),
    contar,
    alVerificar: () => { if (app.cuenta) recargar(); },
    /* Pinta la app con una paleta, con el círculo que crece desde `origen`. */
    pintarApp: (paleta, origen = null) => aplicarPaleta(paleta, { animar: true, origen }),
  };
}

const PESTANA = {
  hoy: 'hoy', plantas: 'plantas', planta: 'plantas', diagnostico: 'plantas', especie: 'plantas', chat: 'plantas',
  desk: 'plantas', album: 'plantas', pasaporte: 'plantas', invernadero: 'hoy',
  coleccion: 'coleccion', ajustes: 'ajustes',
};
const SIN_TABS = new Set(['alta', 'agregar', 'especie', 'entrar', 'clave', 'verificar', 'desk', 'sitter', 'pasaporte']);
/* Lo único que se ve sin sesión, además del alta. */
const PUBLICAS = new Set(['agregar', 'entrar', 'clave', 'verificar', 'sitter']);

function pintar() {
  const r = ruta();
  if (app.cuenta && (r.vista === 'camara' || r.vista === 'charla')) {
    history.replaceState(null, '', enBase(`#${atajo(r.vista)}`));
    pintar();
    return;
  }
  /* Un QR recién abierto arranca su alta aunque entrarConCodigo todavía no
     haya contestado (con la sesión abierta, la vista se pinta antes). */
  if (r.codigo && /^[0-9A-Z]{8}$/.test(r.codigo) && (!app.alta || app.alta.codigo !== r.codigo)) {
    guardarAlta({ codigo: r.codigo, paso: 'hola', plantaId: null, persona: null, rareza: null, nombre: null });
  }
  const ctx = contexto();
  let vista;
  let sinTabs = false;
  if (VISTAS_CONTADAS.has(r.vista)) contar(`vista:${r.vista}`);

  if (r.codigo || (r.vista === 'alta' && app.alta)) {
    sinTabs = true;
    contar(`alta:${app.alta?.paso || 'hola'}`);
    if (!app.cuenta && app.alta && PASOS.indexOf(app.alta.paso) > PASOS.indexOf('cuenta')) {
      guardarAlta({ paso: 'cuenta' });
    }
    vista = vistaAlta(ctx);
  } else if (!app.cuenta && !PUBLICAS.has(r.vista)) {
    sinTabs = true;
    vista = vistaEntrar(ctx);
  } else {
    sinTabs = SIN_TABS.has(r.vista);
    switch (r.vista) {
      case 'entrar': vista = app.cuenta ? vistaHoy(ctx) : vistaEntrar(ctx); break;
      case 'clave': vista = vistaRestablecer(ctx); break;
      case 'verificar': vista = vistaVerificar(ctx); break;
      case 'chat': vista = vistaChat(ctx); break;
      case 'desk': vista = vistaDesk(ctx); break;
      case 'sitter': vista = vistaSitter(ctx); break;
      case 'album': vista = vistaAlbum(ctx); break;
      case 'pasaporte': vista = vistaPasaporte(ctx); break;
      case 'invernadero': vista = vistaInvernadero(ctx); break;
      case 'plantas': vista = vistaPlantas(ctx); break;
      case 'planta': vista = vistaDetalle(ctx); break;
      case 'diagnostico':
        /* Sin una IA de verdad no hay diagnóstico: vuelve a la planta. */
        vista = app.config?.ia_visible === false ? vistaDetalle(ctx) : vistaDiagnostico(ctx);
        break;
      case 'especie': vista = vistaEspecie(ctx); break;
      case 'coleccion': vista = vistaColeccion(ctx); break;
      case 'ajustes': vista = vistaAjustes(ctx); break;
      case 'agregar': vista = vistaAgregar(ctx); break;
      default: vista = vistaHoy(ctx);
    }
  }

  document.body.classList.toggle('sin-tabs', sinTabs);
  document.body.classList.toggle('desk', Boolean(app.cuenta) && !r.codigo && r.vista === 'desk');
  render($('#vista'), vista);

  const activa = PESTANA[r.vista] || (r.codigo ? '' : 'hoy');
  for (const b of document.querySelectorAll('.tab')) {
    const suya = b.dataset.vista === activa;
    b.classList.toggle('activa', suya);
    if (suya) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  }

  const n = app.estado ? tareasDelDia(app.estado.nodes, app.estado.especies, app.hechas).length : 0;
  const globo = $('#globo-hoy');
  globo.textContent = n > 9 ? '9+' : String(n);
  globo.hidden = n === 0;
  insignia(n);

  render($('#barra-der'),
    app.sinRed ? h('span', { class: 'pildora sinred' }, icono('antena', 18), 'Sin conexión') : null,
    colaPendiente() > 0
      ? h('span', { class: 'pildora cola', title: 'Cambios hechos sin conexión: salen solos cuando vuelve la red' }, icono('reloj', 18), `${colaPendiente()} por mandar`)
      : null,
    !sinTabs && app.racha.dias > 0
      ? h('span', { class: 'pildora fuego', title: 'Días seguidos sin urgencias' }, icono('llama', 18), String(app.racha.dias))
      : null);

  app.firma = firmaTablero(app.estado?.nodes);
}

/* Refresco: sólo se repinta si cambió algo, para no pisar un formulario ni
   reiniciar un gráfico cada quince segundos. */
async function refrescar() {
  const r = ruta();
  /* La charla y el diagnóstico no se repintan solos: se perdería lo escrito.
     El modo escritorio sí: es la cara en vivo. */
  if (document.hidden || r.codigo || (SIN_TABS.has(r.vista) && r.vista !== 'desk') || ['diagnostico', 'chat', 'album', 'pasaporte'].includes(r.vista)) return;
  const antes = app.firma;
  const sinRedAntes = app.sinRed;
  await recargar();
  /* Tampoco en medio de un mimo (la caricia o la esponja se cortarían) ni de
     una calibración (se perdería el paso en el que está). */
  if (document.querySelector('.cuerpo.mimo, .esponja-capa:not([hidden]), .calibrar-crudo')) return;
  if (firmaTablero(app.estado?.nodes) !== antes || app.sinRed !== sinRedAntes) pintar();
}

/* -------------------------------------------------------------- inicio --- */
async function inicio() {
  for (const b of document.querySelectorAll('.tab')) {
    b.addEventListener('click', () => irA(b.dataset.vista));
  }
  /* Otra vista arranca desde arriba; la misma (un repintado) no se mueve. */
  let vistaPrevia = location.hash;
  window.addEventListener('hashchange', () => {
    if (location.hash !== vistaPrevia) window.scrollTo(0, 0);
    vistaPrevia = location.hash;
    pintar();
  });
  window.addEventListener('popstate', async () => {
    const r = ruta();
    if (r.codigo) await entrarConCodigo(r.codigo);
    pintar();
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refrescar(); });

  cargarCaras();
  if (window.isSecureContext && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register(enBase('sw.js'), { scope: enBase('') }).catch(() => {});
  }

  /* Local primero: lo último que se vio, pintado antes de tocar la red. */
  if (tokenGuardado() && !ruta().codigo) {
    const [cta, est, cfg] = await Promise.all([guardado('/api/cuenta'), guardado('/api/estado'), guardado('/api/config')]);
    /* La cuenta viaja también dentro del estado: alcanza con haber visto
       el tablero una vez. */
    const cuentaGuardada = cta?.datos || est?.datos?.cuenta || null;
    if (cuentaGuardada && est?.datos) {
      app.cuenta = cuentaGuardada;
      app.estado = est.datos;
      app.config = cfg?.datos || null;
      app.sinRed = navigator.onLine === false;
      aplicarPaleta(app.cuenta?.paleta);
      pintar();
    }
  }
  contarCola();
  alCambiarCola(() => pintar());
  /* La hora de prueba del emulador (lib/reloj.mjs): se ve y se saca desde acá. */
  const pildoraHora = () => {
    document.querySelector('.pildora-demo')?.remove();
    const hora = horaDePrueba();
    if (hora === null) return;
    document.body.append(h('button', {
      class: 'pildora-demo', type: 'button', title: 'La puso el emulador. Tocá para volver a la hora real.',
      onClick: () => { fijarHoraDePrueba(null); pildoraHora(); pintar(); },
    }, `Hora de prueba: ${hora} h ✕`));
  };
  pildoraHora();
  alCambiarHora(() => pildoraHora());
  /* De día y de noche (lib/tema.mjs): se vuelve a mirar cada minuto. */
  vigilarNoche();
  window.addEventListener('online', async () => { await sincronizar(); await recargar(); pintar(); });

  app.config = await api('/api/config').catch(() => app.config);
  if (tokenGuardado()) {
    try {
      app.cuenta = await api('/api/cuenta');
      aplicarPaleta(app.cuenta?.paleta);
    } catch (e) {
      if (e.estado === 401) cerrarSesionLocal();
      else app.sinRed = true;
    }
  }

  const r = ruta();
  if (r.codigo) {
    await entrarConCodigo(r.codigo);
  } else if (app.alta?.codigo && !location.hash && PASOS.indexOf(app.alta.paso) < PASOS.indexOf('listo')) {
    /* Un alta a medio terminar tiene prioridad sobre el tablero vacío. */
    history.replaceState(null, '', enBase(`v/${app.alta.codigo}`));
    await entrarConCodigo(app.alta.codigo);
  }
  if (!app.estado) await recargar();
  pintar();
  setInterval(refrescar, REFRESCO_MS);
}

inicio();
