/* emulador.mjs — un Rooti (el hardware ROOTKIT) en el navegador.
 *
 * No imita al firmware: LO USA. La máquina de estados del vínculo, el
 * código del QR, la pantalla del QR, la evaluación del ánimo y las caras
 * salen del mismo módulo WebAssembly compilado desde rootkit/firmware. Lo
 * único que se escribe acá es lo que en la placa es hardware: el wifi, los
 * sensores, el botón y el pedido HTTP, con el mismo cuerpo JSON que arma
 * net/nube.c.
 *
 * Sirve para recorrer el flujo completo sin placa, y para probar la app en
 * un teléfono de verdad: el QR que dibuja apunta a la URL pública del
 * servidor.
 *
 * VARIOS ROOTIES
 *
 * Cada pestaña con `?n=2`, `?n=3`... es otro aparato, con su identidad y
 * su NVS guardados aparte: así se prueba el invernadero con varios.
 *
 * PROBAR LO NUEVO
 *
 * La tarjeta de abajo acorta lo que en la vida real lleva días: un riego que
 * se escurre, 48 h de historial, luces de ejemplo, la noche simulada (la
 * hora de prueba de lib/reloj.mjs, que la app lee en vivo), tres días sin
 * mimos y gotas de rocío (POST /api/d/demo, que sólo acepta a la placa
 * "emulador"), y enlaces directos a cada pantalla de la planta. Muestra al
 * Rooti entero como lo dibuja la app (lib/cuerpo.mjs).
 */
import { cargarCaras, escribirEntrada, leerTexto, ANIMOS, indiceRareza } from '../lib/caras.mjs';
import { enBase } from '../lib/base.mjs';
import { MODELOS, RAREZAS, pielDe, modeloPorId } from '../lib/rooties.mjs';
import { cuerpo } from '../lib/cuerpo.mjs';
import { horaDePrueba, fijarHoraDePrueba } from '../lib/reloj.mjs';

const EV = { TICK: 0, WIFI_GUARDADO: 1, WIFI_OK: 2, WIFI_FALLO: 3, NUBE_OK: 4, NUBE_FALLO: 5, BOTON_LARGO: 6 };
const ESTADOS = ['SIN_WIFI', 'CONECTANDO', 'SIN_VINCULO', 'ESPERA_COFRE', 'DESPERTANDO', 'ACTIVO'];
const PANT = { QR: 0, DORMIDA: 1, DESPERTAR: 2, CARA: 3 };
const SEV = ['OK', 'WATCH', 'URGENT'];
const LEYENDAS = {
  SIN_WIFI: 'Muestra el QR y abrió su red. Pasale el wifi.',
  CONECTANDO: 'Probando la red de la casa…',
  SIN_VINCULO: 'En línea. Escaneá el QR con la app para vincularlo.',
  ESPERA_COFRE: 'Vinculado y dormido: abrí el cofre en la app.',
  DESPERTANDO: '¡Abriendo los ojos!',
  ACTIVO: 'Despierto. Mové los sensores y mirá la cara.',
};

const $ = (id) => document.getElementById(id);
/* Cada instancia (?n=2) guarda lo suyo con otro prefijo. */
const INSTANCIA = Math.max(1, Math.min(9, Number(new URLSearchParams(location.search).get('n')) || 1));
const P = INSTANCIA === 1 ? 'emu:' : `emu${INSTANCIA}:`;
const leer = (k, d) => { try { return JSON.parse(localStorage.getItem(P + k)) ?? d; } catch { return d; } };
const escribir = (k, v) => localStorage.setItem(P + k, JSON.stringify(v));
const PERSONAS = MODELOS.map((mo) => mo.id);
const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

/* -------------------------------------------------------------- identidad */
function identidad() {
  let yo = leer('yo', null);
  if (!yo) {
    const s = crypto.getRandomValues(new Uint8Array(16));
    const mac = crypto.getRandomValues(new Uint8Array(6));
    /* La figura sale de fábrica con su Rooti: el primero, el Brote; la
       segunda instancia, el Musgo; y así. */
    yo = { secreto: hex(s), id: hex(mac).toUpperCase(), persona: PERSONAS[(INSTANCIA - 1) % PERSONAS.length], arranques: 0 };
  }
  /* Un aparato de antes de los cinco Rooties se vuelve Brote. */
  if (!PERSONAS.includes(yo.persona)) yo.persona = 'brote';
  yo.arranques += 1;
  escribir('yo', yo);
  return yo;
}

