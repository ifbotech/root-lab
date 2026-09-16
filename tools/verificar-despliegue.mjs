/* verificar-despliegue.mjs — prueba una instalación de root-lab desde afuera.
 *
 *   node tools/verificar-despliegue.mjs https://ifbotech.com/rootkit
 *   node tools/verificar-despliegue.mjs https://ifbotech.com/rootkit --flujo
 *
 * Sin --flujo sólo lee: salud, página con su base, QR en mayúsculas,
 * manifest, service worker, renderer, emulador y cabeceras.
 *
 * Con --flujo además recorre el camino completo con un aparato de prueba:
 * cuenta, sincronización, vínculo, cofre, nombre, especie, lecturas y estado.
 * Abre una segunda cuenta para comprobar que no ve la planta de la primera,
 * y al final borra las dos cuentas: no queda nada en la base.
 */
import { randomBytes } from 'node:crypto';
import { codigoVinculo, tokenApi } from '../server/codigo.mjs';

const BASE = (process.argv[2] || 'http://localhost:8080').replace(/\/+$/, '');
const FLUJO = process.argv.includes('--flujo');

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

console.log(`\n  root-lab en ${BASE}\n`);
const basePath = new URL(BASE).pathname.replace(/\/+$/, '');

const salud = await json('/api/salud').catch((e) => [0, { error: e.message }]);
ok('responde /api/salud', salud[0] === 200 && salud[1]?.ok, JSON.stringify(salud));
if (salud[1]?.version) console.log(`    versión ${salud[1].version}, ${salud[1].plantas} plantas, ${salud[1].dispositivos} aparatos`);

const html = await (await pedir('/')).text();
ok('la app declara su base', html.includes(`<base href="${basePath}/">`));

const qrUrl = `${new URL(BASE).origin}${basePath.toUpperCase()}/V/K7Q2M9XA`;
const qr = await fetch(qrUrl, { redirect: 'manual' });
ok('el QR en mayúsculas abre la app', qr.status === 200 && (await qr.text()).includes('<base href='), `${qr.status} ${qrUrl}`);

const man = await json('/manifest.webmanifest?codigo=K7Q2M9XA');
ok('manifest con start_url del código', man[0] === 200 && man[1]?.start_url === 'v/K7Q2M9XA');

const sw = await pedir('/sw.js');
ok('service worker', sw.status === 200 && /javascript/.test(sw.headers.get('content-type') || ''));

const wasm = await pedir('/caras/rootkit_caras.wasm');
ok('renderer de caras (wasm)', wasm.status === 200 && wasm.headers.get('content-type') === 'application/wasm');

const cara = await pedir('/caras/kawaii-HAPPY.png');
ok('imágenes de las caras', cara.status === 200);

const emu = await pedir('/emulador/');
ok('emulador', emu.status === 200 && (await emu.text()).includes('<base href='));

ok('HTTPS', BASE.startsWith('https://') || BASE.includes('localhost'), 'sin HTTPS no se instala ni avisa');

const cfg = await json('/api/config');
ok('url pública configurada', BASE.includes('localhost') || cfg[1]?.url_publica?.replace(/\/+$/, '') === BASE, `${cfg[1]?.url_publica} vs ${BASE}`);
ok('notificaciones listas', cfg[1]?.push === true);
console.log(`    IA: ${cfg[1]?.ia}`);

if (FLUJO) {
  console.log('\n  flujo completo con un aparato de prueba\n');
  const secreto = randomBytes(16);
  const id = randomBytes(6).toString('hex').toUpperCase();
  const tokenDisp = tokenApi(secreto);
  const codigo = codigoVinculo(secreto, 0);
  const disp = (cuerpo) => json('/api/d/sync', { method: 'POST', headers: { authorization: `Bearer ${tokenDisp}` }, body: {
    id, fw: 'verificacion', placa: 'prueba', pantalla: 'ninguna', persona: '', epoca: 0, rssi: -50, usb: true, bat_mv: 0, arranques: 1, ...cuerpo,
  } });

  const clave = randomBytes(12).toString('hex');
  const registrar = (quien) => json('/api/cuenta/registro', { method: 'POST', body: {
    email: `verificacion-${quien}-${randomBytes(4).toString('hex')}@ejemplo.com`, clave, nombre: 'Verificación', tz: 'America/Argentina/Buenos_Aires',
  } });
  const [cc, cuenta] = await registrar('a');
  ok('crear cuenta', cc === 201 && cuenta?.token);
  const auth = { authorization: `Bearer ${cuenta?.token}` };

  const [cs] = await json('/api/estado');
  ok('sin sesión no hay datos', cs === 401);

  const [ce1] = await json('/api/cuenta/entrar', { method: 'POST', body: { email: cuenta?.cuenta?.email, clave } });
  ok('entrar con email y contraseña', ce1 === 200);
  const [ce2] = await json('/api/cuenta/entrar', { method: 'POST', body: { email: cuenta?.cuenta?.email, clave: 'otra cosa' } });
  ok('contraseña equivocada', ce2 === 401);

  const [c1, r1] = await disp({ estado: 'SIN_VINCULO', codigo, reloj: 10, lecturas: [] });
  ok('el aparato se presenta', c1 === 200 && r1?.ok && r1.vinculado === false);

  const [cv, planta] = await json('/api/vinculo', { method: 'POST', headers: auth, body: { codigo } });
  ok('vincular', cv === 201 && planta?.id);

  const [ck, cofre] = await json(`/api/plantas/${planta?.id}/cofre`, { method: 'POST', headers: auth });
  ok('abrir el cofre', ck === 200 && cofre?.id);

  const [cp] = await json(`/api/plantas/${planta?.id}`, { method: 'PATCH', headers: auth, body: { nombre: 'Verificación', especie: 'monstera' } });
  ok('nombre y especie', cp === 200);

  const [c2, r2] = await disp({ estado: 'ACTIVO', reloj: 20, lecturas: [{ hace: 1, suelo: 12, temp: 230, hr: 55, lux: 4000, animo: 'THIRSTY', sev: 'URGENT' }] });
  ok('el aparato recibe cofre y especie', c2 === 200 && r2?.revelado && r2?.especie?.id === 'monstera' && r2?.aceptadas === 1);

  const [ce, estado] = await json('/api/estado', { headers: auth });
  const n = estado?.nodes?.[0];
  ok('el tablero muestra la sed', ce === 200 && n?.mood === 'THIRSTY' && n?.tel?.soil_pct === 12);

  const [cot, otra] = await registrar('b');
  const authOtra = { authorization: `Bearer ${otra?.token}` };
  const [, estadoOtra] = await json('/api/estado', { headers: authOtra });
  const [cpo] = await json(`/api/plantas/${planta?.id}`, { headers: authOtra });
  ok('otra cuenta no ve esa planta', cot === 201 && estadoOtra?.nodes?.length === 0 && cpo === 404);

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
