/* admin.mjs — la trastienda: el panel de quien hace el producto.
 *
 * QUÉ CONTESTA ESTA PANTALLA
 *
 *   ¿Cuántos ROOTKIT hay en la calle y cuántos siguen hablando?
 *   ¿Qué firmware corre cada uno, y cuántos se quedaron atrás?
 *   ¿Están midiendo bien, o hay sensores que no responden?
 *   ¿Qué pantallas de la app usa la gente, y dónde abandona el alta?
 *   ¿Qué habría que mejorar, y qué de eso rinde más de lo que cuesta?
 *
 * QUÉ NO MUESTRA, A PROPÓSITO
 *
 * Nada de ninguna cuenta: ni emails, ni nombres de plantas, ni charlas, ni
 * fotos. Todo lo que se ve acá es del aparato (que es nuestro hasta que lo
 * vendemos) o un agregado. Se puede saber si el producto anda sin leerle la
 * casa a nadie, y esa línea es una decisión, no un olvido (docs/trastienda.md).
 *
 * CÓMO SE ENTRA
 *
 * Con el email: quien pueda entrar recibe un código de seis dígitos y con eso
 * el servidor devuelve un token de doce horas, que vive sólo en esta pestaña.
 * Queda además la clave del servidor como salida de emergencia, para cuando el
 * correo no anda. Ni la clave ni el código quedan guardados en el navegador.
 *
 * LAS CUENTAS
 *
 * La pantalla de cuentas es la única de todo el sistema que muestra emails.
 * Está para poder avisar de una actualización, ofrecer servicio técnico cuando
 * un aparato falla, y dar o sacar el rol de administración. No muestra plantas,
 * charlas ni fotos: eso sigue siendo de cada quien (docs/trastienda.md).
 */

const CLAVE_SESION = 'rootlab:trastienda';
const $ = (sel) => document.querySelector(sel);

/* ------------------------------------------------------------- pintar --- */
function h(tag, attrs = {}, ...hijos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  poner(el, hijos);
  return el;
}
function poner(el, hijos) {
  for (const hijo of hijos.flat(Infinity)) {
    if (hijo === null || hijo === undefined || hijo === false) continue;
    el.append(hijo instanceof Node ? hijo : document.createTextNode(String(hijo)));
  }
}
const render = (el, ...hijos) => { if (el) { el.replaceChildren(); poner(el, hijos); } };

const marca = (texto, color = 'gris') => h('span', { class: `marca ${color}` }, texto);
const tarjeta = (n, etiqueta, clase = '') => h('div', { class: `tarjeta ${clase}` }, h('b', {}, n), h('span', {}, etiqueta));
const panel = (titulo, ...cuerpo) => h('section', { class: 'panel' }, titulo ? h('h2', {}, titulo) : null, ...cuerpo);

const NUM = new Intl.NumberFormat('es-AR');
const num = (n) => NUM.format(Number(n) || 0);
const pct = (parte, total) => (total > 0 ? `${Math.round((parte / total) * 100)} %` : '—');
const fechaHora = (ms) => (ms ? new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(ms)) : '—');

/** "hace 3 min", como en la app. */
function hace(ms) {
  if (!ms) return 'nunca';
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 90) return 'recién';
  if (s < 5400) return `hace ${Math.round(s / 60)} min`;
  if (s < 172800) return `hace ${Math.round(s / 3600)} h`;
  return `hace ${Math.round(s / 86400)} días`;
}

function avisar(texto, esError = false) {
  const el = $('#aviso');
  el.textContent = texto;
  el.style.borderColor = esError ? 'var(--rojo)' : 'var(--borde)';
  el.hidden = false;
  clearTimeout(avisar.t);
  avisar.t = setTimeout(() => { el.hidden = true; }, 3600);
}

/* --------------------------------------------------------------- red --- */
const base = () => document.querySelector('base')?.getAttribute('href') || '/';
const leerToken = () => { try { return sessionStorage.getItem(CLAVE_SESION); } catch { return null; } };
const guardarToken = (t) => { try { if (t) sessionStorage.setItem(CLAVE_SESION, t); else sessionStorage.removeItem(CLAVE_SESION); } catch { /* privado */ } };

async function api(ruta, { metodo = 'GET', cuerpo } = {}) {
  const r = await fetch(`${base()}api/admin${ruta}`.replace(/([^:])\/\//g, '$1/'), {
    method: metodo,
    headers: {
      ...(cuerpo !== undefined ? { 'content-type': 'application/json' } : {}),
      authorization: `Bearer ${leerToken() || ''}`,
    },
    body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
  });
  if (r.status === 401) {
    guardarToken(null);
    puerta('La sesión venció. Volvé a entrar.');
    throw new Error('sin sesión');
  }
  if (r.status === 204) return null;
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(datos.error || `Error ${r.status}`);
  return datos;
}

/* ------------------------------------------------------------ estado --- */
const app = { vista: 'resumen', datos: {}, filtro: { area: '', estado: '' } };

