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
 */
import { cargarCaras, escribirEntrada, leerTexto, ANIMOS } from '../lib/caras.mjs';
import { enBase } from '../lib/base.mjs';

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
const leer = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const escribir = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

/* -------------------------------------------------------------- identidad */
function identidad() {
  let yo = leer('emu:yo', null);
  if (!yo) {
    const s = crypto.getRandomValues(new Uint8Array(16));
    const mac = crypto.getRandomValues(new Uint8Array(6));
    yo = { secreto: hex(s), id: hex(mac).toUpperCase(), persona: '', arranques: 0 };
  }
  yo.arranques += 1;
  escribir('emu:yo', yo);
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
let nvs = leer('emu:nvs', { epoca: 0, wifi: false, vinculado: false, revelado: false });
let nube = leer('emu:nube', { persona: '', especie: null, nombre: '', dias_sanos: 0, brillo: 80 });
const inicioMs = Date.now();
let relojBase = leer('emu:reloj', 0);
const reloj = () => relojBase + Math.floor((Date.now() - inicioMs) / 1000);
let pendientes = leer('emu:pendientes', []);
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
  if (pendientes.length > 288) pendientes.shift();
  escribir('emu:pendientes', pendientes);
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
    escribir('emu:pendientes', pendientes);
    transmitir = pendientes.length > 0;
    escribir('emu:nube', nube);
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
  for (const k of ['emu:yo', 'emu:nvs', 'emu:nube', 'emu:pendientes', 'emu:reloj']) localStorage.removeItem(k);
  location.reload();
});
$('s-persona').addEventListener('change', (e) => {
  yo.persona = e.target.value;
  escribir('emu:yo', yo);
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
const MODELOS = {
  cresta: '#62c536', kawaii: '#ffa8d0', visor: '#3a526a', ciclope: '#ffa838', hongo: '#ba8ef2',
  'chico-malo': '#9d0208', 'chica-chill': '#0466c8', glitch: '#2a2a36',
};
const lienzo = $('pantalla');
const ctx = lienzo.getContext('2d');
let ultimoCuadro = 0;
let estadoPrevio = '';

function persistir() {
  const n = { epoca: x.enlace_epoca(), wifi: Boolean(x.enlace_wifi()), vinculado: Boolean(x.enlace_vinculado()), revelado: Boolean(x.enlace_revelado()) };
  if (JSON.stringify(n) !== JSON.stringify(nvs)) {
    if (!n.vinculado && nvs.vinculado) {
      nube = { persona: '', especie: null, nombre: '', dias_sanos: 0, brillo: 80 };
      escribir('emu:nube', nube);
    }
    if (!n.wifi && nvs.wifi) wifiOk = false;
    nvs = n;
    escribir('emu:nvs', nvs);
  }
  escribir('emu:reloj', reloj());
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
  const personaId = yo.persona || nube.persona;
  $('carcasa').style.setProperty('--piel', x.enlace_revelado() && MODELOS[personaId] ? MODELOS[personaId] : '#8d9aa3');

  if (t - ultimoCuadro < 33) return;
  ultimoCuadro = t;

  /* Como el aparato: framebuffer cuadrado del lado corto y franjas lisas. */
  const lado = Math.min(lienzo.width, lienzo.height);
  const oy = (lienzo.height - lado) / 2;
  x.lienzo(lado, lado);
  const idx = m.personas.get(personaId) ?? 0;
  let cierre = 0;
  if (apretadoDesde && ms - apretadoDesde > 2000) cierre = Math.min(100, ((ms - apretadoDesde - 2000) * 100) / 8000);
  switch (x.enlace_pantalla()) {
    case PANT.QR:
      x.qr(estado === 'SIN_WIFI' ? 0 : estado === 'CONECTANDO' ? 1 : 2, ms);
      break;
    case PANT.DORMIDA:
      x.dormida(ms);
      break;
    case PANT.DESPERTAR:
      x.despertar(idx, x.enlace_ms(ms));
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
        x.cara_mezcla(idx, animoDesde, animo, x.cara_anim_pct(Math.floor(pasado)), etapa, cierre, Date.now());
      } else {
        animoDesde = null;
        if (cierre > 0) x.cara_cierre(idx, animo, etapa, cierre, Date.now());
        else x.cara(idx, animo, etapa, Date.now());
      }
    }
  }
  const px = new Uint8ClampedArray(x.memory.buffer, x.rgba(), lado * lado * 4);
  ctx.fillStyle = `rgb(${px[0]},${px[1]},${px[2]})`;
  ctx.fillRect(0, 0, lienzo.width, lienzo.height);
  ctx.putImageData(new ImageData(new Uint8ClampedArray(px), lado, lado), 0, oy);
}
requestAnimationFrame(cuadro);