const m = await cargarCaras(enBase('caras/rootkit_caras.wasm'));
if (!m) {
  $('estado-linea').textContent = 'No pude cargar el módulo de caras. Corré `npm run firmware` en root-lab.';
  throw new Error('sin wasm');
}
const x = m.x;
const config = await fetch(enBase('api/config')).then((r) => r.json()).catch(() => ({ url_publica: location.origin + enBase('').replace(/\/$/, '') }));

let yo = identidad();
let nvs = leer('nvs', { epoca: 0, wifi: false, vinculado: false, revelado: false, rareza: 'comun' });
const NUBE_VACIA = { persona: '', rareza: 'comun', planta: null, especie: null, nombre: '', dias_sanos: 0, brillo: 80 };
let nube = { ...NUBE_VACIA, ...leer('nube', {}) };
const inicioMs = Date.now();
let relojBase = leer('reloj', 0);
const reloj = () => relojBase + Math.floor((Date.now() - inicioMs) / 1000);
let pendientes = leer('pendientes', []);
let token = '';
let codigo = '';
let epocaQr = -1;
let ultimoReloj = -1;
let proxima = 0;
let enCurso = false;
let transmitir = true;

function cargarSecreto() {
  const mem = new Uint8Array(x.memory.buffer, x.secreto(), 16);
  mem.set(yo.secreto.match(/../g).map((b) => parseInt(b, 16)));
  token = leerTexto(x.token());
}
cargarSecreto();
$('s-persona').value = yo.persona;

const ahora = () => Math.floor(performance.now());
x.enlace_iniciar(nvs.epoca, nvs.wifi, nvs.vinculado, nvs.revelado, ahora());
if (nube.especie) aplicarEspecie(nube.especie);

function aplicarEspecie(e) {
  x.especie(e.suelo_min, e.suelo_max, e.temp_min, e.temp_max, e.hr_min, e.lux_min, e.lux_max);
}

/* ------------------------------------------------------------------ wifi --- */
let wifiOk = false;
let wifiTimer = null;
function conectarWifi() {
  clearTimeout(wifiTimer);
  wifiTimer = setTimeout(() => {
    if ($('c-cortar').checked) {
      x.enlace_evento(EV.WIFI_FALLO, 0, 0, ahora());
      conectarWifi();
      return;
    }
    wifiOk = true;
    x.enlace_evento(EV.WIFI_OK, 0, 0, ahora());
    proxima = 0;
  }, 1400);
}
if (nvs.wifi) conectarWifi();

$('b-wifi').addEventListener('click', () => {
  x.enlace_evento(EV.WIFI_GUARDADO, 0, 0, ahora());
  conectarWifi();
});
$('c-cortar').addEventListener('change', (e) => {
  if (e.target.checked) {
    wifiOk = false;
    x.enlace_evento(EV.WIFI_FALLO, 0, 0, ahora());
    conectarWifi();
  } else if (x.enlace_wifi()) {
    conectarWifi();
  }
});

/* ------------------------------------------------------------- sensores --- */
const luxDe = (v) => Math.round(10 ** (v / 1000 * 5) - 1);   /* 0..100000, logarítmico */
function lecturaActual() {
  return {
    suelo: Number($('r-suelo').value),
    temp: Number($('r-temp').value),
    hr: Number($('r-hr').value),
    lux: luxDe(Number($('r-lux').value)),
    bat: $('c-usb').checked ? 0 : Number($('r-bat').value),
    usb: $('c-usb').checked,
    fallas: $('c-falla-aire').checked ? 2 : 0,
  };
}
function pintarValores() {
  const l = lecturaActual();
  $('v-suelo').textContent = `${l.suelo} %`;
  $('v-temp').textContent = `${(l.temp / 10).toFixed(1)} °C`;
  $('v-hr').textContent = `${l.hr} %`;
  $('v-lux').textContent = l.lux >= 1000 ? `${(l.lux / 1000).toFixed(1)} mil lux` : `${l.lux} lux`;
  $('v-bat').textContent = l.usb ? 'enchufado' : `${(l.bat / 1000).toFixed(2)} V`;
}
for (const id of ['r-suelo', 'r-temp', 'r-hr', 'r-lux', 'r-bat', 'c-usb', 'c-falla-aire']) {
  $(id).addEventListener('input', () => { pintarValores(); medir(); });
}
pintarValores();