/* ============================================================ RESUMEN === */
function vistaResumen() {
  const { estado, flota, lecturas, ideas } = app.datos;
  if (!estado) return panel(null, h('p', { class: 'nota' }, 'Cargando…'));
  const f = flota?.resumen || {};
  const nuevas = (ideas?.resumen?.por_estado || []).find((x) => x.estado === 'nueva')?.n || 0;

  return [
    panel('En la calle',
      h('div', { class: 'tarjetas' },
        tarjeta(num(f.de_fabrica), 'salidos de fábrica'),
        tarjeta(num(f.estrenados), 'estrenados por alguien', f.estrenados > 0 ? 'bien' : ''),
        tarjeta(num(f.activos), 'hablaron esta semana', 'bien'),
        tarjeta(num(f.callados), 'callados hace días', f.callados > 0 ? 'mal' : ''),
        tarjeta(num(f.deshabilitados), 'deshabilitados', f.deshabilitados > 0 ? 'atencion' : '')),
      h('p', { class: 'nota' },
        '"Estrenados" son los aparatos que alguien vinculó alguna vez: es lo más cerca que estamos de "vendidos" hasta que haya pedidos. '
        + (f.emuladores > 0 ? `Los ${num(f.emuladores)} emuladores del navegador no cuentan como producto.` : ''))),

    panel('La app',
      h('div', { class: 'tarjetas' },
        tarjeta(num(estado.cuentas), 'cuentas'),
        tarjeta(num(estado.plantas), 'plantas cuidándose'),
        tarjeta(num(estado.lecturas), 'lecturas guardadas'),
        tarjeta(num(lecturas?.total || 0), `lecturas en ${lecturas?.dias || 30} días`),
        tarjeta(estado.ia?.visible ? (estado.ia.proveedor === 'claude' ? 'Claude' : 'simulada') : 'apagada', 'la IA',
          estado.ia?.proveedor === 'claude' ? 'bien' : 'atencion'))),

    panel('Los sensores, en lo que va del mes', bloqueSensores(lecturas)),

    panel('El vivero',
      h('div', { class: 'tarjetas' },
        tarjeta(num(nuevas), 'ideas sin decidir', nuevas > 0 ? 'atencion' : ''),
        ...(ideas?.resumen?.por_area || []).map((a) => tarjeta(num(a.n), a.area))),
      h('p', { class: 'nota' }, 'Lo que proponen los agentes que miran el proyecto. ',
        h('a', { href: '#vivero', onClick: (e) => { e.preventDefault(); irA('vivero'); } }, 'Ver el vivero'))),

    panel('El servidor',
      h('div', { class: 'tabla-marco' }, tabla(
        ['', ''],
        [
          ['versión', estado.version],
          ['esquema de la base', String(estado.esquema)],
          ['confianza al primer uso', estado.tofu],
          ['gasto de IA hoy', `US$ ${(estado.ia?.gastado_dia_usd ?? 0).toFixed(2)} de ${(estado.ia?.tope_dia_usd ?? 0).toFixed(2)}`],
          ['gasto de IA este mes', `US$ ${(estado.ia?.gastado_mes_usd ?? 0).toFixed(2)} de ${(estado.ia?.tope_mes_usd ?? 0).toFixed(2)}`],
          ['vigía', estado.vigia?.alarma
          ? `⚠ ${estado.vigia.callados} de ${estado.vigia.activos} aparatos se callaron a la vez`
          : `sin novedad (${estado.vigia?.activos ?? 0} activos)`],
        ].map(([k, v]) => [k, v])))),
  ];
}

function bloqueSensores(l) {
  if (!l || !l.sensores?.n) return h('p', { class: 'nota' }, 'Todavía no hay lecturas en esta ventana.');
  const s = l.sensores;
  const fila = (etiqueta, malas) => {
    const p = malas / s.n;
    return [etiqueta, `${num(malas)} de ${num(s.n)}`, marca(pct(malas, s.n), p > 0.05 ? 'roja' : p > 0.01 ? 'ambar' : 'verde')];
  };
  return [
    h('div', { class: 'tabla-marco' }, tabla(['medida', 'lecturas sin dato', ''], [
      fila('tierra', s.sin_suelo),
      fila('temperatura', s.sin_temp),
      fila('humedad del aire', s.sin_hr),
      fila('luz', s.sin_lux),
      fila('capacitivo en un extremo', s.crudo_extremo),
      fila('celda por debajo de 3,4 V', s.bateria_baja),
    ])),
    h('p', { class: 'nota' },
      'Un sensor que no responde manda un hueco, no un cero. El capacitivo "en un extremo" (por debajo de 150 o arriba de 4000) '
      + 'es un sensor desconectado, en corto o sin sellar.'),
  ];
}

