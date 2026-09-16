/* app.js — el armazón: rutas, estado, alta y refresco.
 *
 * Sin build: ES modules directos. Desplegar es copiar la carpeta, y no hay
 * un node_modules del lado del cliente que se pudra entre versiones.
 *
 * DOS PUERTAS DE ENTRADA
 *
 *   /v/<CÓDIGO>   lo que abre el QR de la maceta. Arranca (o retoma) el alta
 *                 de ese ROOTKIT. Si ya es tuyo, va directo a su planta.
 *   /#hoy ...     la app de todos los días.
 *
 * El estado del alta se guarda en el teléfono en cada paso: salir a los
 * ajustes de wifi y volver no pierde nada.
 *
 * SIN SESIÓN
 *
 * Sin cuenta sólo se ve el alta (que tiene su propio paso de cuenta), la
 * carga de un código y la pantalla de entrar. Todo lo demás pide entrar.
 */
import { $, h, render, icono } from './lib/ui.mjs';
import { api, ErrorApi, tokenGuardado, guardarToken, borrarToken } from './lib/api.mjs';
import { tareasDelDia, contarEstados } from './lib/tareas.mjs';
import { actualizarRacha } from './lib/gamificacion.mjs';
import { cargarCaras } from './lib/caras.mjs';
import { enBase, rutaSinBase } from './lib/base.mjs';
import { vistaAlta, PASOS, saltear } from './vistas/alta.mjs';
import { vistaHoy } from './vistas/hoy.mjs';
import { vistaPlantas, vistaDetalle } from './vistas/plantas.mjs';
import { vistaDiagnostico, vistaEspecie, vistaAgregar } from './vistas/escaner.mjs';
import { vistaColeccion } from './vistas/coleccion.mjs';
import { vistaAjustes } from './vistas/ajustes.mjs';
import { vistaEntrar } from './vistas/cuenta.mjs';
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

/* -------------------------------------------------------------- rutas --- */
const normalizar = (c) => String(c || '').toUpperCase().replace(/[-\s]/g, '')
  .replace(/O/g, '0').replace(/[IL]/g, '1').replace(/U/g, 'V');

function ruta() {
  const m = rutaSinBase().match(/^\/v\/([^/]+)\/?$/i);
  if (m) return { codigo: normalizar(decodeURIComponent(m[1])) };
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
    app.cuenta = app.estado.cuenta || app.cuenta;
    app.sinRed = false;
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

/* Recién entró o creó la cuenta. Si estaba en medio del alta, se queda ahí. */
async function alEntrar(r, { quedarse = false } = {}) {
  guardarToken(r.token);
  app.cuenta = r.cuenta;
  await recargar();
  if (!quedarse) {
    avisar(`Hola${app.cuenta?.nombre ? `, ${app.cuenta.nombre}` : ''}.`);
    if (ruta().vista === 'entrar' || !location.hash) irA('hoy');
    else pintar();
  }
}

async function salir() {
  await desactivarAvisos(api).catch(() => {});
  await api('/api/cuenta/salir', { metodo: 'POST' }).catch(() => {});
  cerrarSesionLocal();
  app.alta = null;
  escribir(LS.alta, null);
  history.replaceState(null, '', enBase('#entrar'));
  pintar();
}

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

/* Ubica el alta según lo que ya pasó en la nube: si el ROOTKIT ya es tuyo,
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
      const modelo = app.estado?.coleccion?.catalogo.find((m) => m.id === n?.modelo);
      guardarAlta({ plantaId: v.planta, persona: n?.modelo || null, fondo: modelo?.fondo, nombre: n?.nombre || null });
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
  const modelo = app.estado?.coleccion?.catalogo.find((m) => m.id === n.modelo);
  guardarAlta({
    codigo: app.alta?.codigo || '', plantaId: n.id, persona: n.modelo, fondo: modelo?.fondo, nombre: n.nombre,
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
  };
}

const PESTANA = {
  hoy: 'hoy', plantas: 'plantas', planta: 'plantas', diagnostico: 'plantas', especie: 'plantas',
  coleccion: 'coleccion', ajustes: 'ajustes',
};
const SIN_TABS = new Set(['alta', 'agregar', 'especie', 'entrar']);
/* Lo único que se ve sin sesión, además del alta. */
const PUBLICAS = new Set(['agregar', 'entrar']);

function pintar() {
  const r = ruta();
  const ctx = contexto();
  let vista;
  let sinTabs = false;

  if (r.codigo || (r.vista === 'alta' && app.alta)) {
    sinTabs = true;
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
      case 'plantas': vista = vistaPlantas(ctx); break;
      case 'planta': vista = vistaDetalle(ctx); break;
      case 'diagnostico': vista = vistaDiagnostico(ctx); break;
      case 'especie': vista = vistaEspecie(ctx); break;
      case 'coleccion': vista = vistaColeccion(ctx); break;
      case 'ajustes': vista = vistaAjustes(ctx); break;
      case 'agregar': vista = vistaAgregar(ctx); break;
      default: vista = vistaHoy(ctx);
    }
  }

  document.body.classList.toggle('sin-tabs', sinTabs);
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

  render($('#barra-der'),
    app.sinRed ? h('span', { class: 'pildora sinred' }, icono('antena', 18), 'Sin conexión') : null,
    !sinTabs && app.racha.dias > 0
      ? h('span', { class: 'pildora fuego', title: 'Días seguidos sin urgencias' }, icono('llama', 18), String(app.racha.dias))
      : null);

  app.firma = JSON.stringify(app.estado?.nodes || []);
}

/* Refresco: sólo se repinta si cambió algo, para no pisar un formulario ni
   reiniciar un gráfico cada quince segundos. */
async function refrescar() {
  const r = ruta();
  if (document.hidden || r.codigo || SIN_TABS.has(r.vista) || r.vista === 'diagnostico') return;
  const antes = app.firma;
  const sinRedAntes = app.sinRed;
  await recargar();
  if (JSON.stringify(app.estado?.nodes || []) !== antes || app.sinRed !== sinRedAntes) pintar();
}

/* -------------------------------------------------------------- inicio --- */
async function inicio() {
  for (const b of document.querySelectorAll('.tab')) {
    b.addEventListener('click', () => irA(b.dataset.vista));
  }
  window.addEventListener('hashchange', pintar);
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

  app.config = await api('/api/config').catch(() => null);
  if (tokenGuardado()) {
    try {
      app.cuenta = await api('/api/cuenta');
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
