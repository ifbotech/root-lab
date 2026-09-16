/* verificar-despliegue.mjs — prueba una instalación de ROOTLAB desde afuera.
 *
 *   node tools/verificar-despliegue.mjs https://ifbotech.com/rootkit
 *   node tools/verificar-despliegue.mjs https://ifbotech.com/rootkit --flujo
 *   node tools/verificar-despliegue.mjs https://ifbotech.com/rootkit --flujo --ia
 *
 * Sin --flujo sólo lee: salud y esquema, página con su base, QR en
 * mayúsculas, manifest, service worker, renderer, fuentes, emulador y
 * cabeceras de seguridad.
 *
 * Con --flujo recorre el camino completo con un aparato de prueba: cuenta,
 * sincronización, vínculo, cofre, nombre, especie, ficha, lecturas y estado;
 * que la IA exija un Rooti; recuperar la contraseña (sin mandar nada: las
 * cuentas son @rootlab.invalid, un dominio que el servidor nunca le pasa al
 * relay); paletas bloqueadas; y que otra cuenta no vea nada. Al final borra
 * las cuentas de prueba con sus plantas (queda el aparato inventado, sin
 * dueño).
 *
 * Con --ia además le manda UN mensaje a la planta, que con la IA real cuesta
 * alrededor de un centavo de dólar, para confirmar que la clave, el modelo y
 * el tope funcionan.
 */
import { randomBytes } from 'node:crypto';
import { codigoVinculo, tokenApi } from '../server/codigo.mjs';

const BASE = (process.argv[2] || 'http://localhost:8080').replace(/\/+$/, '');
const FLUJO = process.argv.includes('--flujo');
const IA = process.argv.includes('--ia');

let fallas = 0;
const ok = (nombre, cond, detalle = '') => {
  console.log(`  ${cond ? '✔' : '✖'} ${nombre}${cond || !detalle ? '' : `  (${detalle})`}`);
  if (!cond) fallas += 1;
};
const pedir = (ruta, op = {}) => fetch(`${BASE}${ruta}`, { redirect: 'manual', ...op });
const json = async (ruta, op = {}) => {
  const r = await pedir(ruta, {
    ...op,
    headers: { 'content-type': 'application/json', ...(op.headers || {}) },
    body: op.body !== undefined ? JSON.stringify(op.body) : undefined,
  });
  return [r.status, await r.json().catch(() => null)];
};

console.log(`\n  ROOTLAB en ${BASE}\n`);
const basePath = new URL(BASE).pathname.replace(/\/+$/, '');

const salud = await json('/api/salud').catch((e) => [0, { error: e.message }]);
ok('responde /api/salud', salud[0] === 200 && salud[1]?.ok, JSON.stringify(salud));
ok('base de datos en el esquema 2 (datos personales cifrados)', salud[1]?.esquema === 2, `esquema ${salud[1]?.esquema}`);
if (salud[1]?.version) console.log(`    versión ${salud[1].version}, ${salud[1].cuentas} cuentas, ${salud[1].plantas} plantas, ${salud[1].dispositivos} aparatos`);

const pagina = await pedir('/');
const html = await pagina.text();
ok('la app declara su base', html.includes(`<base href="${basePath}/">`));
ok('se llama ROOTLAB', /<title>ROOTLAB<\/title>/.test(html));