/* ============================================================== FLOTA === */
function vistaFlota() {
  const f = app.datos.flota;
  if (!f) return panel(null, h('p', { class: 'nota' }, 'Cargando…'));
  const grupo = (titulo, filas) => panel(titulo, h('div', { class: 'tabla-marco' }, tabla(
    ['', 'aparatos', 'vinculados', 'activos'],
    filas.map((r) => [r.valor, num(r.total), num(r.vinculados), num(r.activos)]),
    [false, true, true, true],
  )));

  return [
    h('div', { class: 'tarjetas' },
      tarjeta(num(f.resumen.total), 'aparatos conocidos'),
      tarjeta(num(f.resumen.de_fabrica), 'de fábrica'),
      tarjeta(num(f.resumen.vinculados), 'vinculados ahora'),
      tarjeta(num(f.resumen.activos), 'activos (7 días)', 'bien'),
      tarjeta(num(f.resumen.callados), 'callados (3 días)', f.resumen.callados ? 'mal' : '')),

    grupo('Por lote', f.por.lote),
    grupo('Por versión de firmware', f.por.fw),
    grupo('Por placa', f.por.placa),

    panel('Aparato por aparato',
      h('div', { class: 'tabla-marco' }, tabla(
        ['id', 'lote', 'placa', 'firmware', 'canal', 'origen', 'estado', 'lecturas', 'batería', 'wifi', 'visto'],
        f.aparatos.map((d) => [
          h('code', {}, d.id),
          d.lote || '—',
          d.placa || '—',
          h('span', {}, d.fw || '—', d.ota?.estado === 'fallo' ? marca(' falló la OTA', 'roja') : null),
          d.canal,
          marca(d.origen, d.origen === 'fabrica' ? 'verde' : d.origen === 'emulador' ? 'violeta' : 'gris'),
          d.deshabilitado ? marca('deshabilitado', 'roja')
            : d.callado ? marca('callado', 'roja')
              : d.vinculado ? marca('vinculado', 'verde') : marca('libre', 'gris'),
          num(d.lecturas),
          d.usb ? 'enchufado' : d.bat_mv ? `${(d.bat_mv / 1000).toFixed(2)} V` : '—',
          d.rssi ? `${d.rssi} dBm` : '—',
          hace(d.visto),
        ]),
        [false, false, false, false, false, false, false, true, true, true, false])),
      h('p', { class: 'nota' }, `Los ${f.aparatos.length} más vistos. "Callado" es un aparato vinculado que no habla hace más de tres días: o se quedó sin wifi, o sin batería, o se colgó.`)),
  ];
}

/* =========================================================== FIRMWARE === */
function vistaFirmware() {
  const { firmware, flota } = app.datos;
  if (!firmware) return panel(null, h('p', { class: 'nota' }, 'Cargando…'));
  const enLaCalle = new Map((flota?.por?.fw || []).map((r) => [r.valor, r]));

  return [
    panel('Lo que se firmó y publicó',
      firmware.firmware.length === 0
        ? h('p', { class: 'nota' }, 'Todavía no se publicó ningún firmware. Se publica con tools/publicar-firmware.mjs (docs/operacion.md).')
        : h('div', { class: 'tabla-marco' }, tabla(
          ['#', 'versión', 'placa', 'canal', 'tamaño', 'publicado', 'estado', 'en la calle', 'sha256'],
          firmware.firmware.map((f) => [
            String(f.id),
            f.version,
            f.placa,
            marca(f.canal, f.canal === 'estable' ? 'verde' : 'ambar'),
            `${Math.round(f.tamano / 1024)} KB`,
            fechaHora(f.publicado),
            f.retirado ? marca('retirado', 'gris') : marca('vigente', 'verde'),
            num(enLaCalle.get(f.version)?.total || 0),
            h('code', {}, f.sha256.slice(0, 12)),
          ]),
          [true, false, false, false, true, false, false, true, false]))),

    panel('Quién corre qué',
      h('div', { class: 'tabla-marco' }, tabla(
        ['versión', 'aparatos', 'vinculados', 'activos'],
        (flota?.por?.fw || []).map((r) => [r.valor, num(r.total), num(r.vinculados), num(r.activos)]),
        [false, true, true, true])),
      h('p', { class: 'nota' }, 'Cada firmware se firma con ECDSA P-256 antes de publicarse, y el aparato verifica la firma antes de instalarlo: ni tomando el servidor se le puede meter algo a una maceta.')),
  ];
}

/* ================================================================ USO === */
/* Los contadores son anónimos y por día: ni cuenta ni planta (docs/api.md). */
const PASOS_ALTA = ['hola', 'instalar', 'cuenta', 'avisos', 'wifi', 'vincular', 'cofre', 'nombre', 'foto', 'listo'];

