/* index.mjs — el servidor de root-lab.
 *
 *   npm start                     http://localhost:8080
 *   PORT=9000 npm start
 *
 * Sirve tres cosas desde el mismo proceso:
 *
 *   /             la app (public/), instalable como PWA
 *   /v/<CÓDIGO>   la misma app, entrando por el QR de un ROOTKIT
 *   /emulador/    un ROOTKIT virtual para recorrer el flujo sin placa
 *   /api/...      la API de la app y la de los aparatos (server/api.mjs)
 *
 * Configuración por variables de entorno o un archivo .env (ver
 * .env.example). Nada es obligatorio para desarrollar.
 */
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { crearAlmacen } from './almacen.mjs';
import { crearApi } from './api.mjs';
import { crearIA } from './ia.mjs';
import { crearPush } from './push.mjs';

const RAIZ = resolve(fileURLToPath(new URL('..', import.meta.url)));

/* ---------------------------------------------------------------- .env --- */
function cargarEnv(archivo) {
  if (!existsSync(archivo)) return;
  for (const linea of readFileSync(archivo, 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}
cargarEnv(join(RAIZ, '.env'));

const PUERTO = Number(process.env.PORT) || 8080;
const DATOS = resolve(RAIZ, process.env.ROOTLAB_DATOS || 'data');
const VERSION = JSON.parse(readFileSync(join(RAIZ, 'package.json'), 'utf8')).version;

/* La URL que va en el QR y que abre el teléfono. En la red de la casa es la
   IP de esta PC; detrás de un túnel HTTPS o en producción, la que se configure. */
function ipLocal() {
  for (const lista of Object.values(networkInterfaces())) {
    for (const i of lista || []) {
      if (i.family === 'IPv4' && !i.internal && !i.address.startsWith('169.254.')) return i.address;
    }
  }
  return 'localhost';
}
const URL_PUBLICA = (process.env.ROOTLAB_URL_PUBLICA || `http://${ipLocal()}:${PUERTO}`).replace(/\/+$/, '');

/* ---------------------------------------------------------------- piezas -- */
const almacen = crearAlmacen({ archivo: join(DATOS, 'rootlab.json') });
const ia = crearIA();
let push = null;
try {
  push = crearPush({ dirDatos: DATOS });
} catch (e) {
  console.warn(`notificaciones desactivadas: ${e.message}`);
}
const api = crearApi({
  almacen, ia, push,
  tofu: process.env.ROOTLAB_TOFU !== '0',
  urlPublica: () => URL_PUBLICA,
  version: VERSION,
});

/* --------------------------------------------------------------- estático -- */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
};

async function servirArchivo(res, base, ruta) {
  const limpia = normalize(decodeURIComponent(ruta)).replace(/^([/\\]*\.\.[/\\])+/, '');
  const archivo = join(base, limpia);
  if (!archivo.startsWith(base)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const s = await stat(archivo);
    if (s.isDirectory()) return servirArchivo(res, base, join(limpia, 'index.html'));
    const datos = await readFile(archivo);
    res.writeHead(200, {
      'content-type': MIME[extname(archivo)] || 'application/octet-stream',
      /* El service worker se ocupa del caché del armazón; el navegador
         siempre revalida, así una versión nueva llega en la próxima carga. */
      'cache-control': extname(archivo) === '.png' ? 'public, max-age=86400' : 'no-cache',
    });
    res.end(datos);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('no encontrado');
  }
}

/* El manifest se arma por pedido: si la app se instala entrando por el QR,
   el ícono de inicio abre directo en ese código. En iPhone la app instalada
   no comparte almacenamiento con Safari, y así no pierde el hilo. */
async function servirManifest(res, url) {
  const base = JSON.parse(await readFile(join(RAIZ, 'public', 'manifest.webmanifest'), 'utf8'));
  const codigo = String(url.searchParams.get('codigo') || '').toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 8);
  if (codigo.length === 8) base.start_url = `/v/${codigo}`;
  res.writeHead(200, { 'content-type': MIME['.webmanifest'], 'cache-control': 'no-cache' });
  res.end(JSON.stringify(base));
}

/* ------------------------------------------------------------------ http --- */
const LIMITE_CUERPO = 8 * 1024 * 1024;

function leerCuerpo(req) {
  return new Promise((ok, mal) => {
    const partes = [];
    let largo = 0;
    req.on('data', (c) => {
      largo += c.length;
      if (largo > LIMITE_CUERPO) {
        mal(Object.assign(new Error('El pedido es demasiado grande'), { codigo: 413 }));
        req.destroy();
        return;
      }
      partes.push(c);
    });
    req.on('end', () => {
      if (!largo) return ok(null);
      try { ok(JSON.parse(Buffer.concat(partes).toString('utf8'))); } catch {
        mal(Object.assign(new Error('JSON inválido'), { codigo: 400 }));
      }
    });
    req.on('error', mal);
  });
}

const servidor = createServer(async (req, res) => {
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('referrer-policy', 'no-referrer');
  const url = new URL(req.url, 'http://localhost');
  const ruta = url.pathname;

  try {
    if (ruta.startsWith('/api/')) {
      const cuerpo = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method) ? await leerCuerpo(req) : null;
      const [codigo, respuesta] = await api.manejar({
        metodo: req.method,
        ruta,
        query: Object.fromEntries(url.searchParams),
        cuerpo,
        headers: req.headers,
        ip: req.socket.remoteAddress || '',
      });
      if (codigo === 204 || respuesta === null) {
        res.writeHead(codigo).end();
        return;
      }
      const s = JSON.stringify(respuesta);
      res.writeHead(codigo, { 'content-type': MIME['.json'], 'cache-control': 'no-store' });
      res.end(s);
      return;
    }
    if (ruta === '/manifest.webmanifest') return servirManifest(res, url);
    if (/^\/v\/[^/]+\/?$/i.test(ruta)) return servirArchivo(res, join(RAIZ, 'public'), '/index.html');
    if (ruta === '/emulador') {
      res.writeHead(301, { location: '/emulador/' }).end();
      return;
    }
    if (ruta.startsWith('/emulador/')) {
      return servirArchivo(res, join(RAIZ, 'emulador'), ruta.slice('/emulador'.length));
    }
    return servirArchivo(res, join(RAIZ, 'public'), ruta === '/' ? '/index.html' : ruta);
  } catch (e) {
    const codigo = e.codigo || 500;
    res.writeHead(codigo, { 'content-type': MIME['.json'] }).end(JSON.stringify({ error: e.message }));
  }
});

servidor.listen(PUERTO, '0.0.0.0', () => {
  console.log(`\n  root-lab ${VERSION}`);
  console.log(`  app        http://localhost:${PUERTO}`);
  console.log(`  emulador   http://localhost:${PUERTO}/emulador/`);
  console.log(`  en la red  ${URL_PUBLICA}   (lo que va en el QR)`);
  console.log(`  IA         ${ia.proveedor}${ia.modelo ? ` (${ia.modelo})` : ' — definí ANTHROPIC_API_KEY para usar Claude'}`);
  console.log(`  avisos     ${push ? 'web push listo' : 'desactivados'}`);
  console.log(`  datos      ${DATOS}\n`);
});

const temporizador = setInterval(() => { api.revisar().catch(() => {}); }, 10 * 60 * 1000);
temporizador.unref();

for (const senal of ['SIGINT', 'SIGTERM']) {
  process.on(senal, () => {
    almacen.volcar();
    process.exit(0);
  });
}
