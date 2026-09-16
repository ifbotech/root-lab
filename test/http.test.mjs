/* El transporte HTTP, montado en una subruta.
 *
 * En el VPS la app vive en https://ifbotech.com/rootkit/, detrás del Caddy
 * que sirve el resto del sitio. Estas pruebas levantan el servidor de verdad
 * en un puerto libre y le piden lo que le va a pedir el mundo: la app, el QR
 * en mayúsculas del firmware, el emulador, el manifest y la API, con y sin
 * la base adelante.
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

import { crearServidorHttp, normalizarBase, quitarBase } from '../server/http.mjs';
import { crearApi } from '../server/api.mjs';
import { abrirBase } from '../server/db.mjs';
import { crearIA } from '../server/ia.mjs';

const RAIZ = resolve(fileURLToPath(new URL('..', import.meta.url)));

function levantar(base) {
  const api = crearApi({ db: abrirBase(), ia: crearIA({ clave: '' }), version: 'prueba' });
  const servidor = crearServidorHttp({ api, raiz: RAIZ, base });
  return new Promise((ok) => {
    servidor.listen(0, '127.0.0.1', () => ok({ servidor, url: `http://127.0.0.1:${servidor.address().port}` }));
  });
}

const pedir = (url, op = {}) => fetch(url, { redirect: 'manual', ...op });

describe('la base', () => {
  test('se normaliza', () => {
    assert.equal(normalizarBase(''), '');
    assert.equal(normalizarBase('/'), '');
    assert.equal(normalizarBase('rootkit'), '/rootkit');
    assert.equal(normalizarBase('/rootkit/'), '/rootkit');
  });

  test('se quita sin importar mayúsculas', () => {
    assert.equal(quitarBase('/rootkit/api/x', '/rootkit'), '/api/x');
    assert.equal(quitarBase('/ROOTKIT/V/ABC', '/rootkit'), '/V/ABC');
    assert.equal(quitarBase('/rootkit', '/rootkit'), null, 'sin barra: hay que redirigir');
    assert.equal(quitarBase('/api/x', '/rootkit'), '/api/x', 'un proxy que ya la quitó');
    assert.equal(quitarBase('/rootkitx/y', '/rootkit'), '/rootkitx/y', 'no se confunde con un prefijo');
    assert.equal(quitarBase('/a', ''), '/a');
  });
});

describe('servidor en /rootkit', () => {
  let s;
  before(async () => { s = await levantar('/rootkit'); });
  after(() => s.servidor.close());

  test('sin barra final redirige a la base', async () => {
    const r = await pedir(`${s.url}/rootkit`);
    assert.equal(r.status, 301);
    assert.equal(r.headers.get('location'), '/rootkit/');
  });

  test('la app declara su base', async () => {
    const r = await pedir(`${s.url}/rootkit/`);
    assert.equal(r.status, 200);
    const html = await r.text();
    assert.match(html, /<base href="\/rootkit\/">/);
    assert.doesNotMatch(html.replace(/<base [^>]*>/, ''), /(href|src)="\/(?!\/)/, 'ninguna ruta absoluta a la raíz del dominio');
  });

  test('el QR del firmware, todo en mayúsculas, abre la app', async () => {
    const r = await pedir(`${s.url}/ROOTKIT/V/K7Q2M9XA`);
    assert.equal(r.status, 200);
    assert.match(await r.text(), /<base href="\/rootkit\/">/);
    assert.equal((await pedir(`${s.url}/rootkit/v/k7q2m9xa`)).status, 200);
    const desk = await pedir(`${s.url}/rootkit/desk/abc123`);
    assert.equal(desk.status, 200, 'el modo escritorio es la misma app');
    assert.match(await desk.text(), /<base href="\/rootkit\/">/);
    assert.equal((await pedir(`${s.url}/rootkit/sitter/abcdefghijklmnop`)).status, 200, 'el enlace del cuidador también');
  });

  test('la API responde con la base y sin ella', async () => {
    const con = await (await pedir(`${s.url}/rootkit/api/config`)).json();
    const sin = await (await pedir(`${s.url}/api/config`)).json();
    assert.equal(con.version, 'prueba');
    assert.deepEqual(con, sin);
    const salud = await (await pedir(`${s.url}/rootkit/api/salud`)).json();
    assert.equal(salud.ok, true);
  });

  test('la API recibe cuerpos y devuelve errores legibles', async () => {
    const r = await pedir(`${s.url}/rootkit/api/cuenta/registro`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: '{"email":"http@ejemplo.com","clave":"una clave segura","tz":"America/Argentina/Buenos_Aires"}',
    });
    assert.equal(r.status, 201);
    assert.ok((await r.json()).token);
    const mal = await pedir(`${s.url}/rootkit/api/cuenta/registro`, { method: 'POST', body: '{roto' });
    assert.equal(mal.status, 400);
    assert.match((await mal.json()).error, /JSON/);
  });

  test('el emulador vive debajo de la base', async () => {
    const r = await pedir(`${s.url}/rootkit/emulador`);
    assert.equal(r.status, 301);
    assert.equal(r.headers.get('location'), '/rootkit/emulador/');
    const html = await (await pedir(`${s.url}/rootkit/emulador/`)).text();
    assert.match(html, /<base href="\/rootkit\/">/);
    const js = await pedir(`${s.url}/rootkit/emulador/emulador.mjs`);
    assert.equal(js.status, 200);
    assert.match(js.headers.get('content-type'), /javascript/);
  });

  test('el manifest abre en el código del QR, con rutas relativas', async () => {
    const m = await (await pedir(`${s.url}/rootkit/manifest.webmanifest?codigo=k7q2m9xa`)).json();
    assert.equal(m.start_url, 'v/K7Q2M9XA');
    assert.equal(m.scope, './');
    assert.ok(m.icons.every((i) => !i.src.startsWith('/')));
    const atajos = m.shortcuts.map((a) => a.name);
    for (const a of ['Regar', 'Ver cámara', 'Charla']) assert.ok(atajos.includes(a), `atajo ${a}`);
    assert.ok(m.shortcuts.every((a) => a.url.startsWith('./#')), 'atajos relativos');
  });

  test('los recursos salen con su tipo', async () => {
    const w = await pedir(`${s.url}/rootkit/caras/rootkit_caras.wasm`);
    assert.equal(w.headers.get('content-type'), 'application/wasm');
    const sw = await pedir(`${s.url}/rootkit/sw.js`);
    assert.equal(sw.status, 200);
  });

  test('toda respuesta lleva las cabeceras de seguridad', async () => {
    for (const ruta of ['/rootkit/', '/rootkit/api/config', '/rootkit/style.css', '/rootkit/nada.js', '/rootkit/emulador/']) {
      const r = await pedir(`${s.url}${ruta}`);
      const csp = r.headers.get('content-security-policy');
      assert.match(csp, /default-src 'self'/, ruta);
      assert.match(csp, /frame-ancestors 'none'/, ruta);
      assert.ok(!/unsafe-eval'/.test(csp.replace("'wasm-unsafe-eval'", '')), 'no hay eval de JavaScript');
      assert.equal(r.headers.get('x-frame-options'), 'DENY');
      assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(r.headers.get('referrer-policy'), 'no-referrer');
    }
  });

  test('la app no pide nada a terceros', async () => {
    const html = await (await pedir(`${s.url}/rootkit/`)).text();
    const css = await (await pedir(`${s.url}/rootkit/style.css`)).text();
    const emu = await (await pedir(`${s.url}/rootkit/emulador/`)).text();
    for (const texto of [html, css, emu]) {
      assert.ok(!/https?:\/\/(?!www\.w3\.org)/.test(texto.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '')), 'sin URLs externas');
    }
    const fuente = await pedir(`${s.url}/rootkit/fuentes/nunito-latin.woff2`);
    assert.equal(fuente.status, 200);
    assert.equal(fuente.headers.get('content-type'), 'font/woff2');
  });

  test('no se sale de la carpeta pública', async () => {
    for (const intento of ['/rootkit/../package.json', '/rootkit/%2e%2e/server/api.mjs', '/rootkit/..%2f..%2fpackage.json']) {
      const r = await pedir(`${s.url}${intento}`);
      assert.ok([400, 403, 404].includes(r.status), `${intento} -> ${r.status}`);
    }
    assert.equal((await pedir(`${s.url}/rootkit/nada.js`)).status, 404);
  });
});

describe('respuestas binarias', () => {
  test('una respuesta { binario, mime } sale tal cual, con su tipo', async () => {
    const api = { manejar: async ({ ruta }) => (ruta === '/api/foto' ? [200, { binario: Buffer.from('\xff\xd8abc', 'latin1'), mime: 'image/jpeg', cache: 'private, max-age=60' }] : [404, { error: 'no' }]) };
    const servidor = crearServidorHttp({ api, raiz: RAIZ, base: '/rootkit' });
    const url = await new Promise((ok) => servidor.listen(0, '127.0.0.1', () => ok(`http://127.0.0.1:${servidor.address().port}`)));
    try {
      const r = await pedir(`${url}/rootkit/api/foto`);
      assert.equal(r.status, 200);
      assert.equal(r.headers.get('content-type'), 'image/jpeg');
      assert.equal(r.headers.get('cache-control'), 'private, max-age=60');
      assert.equal(r.headers.get('content-length'), '5');
      assert.equal(Buffer.from(await r.arrayBuffer()).toString('latin1'), '\xff\xd8abc');
      assert.equal((await pedir(`${url}/rootkit/api/otra`)).status, 404);
    } finally {
      servidor.close();
    }
  });
});

describe('servidor en la raíz', () => {
  let s;
  before(async () => { s = await levantar(''); });
  after(() => s.servidor.close());

  test('la base es la raíz', async () => {
    const html = await (await pedir(`${s.url}/`)).text();
    assert.match(html, /<base href="\/">/);
    assert.equal((await pedir(`${s.url}/v/K7Q2M9XA`)).status, 200);
    assert.equal((await pedir(`${s.url}/desk/abc123`)).status, 200);
    assert.equal((await pedir(`${s.url}/api/config`)).status, 200);
  });
});