function vistaUso() {
  const { metricas, lecturas } = app.datos;
  if (!metricas) return panel(null, h('p', { class: 'nota' }, 'Cargando…'));
  const t = metricas.totales || {};
  const dameAlta = (p) => t[`alta:${p}`] || 0;
  const primero = dameAlta('hola') || 0;

  const vistas = Object.entries(t).filter(([k]) => k.startsWith('vista:'))
    .map(([k, v]) => [k.slice(6), v]).sort((a, b) => b[1] - a[1]);
  const otros = Object.entries(t).filter(([k]) => !k.startsWith('vista:') && !k.startsWith('alta:'))
    .sort((a, b) => b[1] - a[1]);

  return [
    panel(`El alta, paso por paso (${metricas.dias} días)`,
      primero === 0
        ? h('p', { class: 'nota' }, 'Todavía nadie empezó un alta en esta ventana.')
        : [
          h('div', { class: 'tabla-marco' }, tabla(
            ['paso', 'llegaron', 'de los que empezaron', 'se cayeron acá'],
            PASOS_ALTA.map((p, i) => {
              const n = dameAlta(p);
              const antes = i === 0 ? n : dameAlta(PASOS_ALTA[i - 1]);
              const caida = antes > 0 ? Math.max(0, antes - n) : 0;
              return [p, num(n), pct(n, primero), caida > 0 ? marca(`−${num(caida)}`, caida / (antes || 1) > 0.25 ? 'roja' : 'ambar') : '—'];
            }),
            [false, true, true, false])),
          h('p', { class: 'nota' }, 'Dónde se cae el alta es lo primero que hay que arreglar: alguien con el Rooti en la mano que no llegó a estrenarlo.'),
        ]),

    panel('Qué pantallas se usan',
      vistas.length === 0
        ? h('p', { class: 'nota' }, 'Sin datos todavía.')
        : h('div', { class: 'tabla-marco' }, tabla(['pantalla', 'veces'], vistas.map(([k, v]) => [k, num(v)]), [false, true]))),

    panel('Lo demás que se cuenta',
      otros.length === 0
        ? h('p', { class: 'nota' }, 'Sin datos todavía.')
        : h('div', { class: 'tabla-marco' }, tabla(['contador', 'veces'], otros.map(([k, v]) => [k, num(v)]), [false, true]))),

    panel(`Lecturas por día (${lecturas?.dias || 30} días)`, bloqueLecturas(lecturas)),
  ];
}

function bloqueLecturas(l) {
  if (!l || !l.por_dia?.length) return h('p', { class: 'nota' }, 'Todavía no hay lecturas.');
  const max = Math.max(...l.por_dia.map((d) => d.n), 1);
  return [
    h('div', { class: 'barras' }, l.por_dia.map((d) => h('div', {
      style: `height:${Math.max(2, Math.round((d.n / max) * 100))}%`,
      title: `${d.dia}: ${num(d.n)} lecturas de ${num(d.aparatos)} aparatos`,
    }))),
    h('div', { class: 'barras-pie' },
      h('span', {}, l.por_dia[0]?.dia || ''),
      h('span', {}, `máximo ${num(max)} en un día`),
      h('span', {}, l.por_dia[l.por_dia.length - 1]?.dia || '')),
    h('p', { class: 'nota' },
      `Un ROOTKIT sano manda unas ${num(Math.round(l.esperadas_por_dia))} lecturas por día (una cada quince minutos). `
      + `${l.flojos > 0 ? `${num(l.flojos)} aparatos mandan menos de la mitad: mirá la flota.` : 'Ninguno se está quedando corto.'}`),
  ];
}

