/* Lo que encontró la auditoría de seguridad de septiembre de 2026.
 *
 * Cada prueba es un hueco que existió de verdad (docs/seguridad.md, "La
 * auditoría"). Están juntas para que se vea qué se cerró y para que ninguno
 * se vuelva a abrir sin que falle algo.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { escenario, cuenta, aparato } from './ayudas.mjs';
import { ADMIN_FALLOS_DIA } from '../server/api.mjs';
import { endpointPushValido, crearPush } from '../server/push.mjs';
import { crearServidorHttp, ipDelPedido, esLocalDirecto } from '../server/http.mjs';
import { h } from '../public/lib/ui.mjs';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const ADMIN = 'una-clave-de-administracion-bien-larga';
const DUENIO = 'admin@ifbotech.com';
const panel = (op = {}) => escenario({ opciones: { adminClave: ADMIN, adminsDeArranque: [DUENIO], ...op } });
const admin = (esc, metodo, ruta, cuerpo = null, token = ADMIN) => esc.llamar(metodo, ruta, { cuerpo, token });

describe('las suscripciones push no pueden apuntar a cualquier lado (SSRF)', () => {
  test('sólo servicios de avisos de verdad, por HTTPS y en el 443', () => {
    for (const bien of [
      'https://fcm.googleapis.com/fcm/send/abc:APA91',
      'https://updates.push.services.mozilla.com/wpush/v2/gAAAA',
      'https://web.push.apple.com/QGxkZmFzZGZh',
      'https://wns2-bl2p.notify.windows.com/w/?token=BQYAAA',
    ]) assert.ok(endpointPushValido(bien), bien);

    for (const mal of [
      'https://127.0.0.1:3000/',                      /* el hub, en el mismo VPS */
      'https://localhost/rootkit/api/admin/estado',
      'https://169.254.169.254/latest/meta-data/',    /* metadatos del proveedor */
      'http://fcm.googleapis.com/fcm/send/x',         /* sin TLS */
      'https://fcm.googleapis.com:8443/fcm/send/x',   /* otro puerto */
      'https://fcm.googleapis.com.atacante.com/x',    /* sufijo engañoso */
      'https://atacantefcm.googleapis.com.evil/x',
      'https://usuario:clave@fcm.googleapis.com/x',
      'https://[::1]/x',
      'javascript:alert(1)',
      '',
      'x'.repeat(2000),
      null,
    ]) assert.ok(!endpointPushValido(mal), String(mal).slice(0, 60));
  });

  test('la API no guarda una que apunte adentro', async () => {
    const esc = escenario();
    const token = await cuenta(esc);
    const [c] = await esc.llamar('POST', '/api/push/suscripcion', {
      token, cuerpo: { suscripcion: { endpoint: 'https://127.0.0.1:3000/x', keys: { p256dh: 'k', auth: 'a' } } },
    });
    assert.equal(c, 400);
    const [c2, r2] = await esc.llamar('POST', '/api/push/suscripcion', {
      token, cuerpo: { suscripcion: { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'k', auth: 'a' } } },
    });
    assert.equal(c2, 200);
    assert.equal(r2.avisos, 1);
  });

  test('y si una mala quedó en la base de antes, no sale: se borra como vencida', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'push-'));
    try {
      const push = crearPush({ dirDatos: dir });
      const r = await push.enviar({ endpoint: 'https://127.0.0.1:3000/x', keys: { p256dh: 'k', auth: 'a' } }, { titulo: 'x' });
      assert.equal(r, 'vencida', 'ni siquiera intenta conectarse');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('la trastienda', () => {
  async function entrarConCodigo(esc, email) {
    await esc.llamar('POST', '/api/admin/codigo', { cuerpo: { email } });
    const codigo = esc.correo.enviados.at(-1)?.asunto.match(/^(\d{6})/)?.[1];
    const [c, r] = await esc.llamar('POST', '/api/admin/sesion', { cuerpo: { email, codigo } });
    assert.equal(c, 201);
    return r.token;
  }

  test('a quien se le saca el rol se le corta la sesión en el acto', async () => {
    /* Antes el rol se miraba sólo al entrar: la sesión seguía abierta doce
       horas aunque ya no fuera administradora. */
    const esc = panel();
    await cuenta(esc, { email: 'socia@ejemplo.com' });
    const socia = (await admin(esc, 'GET', '/api/admin/cuentas'))[1].cuentas.find((c) => c.email === 'socia@ejemplo.com');
    await admin(esc, 'PATCH', `/api/admin/cuentas/${socia.id}`, { rol: 'admin' });

    const sesion = await entrarConCodigo(esc, 'socia@ejemplo.com');
    assert.equal((await admin(esc, 'GET', '/api/admin/estado', null, sesion))[0], 200, 'entra');

    await admin(esc, 'PATCH', `/api/admin/cuentas/${socia.id}`, { rol: 'persona' });
    assert.equal((await admin(esc, 'GET', '/api/admin/estado', null, sesion))[0], 401, 'y en el pedido siguiente, afuera');
    assert.equal((await admin(esc, 'GET', '/api/admin/estado', null, sesion))[0], 401, 'y la sesión ya no existe');
  });

  test('un email aguanta un número fijo de códigos equivocados por día', async () => {
    /* Cinco intentos por código y cinco códigos cada diez minutos, desde
       muchas IPs, eran miles de intentos por día contra admin@, que se
       adivina. Ahora hay un techo diario por email. */
    const esc = panel();
    let fallos = 0;
    let ip = 0;
    while (fallos < ADMIN_FALLOS_DIA) {
      esc.reloj.t += 11 * 60 * 1000;                   /* pasa la ventana por IP y por código */
      ip += 1;
      await esc.llamar('POST', '/api/admin/codigo', { cuerpo: { email: DUENIO }, ip: `10.0.0.${ip}` });
      for (let k = 0; k < 5 && fallos < ADMIN_FALLOS_DIA; k++) {
        const [c] = await esc.llamar('POST', '/api/admin/sesion', { cuerpo: { email: DUENIO, codigo: '000000' }, ip: `10.0.1.${ip}` });
        if (c === 401) fallos += 1;
      }
    }
    /* Aunque ahora llegue el código bueno, desde otra IP: hoy no. */
    esc.reloj.t += 11 * 60 * 1000;
    await esc.llamar('POST', '/api/admin/codigo', { cuerpo: { email: DUENIO }, ip: '10.9.9.9' });
    const bueno = esc.correo.enviados.at(-1).asunto.match(/^(\d{6})/)[1];
    const [c, r] = await esc.llamar('POST', '/api/admin/sesion', { cuerpo: { email: DUENIO, codigo: bueno }, ip: '10.9.9.8' });
    assert.equal(c, 429);
    assert.ok(r.reintentar_en > 0);

    /* La clave del servidor sigue abriendo: el tope es para el código. */
    assert.equal((await esc.llamar('POST', '/api/admin/sesion', { cuerpo: { clave: ADMIN }, ip: '10.9.9.7' }))[0], 201);

    /* Y al día siguiente, el código vuelve a servir. */
    esc.reloj.t += 24 * 3600 * 1000;
    const otra = await entrarConCodigo(esc, DUENIO);
    assert.ok(otra);
  });
});

describe('lo que se ve desde afuera', () => {
  test('/api/salud afuera dice que está vivo, y nada del negocio', async () => {
    const esc = escenario();
    const [, afuera] = await esc.api.manejar({ metodo: 'GET', ruta: '/api/salud', headers: {}, ip: '8.8.8.8' });
    assert.deepEqual(Object.keys(afuera).sort(), ['esquema', 'ok', 'version']);
    const [, adentro] = await esc.api.manejar({ metodo: 'GET', ruta: '/api/salud', headers: {}, ip: '127.0.0.1', local: true });
    assert.ok('cuentas' in adentro && 'lecturas' in adentro, 'desde el mismo servidor, todo');
  });

  test('la IP para los límites: X-Forwarded-For sólo si viene del proxy local, y el último salto', () => {
    const pedido = (par, xff) => ({ socket: { remoteAddress: par }, headers: xff ? { 'x-forwarded-for': xff } : {} });
    assert.equal(ipDelPedido(pedido('127.0.0.1', '203.0.113.9')), '203.0.113.9', 'detrás de Caddy');
    assert.equal(ipDelPedido(pedido('127.0.0.1', '1.1.1.1, 203.0.113.9')), '203.0.113.9', 'el primero lo inventa el cliente');
    assert.equal(ipDelPedido(pedido('198.51.100.4', '1.1.1.1')), '198.51.100.4', 'sin proxy, el encabezado no vale nada');
    assert.equal(ipDelPedido(pedido('::1', '')), '::1');
    assert.ok(esLocalDirecto(pedido('127.0.0.1')), 'un curl en el servidor');
    assert.ok(!esLocalDirecto(pedido('127.0.0.1', '203.0.113.9')), 'lo que pasa por Caddy no es local');
    assert.ok(!esLocalDirecto(pedido('198.51.100.4')));
  });

  test('un error inesperado no devuelve su mensaje, y la trastienda no se indexa', async () => {
    const api = { manejar: async () => { throw new Error("ENOENT: no such file, open '/var/lib/root-lab/secreto'"); } };
    const servidor = crearServidorHttp({ api, raiz: RAIZ, base: '/rootkit' });
    await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
    const url = `http://127.0.0.1:${servidor.address().port}`;
    const errores = [];
    const original = console.error;
    console.error = (e) => errores.push(e);
    try {
      /* La API ya se cuida sola; esto es el transporte, con un error que no
         pasó por ella (un archivo que falta, un disco lleno). */
      const r = await fetch(`${url}/rootkit/api/config`);
      const cuerpo = await r.text();
      assert.equal(r.status, 500);
      assert.ok(!cuerpo.includes('/var/lib'), 'la ruta del disco no sale');
      assert.equal(r.headers.get('x-robots-tag'), 'noindex, nofollow');
      assert.equal(errores.length, 1, 'pero queda en el log');

      const panel = await fetch(`${url}/rootkit/admin/`);
      assert.equal(panel.headers.get('x-robots-tag'), 'noindex, nofollow');
      const app = await fetch(`${url}/rootkit/`);
      assert.equal(app.headers.get('x-robots-tag'), null, 'la app sí se puede encontrar');
    } finally {
      console.error = original;
      servidor.close();
    }
  });
});

describe('los aparatos', () => {
  test('un emulador no se queda con la MAC de una placa de fábrica', async () => {
    /* Quien adivine las MAC que van a salir podía registrarlas antes como
       emuladores y vincularlas: la fábrica recibía 409 y la placa de verdad
       quedaba afuera para siempre. */
    const esc = panel({ tofu: 'emulador' });
    const intruso = aparato(esc, { id: 'A0B1C2D3E4F5', placa: 'emulador' });
    assert.equal((await intruso.sync())[0], 200);
    const token = await cuenta(esc);
    const [cv] = await esc.llamar('POST', '/api/vinculo', { token, cuerpo: { codigo: intruso.codigo } });
    assert.ok(cv === 200 || cv === 201, `se vincula (${cv})`);
    assert.ok(esc.db.dispositivo('A0B1C2D3E4F5').planta, 'el emulador quedó con planta');

    const placa = aparato(esc, { id: 'A0B1C2D3E4F5' });
    const [cf] = await admin(esc, 'POST', '/api/admin/aparatos', { id: 'A0B1C2D3E4F5', token: placa.token, persona: 'brote', lote: 'L1' });
    assert.equal(cf, 200, 'la fábrica manda');
    const d = esc.db.dispositivo('A0B1C2D3E4F5');
    assert.equal(d.origen, 'fabrica');
    assert.equal(d.planta, null, 'la planta del emulador se soltó');
    assert.equal((await intruso.sync())[0], 401, 'y el emulador ya no entra');
    assert.equal((await placa.sync())[0], 200, 'la placa de verdad sí');
  });

  test('pero una placa que ya es de alguien no se pisa', async () => {
    const esc = panel({ tofu: true });
    const vieja = aparato(esc, { id: 'B0B1C2D3E4F5' });
    await vieja.sync();
    const token = await cuenta(esc);
    await esc.llamar('POST', '/api/vinculo', { token, cuerpo: { codigo: vieja.codigo } });
    const otra = aparato(esc, { id: 'B0B1C2D3E4F5' });
    const [c] = await admin(esc, 'POST', '/api/admin/aparatos', { id: 'B0B1C2D3E4F5', token: otra.token, persona: 'brote' });
    assert.equal(c, 409);
  });
});

describe('el navegador', () => {
  test('h() no tiene puerta a innerHTML', () => {
    /* Un document mínimo: alcanza con que exista createElement. */
    const antes = globalThis.document;
    let escrito = null;
    globalThis.document = {
      createElement: () => ({ dataset: {}, set innerHTML(v) { escrito = v; }, setAttribute() {}, addEventListener() {}, append() {} }),
    };
    try {
      assert.throws(() => h('div', { html: '<img src=x onerror=alert(1)>' }), /innerHTML/);
      assert.equal(escrito, null, 'y no llegó a escribir nada');
    } finally {
      globalThis.document = antes;
    }
  });

  test('nada en public/ ni en admin/ escribe HTML crudo', () => {
    const PROHIBIDO = /\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML\s*\(|document\.write\s*\(|\beval\s*\(|new Function\s*\(/;
    const revisar = (dir) => {
      for (const n of readdirSync(dir)) {
        const ruta = join(dir, n);
        if (statSync(ruta).isDirectory()) { revisar(ruta); continue; }
        if (!/\.(m?js|html)$/.test(n)) continue;
        /* Los comentarios pueden nombrar lo prohibido; el código no. */
        const codigo = readFileSync(ruta, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
        const lineas = codigo.split('\n').filter((l) => PROHIBIDO.test(l));
        /* La única excepción es el cerrojo de h(), que tira un error. */
        const reales = lineas.filter((l) => !l.includes("throw new Error('h(): innerHTML"));
        assert.deepEqual(reales, [], `${ruta.slice(RAIZ.length)}`);
      }
    };
    revisar(join(RAIZ, 'public'));
    revisar(join(RAIZ, 'admin'));
  });
});