let animo = 3;
let sev = 0;
function medir() {
  const l = lecturaActual();
  if (nube.especie) {
    animo = x.animo(l.suelo, l.temp, l.hr, l.lux, l.fallas);
    sev = x.severidad();
  } else {
    animo = 3;
    sev = 0;
  }
  /* El aparato mide como mucho una vez cada unos minutos; acá los
     deslizadores disparan varias por segundo. El reloj se adelanta para que
     cada lectura sea posterior a la anterior, igual que en la placa. */
  if (reloj() <= ultimoReloj) relojBase += ultimoReloj - reloj() + 1;
  ultimoReloj = reloj();
  /* El detector de riego del firmware: subir el deslizador de golpe y
     bajarlo enseguida es el agua que se escurre. */
  if (!(l.fallas & 1) && x.riego_paso) x.riego_paso(l.suelo, reloj());
  const escurre = Boolean(x.riego_escurre && x.riego_escurre(reloj()));
  const r = {
    reloj: reloj(), suelo: l.suelo, suelo_raw: 2650 - l.suelo * 14, lux: l.lux, usb: l.usb,
    animo: ANIMOS[animo], sev: SEV[sev], fallas: l.fallas | (escurre ? 16 : 0),
    ...(escurre ? { escurre: true } : {}),
  };
  $('estado-linea').classList.toggle('escurre', escurre);
  if (!(l.fallas & 2)) { r.temp = l.temp; r.hr = l.hr; }
  if (l.bat) r.bat = l.bat;
  pendientes.push(r);
  if (pendientes.length > 400) pendientes.shift();
  escribir('pendientes', pendientes);
  transmitir = true;
}
$('b-medir').addEventListener('click', medir);
$('b-regar').addEventListener('click', () => { $('r-suelo').value = '62'; pintarValores(); medir(); });
setInterval(medir, 20000);
medir();

/* ---------------------------------------------------------------- nube ----- */

async function sincronizar() {
  const t = ahora();
  const consulta = x.enlace_consulta_ms($('c-usb').checked, t);
  const estado = ESTADOS[x.enlace_estado()];
  if (!wifiOk || enCurso) return;
  if (consulta > 0) {
    if (t < proxima) return;
  } else if (estado === 'ACTIVO') {
    if (!transmitir && t < proxima) return;
  } else {
    return;
  }
  enCurso = true;
  const l = lecturaActual();
  const lote = pendientes.slice(0, 20);
  const cuerpo = {
    id: yo.id, fw: '0.5.0-emulador', placa: 'emulador', pantalla: $('s-panel').value === '128' ? 'st7735-128' : 'ili9341-240x320',
    persona: yo.persona, estado, epoca: x.enlace_epoca(),
    ...(x.enlace_codigo() ? { codigo } : {}),
    reloj: reloj(), rssi: -55, usb: l.usb, bat_mv: l.bat, arranques: yo.arranques,
    lecturas: lote.map(({ reloj: rl, ...resto }) => ({ hace: reloj() - rl, ...resto })),
  };
  try {
    const r = await fetch(enBase('api/d/sync'), {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(cuerpo),
    });
    const j = await r.json();
    $('log').textContent = `→ ${JSON.stringify({ ...cuerpo, lecturas: `${cuerpo.lecturas.length} lecturas` }, null, 1)}\n\n← ${r.status} ${JSON.stringify(j, null, 1)}`;
    if (!r.ok || !j.ok) throw new Error(j.error || r.status);
    x.enlace_evento(EV.NUBE_OK, j.vinculado ? 1 : 0, j.revelado ? 1 : 0, ahora());
    if (j.vinculado) {
      if (j.persona) nube.persona = j.persona;
      nube.planta = j.planta || null;
      /* La piel que salió del cofre: como la placa, se guarda en la NVS y
         pinta la maceta. */
      if (j.revelado && RAREZAS.includes(j.rareza)) {
        nube.rareza = j.rareza;
        nvs.rareza = j.rareza;
      }
      nube.nombre = j.nombre || '';
      if (j.especie && JSON.stringify(j.especie) !== JSON.stringify(nube.especie)) {
        nube.especie = j.especie;
        aplicarEspecie(j.especie);
        medir();
      }
      if (j.vinculo) nube.dias_sanos = j.vinculo.dias_sanos;
      nube.brillo = j.brillo || 80;
    }
    pendientes.splice(0, Math.min(j.aceptadas || 0, lote.length));
    escribir('pendientes', pendientes);
    transmitir = pendientes.length > 0;
    escribir('nube', nube);
    pintarProbar();
  } catch {
    x.enlace_evento(EV.NUBE_FALLO, 0, 0, ahora());
  } finally {
    enCurso = false;
    proxima = ahora() + (consulta > 0 ? consulta : 15000);
  }
}