/* ============================================================ CUENTAS === */
function vistaCuentas() {
  const c = app.datos.cuentas;
  if (!c) return panel(null, h('p', { class: 'nota' }, 'Cargando…'));
  const admins = c.cuentas.filter((x) => x.rol === 'admin');
  const verificadas = c.cuentas.filter((x) => x.email_verificado).length;
  const conRooti = c.cuentas.filter((x) => x.plantas > 0).length;

  const cambiarRol = async (cta, rol) => {
    try {
      await api(`/cuentas/${cta.id}`, { metodo: 'PATCH', cuerpo: { rol } });
      avisar(rol === 'admin' ? `${cta.email} ahora administra.` : `${cta.email} ya no administra.`);
      await cargar('cuentas');
      pintar();
    } catch (e) { avisar(e.message, true); }
  };
  const borrar = async (cta) => {
    /* Dos preguntas, y la segunda pide escribir el email: se borran las
       plantas, las lecturas y las charlas de alguien, y no vuelven. */
    if (!confirm(`¿Borrar la cuenta de ${cta.email}?\n\nSe van sus ${cta.plantas_totales} plantas con todas sus lecturas y charlas. Sus Rooties quedan libres. No se puede deshacer.`)) return;
    const escrito = prompt(`Escribí el email para confirmar:\n${cta.email}`);
    if ((escrito || '').trim().toLowerCase() !== cta.email.toLowerCase()) {
      avisar('No coincide: no se borró nada.');
      return;
    }
    try {
      await api(`/cuentas/${cta.id}`, { metodo: 'DELETE' });
      avisar('Cuenta borrada.');
      await cargar('cuentas');
      pintar();
    } catch (e) { avisar(e.message, true); }
  };

  const emails = c.cuentas.map((x) => x.email).join(', ');

  return [
    h('div', { class: 'tarjetas' },
      tarjeta(num(c.cuentas.length), 'cuentas'),
      tarjeta(num(conRooti), 'con al menos un Rooti', conRooti > 0 ? 'bien' : ''),
      tarjeta(num(verificadas), 'con el email confirmado'),
      tarjeta(num(admins.length), 'administran')),

    panel('Las cuentas',
      h('div', { class: 'tabla-marco' }, tabla(
        ['email', 'nombre', 'rol', 'plantas', 'creada', 'última sesión', ''],
        c.cuentas.map((x) => [
          h('span', {}, x.email, x.email_verificado ? null : marca(' sin confirmar', 'ambar')),
          x.nombre || '—',
          x.rol === 'admin' ? marca(x.fijo ? 'admin (del entorno)' : 'admin', 'verde') : marca('persona', 'gris'),
          `${num(x.plantas)}${x.plantas_totales > x.plantas ? ` (${num(x.plantas_totales)})` : ''}`,
          fechaHora(x.creada),
          x.ultima_sesion ? hace(x.ultima_sesion) : 'nunca',
          h('div', { class: 'fila-botones' },
            x.fijo
              ? h('span', { class: 'nota-chica' }, 'del entorno')
              : x.rol === 'admin'
                ? h('button', { class: 'boton chico', type: 'button', onClick: () => cambiarRol(x, 'persona') }, 'Sacar admin')
                : h('button', { class: 'boton chico', type: 'button', onClick: () => cambiarRol(x, 'admin') }, 'Hacer admin'),
            x.fijo ? null : h('button', { class: 'boton chico peligro', type: 'button', onClick: () => borrar(x) }, 'Borrar')),
        ]),
        [false, false, false, true, false, false, false])),
      h('p', { class: 'nota' },
        'Es la única pantalla que muestra emails, y está para poder escribirles: avisarles de una '
        + 'actualización, o ofrecerles servicio técnico cuando su aparato deja de hablar. Las plantas, las charlas '
        + 'y las fotos no se ven desde acá.')),

    panel('Escribirles',
      h('p', { class: 'nota', style: 'margin-top:0' },
        'Todavía no hay una forma de mandar un aviso desde acá. Mientras tanto, las direcciones, '
        + 'para copiar y pegar en el correo (con copia oculta, que nadie vea la lista de los demás):'),
      h('textarea', { readonly: true, rows: '3', onFocus: (e) => e.target.select() }, emails),
      h('p', { class: 'nota-chica' },
        `${num(c.cuentas.length)} direcciones. Mandar avisos masivos desde el servidor necesita antes `
        + 'una forma de darse de baja, o los correos terminan en spam y la reputación del dominio se quema.')),

    panel('Quién entra a la trastienda',
      h('ul', { class: 'lista-simple' },
        (c.arranque || []).map((e) => h('li', {}, h('code', {}, e), ' — desde el entorno del servidor (', h('code', {}, 'ROOTLAB_ADMINS'), '), no se le puede sacar')),
        admins.filter((a) => !a.fijo).map((a) => h('li', {}, h('code', {}, a.email), ' — con el rol puesto desde acá'))),
      h('p', { class: 'nota' },
        'Cada uno entra pidiendo un código de seis dígitos a su email. Los del entorno son la red de '
        + 'seguridad: no se les puede sacar el rol desde el panel, así que la trastienda nunca queda sin nadie adentro.')),

    panel('Los agentes', bloqueAgentes()),
  ];
}