const csp = pagina.headers.get('content-security-policy') || '';
ok('política de contenido estricta', /default-src 'self'/.test(csp) && /frame-ancestors 'none'/.test(csp) && !/unsafe-eval'/.test(csp.replace("'wasm-unsafe-eval'", '')), csp);
ok('no se puede meter en un iframe', pagina.headers.get('x-frame-options') === 'DENY');
ok('sin referer ni sniffing', pagina.headers.get('referrer-policy') === 'no-referrer' && pagina.headers.get('x-content-type-options') === 'nosniff');
if (BASE.startsWith('https://')) {
  ok('HSTS', /max-age=\d{7,}/.test(pagina.headers.get('strict-transport-security') || ''), pagina.headers.get('strict-transport-security'));
}
ok('ningún recurso de terceros', !/https?:\/\/(?!www\.w3\.org)/.test(html.replace(/<!--[\s\S]*?-->/g, '')));

const qrUrl = `${new URL(BASE).origin}${basePath.toUpperCase()}/V/K7Q2M9XA`;
const qr = await fetch(qrUrl, { redirect: 'manual' });
ok('el QR en mayúsculas abre la app', qr.status === 200 && (await qr.text()).includes('<base href='), `${qr.status} ${qrUrl}`);

const man = await json('/manifest.webmanifest?codigo=K7Q2M9XA');
ok('manifest ROOTLAB con start_url del código', man[0] === 200 && man[1]?.start_url === 'v/K7Q2M9XA' && man[1]?.name === 'ROOTLAB');

const sw = await pedir('/sw.js');
ok('service worker', sw.status === 200 && /javascript/.test(sw.headers.get('content-type') || ''));

const wasm = await pedir('/caras/rootkit_caras.wasm');
ok('renderer de caras (wasm)', wasm.status === 200 && wasm.headers.get('content-type') === 'application/wasm');

const caras = await Promise.all(['kawaii', 'chico-malo', 'chica-chill'].map((p) => pedir(`/caras/${p}-HAPPY.png`)));
ok('caras de los Rooties, Chico Malo y Chica Chill incluidos', caras.every((r) => r.status === 200));

const fuente = await pedir('/fuentes/nunito-latin.woff2');
ok('fuente servida desde la app', fuente.status === 200 && fuente.headers.get('content-type') === 'font/woff2');

const emu = await pedir('/emulador/');
ok('emulador', emu.status === 200 && (await emu.text()).includes('<base href='));

ok('HTTPS', BASE.startsWith('https://') || BASE.includes('localhost'), 'sin HTTPS no se instala ni avisa');

const cfg = await json('/api/config');
ok('url pública configurada', BASE.includes('localhost') || cfg[1]?.url_publica?.replace(/\/+$/, '') === BASE, `${cfg[1]?.url_publica} vs ${BASE}`);
ok('notificaciones listas', cfg[1]?.push === true);
ok('cuotas del plan gratis publicadas', cfg[1]?.cuotas?.chat > 0);
console.log(`    IA: ${cfg[1]?.ia}; cuotas gratis: ${JSON.stringify(cfg[1]?.cuotas)}`);

if (FLUJO) {
  console.log('\n  flujo completo con un aparato de prueba\n');
  const secreto = randomBytes(16);
  const id = randomBytes(6).toString('hex').toUpperCase();
  const tokenDisp = tokenApi(secreto);
  const codigo = codigoVinculo(secreto, 0);
  const disp = (cuerpo) => json('/api/d/sync', { method: 'POST', headers: { authorization: `Bearer ${tokenDisp}` }, body: {
    id, fw: 'verificacion', placa: 'prueba', pantalla: 'ninguna', persona: 'chica-chill', epoca: 0, rssi: -50, usb: true, bat_mv: 0, arranques: 1, ...cuerpo,
  } });

  const clave = randomBytes(12).toString('hex');
  const registrar = (quien) => json('/api/cuenta/registro', { method: 'POST', body: {
    email: `verificacion-${quien}-${randomBytes(4).toString('hex')}@rootlab.invalid`, clave, nombre: 'Verificación', tz: 'America/Argentina/Buenos_Aires',
  } });
  const [cc, cuenta] = await registrar('a');
  ok('crear cuenta', cc === 201 && cuenta?.token);
  ok('arranca con Vibrant Tones y sin verificar el email', cuenta?.cuenta?.paleta === 'vibrant' && cuenta?.cuenta?.email_verificado === false);
  const auth = { authorization: `Bearer ${cuenta?.token}` };

  const [cs] = await json('/api/estado');
  ok('sin sesión no hay datos', cs === 401);

  const [ce1] = await json('/api/cuenta/entrar', { method: 'POST', body: { email: cuenta?.cuenta?.email, clave } });
  ok('entrar con email y contraseña', ce1 === 200);
  const [ce2] = await json('/api/cuenta/entrar', { method: 'POST', body: { email: cuenta?.cuenta?.email, clave: 'otra cosa' } });
  ok('contraseña equivocada', ce2 === 401);

  const [co1, ro1] = await json('/api/cuenta/olvide', { method: 'POST', body: { email: cuenta?.cuenta?.email } });
  const [co2, ro2] = await json('/api/cuenta/olvide', { method: 'POST', body: { email: `nadie-${randomBytes(4).toString('hex')}@rootlab.invalid` } });
  ok('olvidé mi contraseña responde igual exista o no la cuenta', co1 === 202 && co2 === 202 && JSON.stringify(ro1) === JSON.stringify(ro2));
  const [cr] = await json('/api/cuenta/restablecer?token=inventado');
  ok('un enlace inventado no restablece nada', cr === 200);

  const [cpal] = await json('/api/cuenta', { method: 'PATCH', headers: auth, body: { paleta: 'chica-chill' } });
  ok('la paleta de un Rooti que no tenés está bloqueada', cpal === 403);

  const [cia] = await json('/api/identificar', { method: 'POST', headers: auth, body: { image_b64: 'x'.repeat(200) } });
  ok('sin Rooti no hay reconocimiento de plantas', cia === 403);

  const [c1, r1] = await disp({ estado: 'SIN_VINCULO', codigo, reloj: 10, lecturas: [] });
  ok('el aparato se presenta', c1 === 200 && r1?.ok && r1.vinculado === false);

  const [cv, planta] = await json('/api/vinculo', { method: 'POST', headers: auth, body: { codigo } });
  ok('vincular', cv === 201 && planta?.id);

  const [ck, cofre] = await json(`/api/plantas/${planta?.id}/cofre`, { method: 'POST', headers: auth });
  ok('abrir el cofre: sale Chica Chill y pinta la app', ck === 200 && cofre?.id === 'chica-chill' && cofre?.pinta === true);
  const [, yo] = await json('/api/cuenta', { headers: auth });
  ok('la cuenta quedó con la paleta de su Rooti', yo?.paleta === 'chica-chill');

  const [cp, p] = await json(`/api/plantas/${planta?.id}`, { method: 'PATCH', headers: auth, body: { nombre: 'Verificación', especie: 'monstera' } });
  ok('nombre y especie, con su ficha de cuidados', cp === 200 && p?.ficha?.cuidados?.riego && p?.chat === true);

  const [c2, r2] = await disp({ estado: 'ACTIVO', reloj: 20, lecturas: [{ hace: 1, suelo: 12, temp: 230, hr: 55, lux: 4000, animo: 'THIRSTY', sev: 'URGENT' }] });
  ok('el aparato recibe cofre y especie', c2 === 200 && r2?.revelado && r2?.especie?.id === 'monstera' && r2?.aceptadas === 1);

  const [ce, estado] = await json('/api/estado', { headers: auth });
  const n = estado?.nodes?.[0];
  ok('el tablero muestra la sed', ce === 200 && n?.mood === 'THIRSTY' && n?.tel?.soil_pct === 12);

  const [cch, chat] = await json(`/api/plantas/${planta?.id}/chat`, { headers: auth });
  ok('el chat está disponible y muestra la cuota', cch === 200 && chat?.disponible === true && chat?.cuota?.limite > 0);
  if (IA) {
    const [cm, m] = await json(`/api/plantas/${planta?.id}/chat`, { method: 'POST', headers: auth, body: { texto: '¿Cómo estás? ¿Necesitás agua?' } });
    ok('la planta contesta', cm === 200 && m?.mensajes?.[1]?.texto?.length > 0, JSON.stringify(m));
    if (m?.mensajes?.[1]) console.log(`    Verificación (${m.fuente}): ${m.mensajes[1].texto.replace(/\s+/g, ' ').slice(0, 220)}`);
    ok('y descuenta la cuota', m?.cuota?.restantes === m?.cuota?.limite - 1);
  }

  const [cot, otra] = await registrar('b');
  const authOtra = { authorization: `Bearer ${otra?.token}` };
  const [, estadoOtra] = await json('/api/estado', { headers: authOtra });
  const [cpo] = await json(`/api/plantas/${planta?.id}`, { headers: authOtra });
  const [cco] = await json(`/api/plantas/${planta?.id}/chat`, { headers: authOtra });
  ok('otra cuenta no ve esa planta ni su charla', cot === 201 && estadoOtra?.nodes?.length === 0 && cpo === 404 && cco === 404);

  const [ch, hist] = await json(`/api/plantas/${planta?.id}/historial?horas=24`, { headers: auth });
  ok('la lectura quedó guardada', ch === 200 && hist?.total >= 1);

  const del = await pedir(`/api/plantas/${planta?.id}`, { method: 'DELETE', headers: auth });
  ok('desvincular', del.status === 204);

  const borrar = (a) => pedir('/api/cuenta', { method: 'DELETE', headers: { ...a, 'content-type': 'application/json' }, body: JSON.stringify({ clave }) });
  const b1 = await borrar(auth);
  const b2 = await borrar(authOtra);
  ok('borrar las cuentas de prueba', b1.status === 204 && b2.status === 204);
}

console.log(fallas ? `\n  ${fallas} FALLAS\n` : '\n  todo en verde\n');
process.exitCode = fallas ? 1 : 0;