/* --------------------------------------------------------------- botón ----- */
let apretadoDesde = 0;
$('boton').addEventListener('pointerdown', () => { apretadoDesde = ahora(); });
window.addEventListener('pointerup', () => { apretadoDesde = 0; });
$('b-reset').addEventListener('click', () => {
  x.enlace_evento(EV.BOTON_LARGO, 0, 0, ahora());
  wifiOk = false;
});
$('b-nuevo').addEventListener('click', () => {
  if (!confirm('¿Borrar la identidad de este aparato virtual y empezar de cero?')) return;
  for (const k of ['yo', 'nvs', 'nube', 'pendientes', 'reloj']) localStorage.removeItem(P + k);
  location.reload();
});
$('s-persona').addEventListener('change', (e) => {
  yo.persona = e.target.value;
  escribir('yo', yo);
  pintarProbar();
});
$('b-abrir').addEventListener('click', () => window.open(enBase(`v/${codigo}`), '_blank', 'noopener'));
$('s-panel').addEventListener('change', (e) => {
  const chico = e.target.value === '128';
  const c = $('pantalla');
  c.width = chico ? 128 : 240;
  c.height = chico ? 128 : 320;
  $('carcasa').classList.toggle('chica', chico);
});

/* --------------------------------------------------------------- bucle ----- */
let animoPantalla = null;
let animoDesde = null;
let transicionT0 = 0;
const lienzo = $('pantalla');
const ctx = lienzo.getContext('2d');
let ultimoCuadro = 0;
let estadoPrevio = '';

function persistir() {
  const n = { epoca: x.enlace_epoca(), wifi: Boolean(x.enlace_wifi()), vinculado: Boolean(x.enlace_vinculado()), revelado: Boolean(x.enlace_revelado()), rareza: nvs.rareza || 'comun' };
  if (JSON.stringify(n) !== JSON.stringify(nvs)) {
    if (!n.vinculado && nvs.vinculado) {
      /* Desvincular borra la piel: el próximo dueño abre su propio cofre. */
      nube = { ...NUBE_VACIA };
      n.rareza = 'comun';
      escribir('nube', nube);
      pintarProbar();
    }
    if (!n.wifi && nvs.wifi) wifiOk = false;
    nvs = n;
    escribir('nvs', nvs);
  }
  escribir('reloj', reloj());
}