function bloqueAgentes() {
  const a = app.datos.agentes;
  if (!a) return h('p', { class: 'nota' }, 'Cargando…');
  const vivos = a.agentes.filter((x) => !x.revocado);

  const crear = async () => {
    const nombre = prompt('¿Cómo se llama el agente? (agente-infra, agente-ux…)');
    if (!nombre) return;
    try {
      /* El alcance se elige acá: RUTINAS.md lo llama "la única decisión real",
         y hasta ahora el panel creaba siempre `vivero`, así que un token de
         jardinero no se podía sacar de esta pantalla. */
      const informa = confirm('¿Este agente además manda el informe por correo?\n\nEl jardinero, sí. Los cinco que sólo miran, no.');
      const r = await api('/agentes', { metodo: 'POST', cuerpo: { nombre, alcance: informa ? 'jardinero' : 'vivero' } });
      await cargar('cuentas');
      pintar();
      /* El token se ve una vez: se muestra grande y se copia. */
      const caja = h('section', { class: 'panel' },
        h('h2', {}, `El token de ${r.nombre}`),
        h('p', { class: 'nota', style: 'margin-top:0' }, `Copialo ahora: no se vuelve a mostrar. Va en la variable ROOTLAB_ADMIN_CLAVE del agente. Lee cómo anda el producto y escribe en el vivero${r.alcance === 'jardinero' ? ', y manda el informe por correo' : ''}: nada de cuentas, datos de personas ni firmware.`),
        h('textarea', { readonly: true, rows: '2', onFocus: (e) => e.target.select() }, r.token),
        h('button', { class: 'boton', type: 'button', onClick: () => pintar() }, 'Listo, lo copié'));
      render($('#vista'), caja);
      caja.querySelector('textarea').select();
    } catch (e) { avisar(e.message, true); }
  };
  const revocar = async (x) => {
    if (!confirm(`¿Revocar el token de ${x.nombre}? El agente deja de poder escribir en el vivero.`)) return;
    try {
      await api(`/agentes/${x.id}`, { metodo: 'DELETE' });
      avisar('Revocado.');
      await cargar('cuentas');
      pintar();
    } catch (e) { avisar(e.message, true); }
  };

  return [
    h('p', { class: 'nota', style: 'margin-top:0' },
      'Los agentes que revisan el proyecto escriben en el vivero con su propio token, no con la clave de '
      + 'administración: lo único que pueden hacer es leer y proponer ideas. Si uno se filtra, se revoca y listo.'),
    vivos.length === 0
      ? h('p', { class: 'nota' }, 'Todavía no hay ninguno.')
      : h('div', { class: 'tabla-marco' }, tabla(
        ['nombre', 'alcance', 'creado', 'última vez', ''],
        vivos.map((x) => [
          x.nombre,
          marca(x.alcance, 'violeta'),
          fechaHora(x.creado),
          x.usado ? hace(x.usado) : 'nunca',
          h('button', { class: 'boton chico peligro', type: 'button', onClick: () => revocar(x) }, 'Revocar'),
        ]),
        [false, false, false, false, false])),
    h('div', { class: 'fila-botones' },
      h('button', { class: 'boton chico', type: 'button', onClick: crear }, 'Crear un token de agente')),
  ];
}

/* ============================================================= VIVERO === */
const AREA_ES = {
  infraestructura: 'Infraestructura', experiencia: 'Experiencia', firmware: 'Firmware',
  producto: 'Producto', seguridad: 'Seguridad',
};
const ESTADO_ES = { nueva: 'sin decidir', en_curso: 'en curso', plantada: 'plantada', descartada: 'descartada' };
const COLOR_ESTADO = { nueva: 'ambar', en_curso: 'violeta', plantada: 'verde', descartada: 'gris' };
const COLOR_IMPACTO = { alto: 'verde', medio: 'ambar', bajo: 'gris' };

function vistaVivero() {
  const v = app.datos.ideas;
  if (!v) return panel(null, h('p', { class: 'nota' }, 'Cargando…'));
  const porEstado = Object.fromEntries((v.resumen.por_estado || []).map((x) => [x.estado, x.n]));

  const sel = (id, etiqueta, opciones, valor, alCambiar) => h('label', { class: 'nota-chica' }, `${etiqueta} `,
    h('select', { id, onChange: (e) => alCambiar(e.target.value) },
      opciones.map(([val, txt]) => h('option', { value: val, selected: val === valor }, txt))));

  return [
    h('div', { class: 'tarjetas' },
      tarjeta(num(porEstado.nueva || 0), 'sin decidir', 'atencion'),
      tarjeta(num(porEstado.en_curso || 0), 'en curso'),
      tarjeta(num(porEstado.plantada || 0), 'plantadas', 'bien'),
      tarjeta(num(porEstado.descartada || 0), 'descartadas')),

    panel('El vivero',
      h('div', { class: 'vivero-filtros' },
        sel('f-area', 'Área:', [['', 'todas'], ...v.areas.map((a) => [a, AREA_ES[a] || a])], app.filtro.area,
          (x) => { app.filtro.area = x; cargar('ideas').then(pintar); }),
        sel('f-estado', 'Estado:', [['', 'todos'], ...Object.entries(ESTADO_ES)], app.filtro.estado,
          (x) => { app.filtro.estado = x; cargar('ideas').then(pintar); }),
        h('span', { class: 'nota-chica' }, `${v.ideas.length} ideas`),
        h('button', { class: 'boton chico', type: 'button', onClick: nuevaIdea }, 'Anotar una idea')),

      v.ideas.length === 0
        ? h('p', { class: 'nota' }, 'El vivero está vacío. Los agentes que miran el proyecto van a ir llenándolo; también se puede anotar una a mano.')
        : h('div', {}, v.ideas.map((i, n) => tarjetaIdea(i, n + 1)))),
  ];
}