function cuadro(t) {
  requestAnimationFrame(cuadro);
  const ms = Math.floor(t);
  x.enlace_evento(EV.TICK, 0, 0, ms);
  if (apretadoDesde && ms - apretadoDesde > 10000) {
    x.enlace_evento(EV.BOTON_LARGO, 0, 0, ms);
    apretadoDesde = 0;
    wifiOk = false;
  }
  persistir();
  sincronizar();

  const epoca = x.enlace_epoca();
  if (epoca !== epocaQr) {
    epocaQr = epoca;
    codigo = leerTexto(x.codigo(epoca));
    escribirEntrada(config.url_publica || location.origin);
    const url = leerTexto(x.qr_preparar(epoca));
    $('d-url').textContent = url || '(no entra en el QR)';
    $('d-url').href = enBase(`v/${codigo}`);
    $('d-codigo').textContent = `${codigo.slice(0, 4)}-${codigo.slice(4)}`;
    $('d-ssid').textContent = `ROOTKIT-${codigo.slice(0, 4)}`;
    $('d-epoca').textContent = String(epoca);
  }
  const estado = ESTADOS[x.enlace_estado()];
  if (estado !== estadoPrevio) {
    estadoPrevio = estado;
    $('d-estado').textContent = estado;
    $('estado-linea').textContent = LEYENDAS[estado];
    $('b-wifi').disabled = estado !== 'SIN_WIFI';
  }
  const personaId = PERSONAS.includes(yo.persona) ? yo.persona : (nube.persona || 'brote');
  const rareza = $('s-piel').value || nvs.rareza || 'comun';
  const revelado = Boolean(x.enlace_revelado());
  const piel = pielDe(personaId, rareza);
  $('carcasa').style.setProperty('--piel', revelado && piel ? piel.piel : '#8d9aa3');
  $('carcasa').dataset.rareza = revelado ? rareza : '';

  if (t - ultimoCuadro < 33) return;
  ultimoCuadro = t;

  /* Como el aparato: framebuffer cuadrado del lado corto y franjas lisas. */
  const lado = Math.min(lienzo.width, lienzo.height);
  const oy = (lienzo.height - lado) / 2;
  x.lienzo(lado, lado);
  const idx = m.personas.get(personaId) ?? 0;
  const r = indiceRareza(rareza);
  let cierre = 0;
  if (apretadoDesde && ms - apretadoDesde > 2000) cierre = Math.min(100, ((ms - apretadoDesde - 2000) * 100) / 8000);
  switch (x.enlace_pantalla()) {
    case PANT.QR:
      x.qr(estado === 'SIN_WIFI' ? 0 : estado === 'CONECTANDO' ? 1 : 2, ms);
      break;
    case PANT.DORMIDA:
      x.dormida(idx, ms);
      break;
    case PANT.DESPERTAR:
      x.despertar(idx, r, x.enlace_ms(ms));
      break;
    default: {
      const etapa = nube.dias_sanos >= 180 ? 4 : nube.dias_sanos >= 90 ? 3 : nube.dias_sanos >= 30 ? 2 : nube.dias_sanos >= 7 ? 1 : 0;
      /* La transición entre ánimos, con el mismo reloj que la placa. */
      if (animo !== animoPantalla) {
        if (animoPantalla !== null) { animoDesde = animoPantalla; transicionT0 = ms; }
        animoPantalla = animo;
      }
      const pasado = animoDesde === null ? Infinity : ms - transicionT0;
      if (pasado < x.transicion_ms()) {
        x.cara_mezcla(idx, r, animoDesde, animo, x.cara_anim_pct(Math.floor(pasado)), etapa, cierre, Date.now());
      } else {
        animoDesde = null;
        if (cierre > 0) x.cara_cierre(idx, r, animo, etapa, cierre, Date.now());
        else x.cara(idx, r, animo, etapa, Date.now());
      }
    }
  }
  const px = new Uint8ClampedArray(x.memory.buffer, x.rgba(), lado * lado * 4);
  ctx.fillStyle = `rgb(${px[0]},${px[1]},${px[2]})`;
  ctx.fillRect(0, 0, lienzo.width, lienzo.height);
  ctx.putImageData(new ImageData(new Uint8ClampedArray(px), lado, lado), 0, oy);
}
requestAnimationFrame(cuadro);

/* ============================================================ probar lo nuevo */
const aviso = (texto, error = false) => {
  $('probar-aviso').textContent = texto;
  $('probar-aviso').classList.toggle('error', error);
};

/* El Rooti entero, como lo dibuja la app. */
let vista = null;
let vistaClave = '';
function pintarProbar() {
  const personaId = PERSONAS.includes(yo.persona) ? yo.persona : 'brote';
  const rareza = $('s-piel').value || nvs.rareza || 'comun';
  const revelado = Boolean(x.enlace_revelado());
  const clave = `${personaId}|${rareza}|${revelado}`;
  const noche = horaDePrueba() !== null && (horaDePrueba() >= 22 || horaDePrueba() < 8);
  if (clave !== vistaClave) {
    vistaClave = clave;
    vista = cuerpo({ persona: personaId, rareza, dormido: !revelado, animo: ANIMOS[animo], lado: 150, noche, fps: 12 });
    $('vista-app').replaceChildren(vista);
  } else {
    vista.actualizar({ animo: ANIMOS[animo], noche });
  }
  const mo = modeloPorId(personaId);
  $('d-piel').textContent = revelado ? `${pielDe(personaId, nvs.rareza)?.nombre || '—'} (${nvs.rareza})` : 'sin cofre';
  $('vista-leyenda').textContent = revelado
    ? `${mo?.nombre}: piel ${pielDe(personaId, rareza)?.nombre}${$('s-piel').value ? ' (sólo acá, para ver)' : ''}`
    : `${mo?.nombre}, dormido: abrí el cofre en la app.`;
  $('c-noche').checked = noche;
  const planta = nube.planta;
  for (const a of document.querySelectorAll('[data-ir]')) {
    const destino = a.dataset.ir;
    const necesita = a.dataset.planta === '1';
    a.href = enBase(`#${necesita ? `${destino}/${planta || ''}` : destino}`);
    a.classList.toggle('apagado', necesita && !planta);
    a.setAttribute('aria-disabled', necesita && !planta ? 'true' : 'false');
  }
  $('b-tres-dias').disabled = !revelado;
  $('b-gotas').disabled = !revelado;
}
setInterval(pintarProbar, 1000);