function tarjetaIdea(i, n) {
  const mover = async (estado) => {
    try {
      await api(`/ideas/${i.id}`, { metodo: 'PATCH', cuerpo: { estado } });
      avisar(`Idea ${i.id}: ${ESTADO_ES[estado]}.`);
      await cargar('ideas');
      pintar();
    } catch (e) { avisar(e.message, true); }
  };
  return h('article', { class: `idea ${i.estado}` },
    h('div', { class: 'idea-n' }, `#${n}`),
    h('div', {},
      h('div', { class: 'idea-titulo' }, i.titulo),
      h('div', { class: 'idea-meta' },
        marca(AREA_ES[i.area] || i.area, 'violeta'),
        marca(`impacto ${i.impacto}`, COLOR_IMPACTO[i.impacto]),
        marca(`esfuerzo ${i.esfuerzo}`, i.esfuerzo === 'bajo' ? 'verde' : i.esfuerzo === 'medio' ? 'ambar' : 'roja'),
        marca(ESTADO_ES[i.estado], COLOR_ESTADO[i.estado]),
        i.vista > 1 ? marca(`propuesta ${i.vista} veces`, 'ambar') : null,
        h('span', { class: 'nota-chica' }, `${i.autor || 'a mano'} · ${hace(i.creada)}`)),
      i.detalle ? h('p', { class: 'idea-detalle' }, i.detalle) : null,
      i.evidencia ? h('p', { class: 'idea-evidencia' }, i.evidencia) : null,
      i.motivo ? h('p', { class: 'nota-chica' }, `Motivo: ${i.motivo}`) : null),
    h('div', { class: 'idea-acciones' },
      i.estado !== 'en_curso' ? h('button', { class: 'boton chico', type: 'button', onClick: () => mover('en_curso') }, 'En curso') : null,
      i.estado !== 'plantada' ? h('button', { class: 'boton chico primario', type: 'button', onClick: () => mover('plantada') }, 'Plantada') : null,
      i.estado !== 'descartada' ? h('button', { class: 'boton chico peligro', type: 'button', onClick: () => mover('descartada') }, 'Descartar') : null,
      i.estado !== 'nueva' ? h('button', { class: 'boton chico', type: 'button', onClick: () => mover('nueva') }, 'Volver a la lista') : null));
}

function nuevaIdea() {
  const campo = (etiqueta, el) => h('label', { class: 'nota-chica' }, etiqueta, el);
  const area = h('select', {}, (app.datos.ideas?.areas || []).map((a) => h('option', { value: a }, AREA_ES[a] || a)));
  const titulo = h('input', { type: 'text', maxlength: '120', placeholder: 'Qué mejorar, en una línea' });
  const detalle = h('textarea', { maxlength: '4000', placeholder: 'Por qué, y cómo se haría' });
  const impacto = h('select', {}, ['alto', 'medio', 'bajo'].map((x) => h('option', { value: x, selected: x === 'medio' }, x)));
  const esfuerzo = h('select', {}, ['bajo', 'medio', 'alto'].map((x) => h('option', { value: x, selected: x === 'medio' }, x)));

  const caja = h('form', { class: 'panel', style: 'display:grid;gap:10px' },
    h('h2', {}, 'Anotar una idea'),
    campo('Área', area), campo('Título', titulo), campo('Detalle', detalle),
    h('div', { style: 'display:flex;gap:10px' }, campo('Impacto', impacto), campo('Esfuerzo', esfuerzo)),
    h('div', { class: 'fila-botones' },
      h('button', { class: 'boton primario', type: 'submit' }, 'Anotar'),
      h('button', { class: 'boton', type: 'button', onClick: () => pintar() }, 'Cancelar')));

  caja.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const r = await api('/ideas', {
        metodo: 'POST',
        cuerpo: { area: area.value, titulo: titulo.value, detalle: detalle.value, impacto: impacto.value, esfuerzo: esfuerzo.value, autor: 'a mano' },
      });
      avisar(r.repetida ? 'Esa idea ya estaba: se contó otra vez.' : 'Anotada en el vivero.');
      await cargar('ideas');
      pintar();
    } catch (err) { avisar(err.message, true); }
  });
  render($('#vista'), caja);
  titulo.focus();
}

/* ------------------------------------------------------------- tabla --- */
function tabla(encabezados, filas, numericas = []) {
  return h('table', {},
    encabezados.some(Boolean)
      ? h('thead', {}, h('tr', {}, encabezados.map((e, i) => h('th', { class: numericas[i] ? 'num' : '' }, e))))
      : null,
    h('tbody', {}, filas.map((f) => h('tr', {}, f.map((c, i) => h('td', { class: numericas[i] ? 'num' : '' }, c))))));
}

/* ------------------------------------------------------------ cargar --- */
const CARGAS = {
  resumen: async () => {
    const [estado, flota, lecturas, ideas] = await Promise.all([
      api('/estado'), api('/flota?limite=1'), api('/lecturas?dias=30'), api('/ideas?limite=1'),
    ]);
    Object.assign(app.datos, { estado, flota, lecturas, ideas });
  },
  flota: async () => { app.datos.flota = await api('/flota?limite=300'); },
  firmware: async () => {
    const [firmware, flota] = await Promise.all([api('/firmware'), api('/flota?limite=1')]);
    Object.assign(app.datos, { firmware, flota });
  },
  uso: async () => {
    const [metricas, lecturas] = await Promise.all([api('/metricas?dias=30'), api('/lecturas?dias=30')]);
    Object.assign(app.datos, { metricas, lecturas });
  },
  cuentas: async () => {
    const [cuentas, agentes] = await Promise.all([api('/cuentas'), api('/agentes')]);
    Object.assign(app.datos, { cuentas, agentes });
  },
  ideas: async () => {
    const q = new URLSearchParams();
    if (app.filtro.area) q.set('area', app.filtro.area);
    if (app.filtro.estado) q.set('estado', app.filtro.estado);
    app.datos.ideas = await api(`/ideas${q.toString() ? `?${q}` : ''}`);
  },
};