$('s-piel').addEventListener('change', pintarProbar);

/* Un riego que se escurre: sube de golpe y enseguida vuelve a bajar
   (nodo/soil.h: +25 puntos en 5 min y perder el 70 % en 30 min). */
$('b-escurre').addEventListener('click', async () => {
  const antes = Math.min(40, Number($('r-suelo').value));
  const paso = (v, adelanto) => {
    relojBase += adelanto;
    $('r-suelo').value = String(v);
    pintarValores();
    medir();
  };
  paso(antes, 1);
  paso(antes + 34, 20);
  await new Promise((r) => setTimeout(r, 400));
  paso(antes + 20, 240);
  await new Promise((r) => setTimeout(r, 400));
  paso(antes + 6, 480);
  aviso('Listo: un riego que se escurrió. Mirá el aviso en la ficha de la planta.');
});

/* 48 horas de historial: el reloj se adelanta dos días y se llenan con una
   lectura cada 15 minutos (se secó, se regó, día y noche). */
$('b-historial').addEventListener('click', () => {
  if (!nube.especie) aviso('Sin especie todavía: las lecturas van a salir sin ánimo. Elegí la especie en la app.', true);
  const PASO = 900;
  const N = 48 * 4;
  const inicio = reloj() + 1;
  relojBase += N * PASO + 2;
  for (let k = 0; k < N; k++) {
    const hs = (k * PASO) / 3600;
    const dia = Math.sin(((hs + 6) / 24) * 2 * Math.PI);
    const suelo = Math.round(hs < 30 ? 62 - hs * 1.1 : 64 - (hs - 30) * 1.0);
    const temp = Math.round(215 + 45 * dia);
    const hr = Math.round(60 - 12 * dia);
    const lux = Math.max(0, Math.round(dia > 0 ? 900 + 14000 * dia : 0));
    const a = nube.especie ? x.animo(suelo, temp, hr, lux, 0) : 3;
    const sv = nube.especie ? x.severidad() : 0;
    pendientes.push({ reloj: inicio + k * PASO, suelo, suelo_raw: 2650 - suelo * 14, lux, temp, hr, usb: false, bat: 3900, animo: ANIMOS[a], sev: SEV[sv], fallas: 0 });
  }
  escribir('pendientes', pendientes);
  transmitir = true;
  medir();
  aviso(`Anotadas ${N} lecturas de 48 h. Se mandan en tandas de 20; en unos segundos están en el gráfico.`);
});

/* La luz: el deslizador es logarítmico (luxDe). */
const deLux = (lux) => Math.round((Math.log10(lux + 1) / 5) * 1000);
for (const b of document.querySelectorAll('[data-lux]')) {
  b.addEventListener('click', () => {
    $('r-lux').value = String(deLux(Number(b.dataset.lux)));
    pintarValores();
    medir();
  });
}

/* La noche: la hora de prueba que lee la app (lib/reloj.mjs). */
$('c-noche').addEventListener('change', (e) => {
  fijarHoraDePrueba(e.target.checked ? 23 : null);
  aviso(e.target.checked ? 'Son las 23 h para la app: los Rooties se sientan a dormir con gorrito.' : 'La app vuelve a la hora real.');
  pintarProbar();
});

/* El tiempo de la mascota, en la nube. */
async function demo(accion, texto) {
  try {
    const r = await fetch(enBase('api/d/demo'), {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ id: yo.id, accion }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || r.status);
    aviso(`${texto} Felicidad ${j.mascota.felicidad} %, ${j.mascota.polvo} motas, ${j.mascota.gotas} gotas.`);
  } catch (e) {
    aviso(`No se pudo: ${e.message}`, true);
  }
}
$('b-tres-dias').addEventListener('click', () => demo('tres-dias', 'Pasaron 3 días sin mimos.'));
$('b-gotas').addEventListener('click', () => demo('gotas', 'Tres gotas de rocío más.'));

$('b-otro').addEventListener('click', () => {
  const siguiente = INSTANCIA + 1 > 9 ? 2 : INSTANCIA + 1;
  window.open(enBase(`emulador/?n=${siguiente}`), '_blank', 'noopener');
});
if (INSTANCIA > 1) document.title = `Emulador de Rooti ${INSTANCIA} · ROOTLAB`;
$('d-instancia').textContent = INSTANCIA > 1 ? `aparato ${INSTANCIA}` : 'aparato 1';
pintarProbar();