async function cargar(que = app.vista) {
  const f = CARGAS[que === 'vivero' ? 'ideas' : que];
  if (f) await f();
}

/* ------------------------------------------------------------ pintar --- */
const VISTAS = {
  resumen: vistaResumen, flota: vistaFlota, firmware: vistaFirmware,
  uso: vistaUso, cuentas: vistaCuentas, vivero: vistaVivero,
};

function pintar() {
  for (const b of document.querySelectorAll('.pestana')) {
    b.setAttribute('aria-current', String(b.dataset.vista === app.vista));
  }
  render($('#vista'), VISTAS[app.vista]());
  $('#d-reloj').textContent = `al ${fechaHora(Date.now())}`;
}

async function irA(vista) {
  app.vista = vista;
  location.hash = vista;
  pintar();
  try {
    await cargar();
    pintar();
  } catch (e) {
    if (e.message !== 'sin sesión') avisar(e.message, true);
  }
}

/* ------------------------------------------------------------ puerta --- */
/* Tres pasos posibles: el email, el código que llegó ahí, y la clave del
   servidor como salida de emergencia. */
const paso = (cual, mensaje = '') => {
  $('#app').hidden = true;
  $('#puerta').hidden = false;
  for (const [id, es] of [['#form-email', 'email'], ['#form-codigo', 'codigo'], ['#form-clave', 'clave']]) {
    $(id).hidden = cual !== es;
  }
  $('#b-con-clave').hidden = cual === 'clave';
  const err = $('#error-entrar');
  err.textContent = mensaje;
  err.hidden = !mensaje;
  const foco = { email: '#email', codigo: '#codigo', clave: '#clave' }[cual];
  $(foco)?.focus();
};
const puerta = (mensaje = '') => paso('email', mensaje);

async function sinSesion(ruta, cuerpo) {
  const r = await fetch(`${base()}api/admin${ruta}`.replace(/([^:])\/\//g, '$1/'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(datos.error || `Error ${r.status}`);
  return datos;
}

async function adentro() {
  $('#puerta').hidden = true;
  $('#app').hidden = false;
  const h0 = (location.hash || '').replace('#', '');
  app.vista = VISTAS[h0] ? h0 : 'resumen';
  await irA(app.vista);
}

/* ------------------------------------------------------------ inicio --- */
for (const b of document.querySelectorAll('.pestana')) {
  b.addEventListener('click', () => irA(b.dataset.vista));
}
$('#b-refrescar').addEventListener('click', async () => {
  try { await cargar(); pintar(); avisar('Al día.'); } catch (e) { avisar(e.message, true); }
});
$('#b-salir').addEventListener('click', async () => {
  try { await api('/sesion', { metodo: 'DELETE' }); } catch { /* ya está */ }
  guardarToken(null);
  puerta('Cerraste la sesión.');
});
$('#form-email').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('#email').value.trim();
  if (!email) return;
  try {
    await sinSesion('/codigo', { email });
    /* Contesta lo mismo exista o no ese email: el mensaje también. */
    paso('codigo');
  } catch (err) {
    paso('email', err.message);
  }
});

$('#form-codigo').addEventListener('submit', async (e) => {
  e.preventDefault();
  const codigo = $('#codigo').value.replace(/\D/g, '');
  if (codigo.length !== 6) {
    paso('codigo', 'Son seis dígitos.');
    return;
  }
  try {
    const r = await sinSesion('/sesion', { email: $('#email').value.trim(), codigo });
    guardarToken(r.token);
    $('#codigo').value = '';
    await adentro();
  } catch (err) {
    $('#codigo').value = '';
    paso('codigo', err.message);
  }
});

$('#b-otro-email').addEventListener('click', () => { $('#codigo').value = ''; puerta(); });
$('#b-con-clave').addEventListener('click', () => paso('clave'));

$('#form-clave').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const r = await sinSesion('/sesion', { clave: $('#clave').value });
    guardarToken(r.token);
    $('#clave').value = '';
    await adentro();
  } catch (err) {
    $('#clave').value = '';
    paso('clave', err.message);
  }
});

window.addEventListener('hashchange', () => {
  const v = (location.hash || '').replace('#', '');
  if (VISTAS[v] && v !== app.vista && !$('#app').hidden) irA(v);
});

if (leerToken()) {
  adentro().catch(() => puerta());
} else {
  puerta();
}
