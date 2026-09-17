/* http.mjs — el transporte: archivos estáticos, rutas de la app y la API.
 *
 * MONTADA EN UNA SUBRUTA
 *
 * La app puede vivir en la raíz de un dominio (`https://rootkit.app/`) o
 * debajo de una ruta de un sitio que ya existe
 * (`https://ifbotech.com/rootkit/`). La base se configura con
 * ROOTLAB_BASE y este archivo la resuelve en un solo lugar:
 *
 *   - Quita la base de cada pedido, sin importar mayúsculas: el QR del
 *     firmware va entero en mayúsculas (HTTPS://IFBOTECH.COM/ROOTKIT/V/...)
 *     para entrar en el modo alfanumérico, y tiene que llegar igual.
 *   - Acepta también pedidos sin la base, para que funcione tanto detrás de
 *     un proxy que la conserva como de uno que la quita.
 *   - Escribe `<base href>` en las páginas: el resto de la app usa rutas
 *     relativas y no sabe dónde está montada.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

import { crearCacheComprimidos, elegirCodificacion, etagDe, coincide, seComprime } from './estatico.mjs';

export const MIME = {
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
  '.txt': 'text/plain; charset=utf-8',
};

const LIMITE_CUERPO = 8 * 1024 * 1024;

/* Cabeceras de seguridad en TODAS las respuestas.
 *
 * La política de contenido es estricta porque la app no carga nada de
 * terceros: fuentes, íconos, módulos y el renderer de caras se sirven desde
 * acá. Scripts sólo del mismo origen ('wasm-unsafe-eval' es lo mínimo para
 * instanciar WebAssembly; no habilita eval de JavaScript). Estilos en línea
 * sí, porque las vistas pintan colores de Rooties en atributos `style`; eso
 * no ejecuta código. Nadie puede meter la app en un iframe.
 *
 * HSTS lo pone el proxy (Caddy), que es quien termina HTTPS. */
export const CABECERAS_SEGURIDAD = {
  'content-security-policy': [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "manifest-src 'self'",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; '),
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
  'permissions-policy': 'camera=(self), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
};

/** "/rootkit/" -> "/rootkit"; "" y "/" -> "". */
export function normalizarBase(b) {
  const s = String(b || '').trim().replace(/\/+$/, '');
  if (!s) return '';
  return s.startsWith('/') ? s : `/${s}`;
}

/**
 * Quita la base de una ruta. Devuelve null si la ruta es exactamente la
 * base sin barra final (hay que redirigir).
 */
export function quitarBase(ruta, base) {
  if (!base) return ruta;
  const minus = ruta.toLowerCase();
  const b = base.toLowerCase();
  if (minus === b) return null;
  if (minus.startsWith(`${b}/`)) return ruta.slice(base.length);
  return ruta;
}

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

export function crearServidorHttp({ api, raiz, base = '', registro = null }) {
  const BASE = normalizarBase(base);
  const PUBLICO = join(raiz, 'public');
  const EMULADOR = join(raiz, 'emulador');
  /* La trastienda: el panel de quien hace el producto (docs/trastienda.md).
     Vive aparte de la app, como el emulador, y no se ve sin la clave de
     administración: la página carga y lo primero que hay es una puerta. */
  const ADMIN = join(raiz, 'admin');
  const comprimidos = crearCacheComprimidos();

  /**
   * Manda un cuerpo con su etiqueta y, si el cliente entiende, comprimido.
   *
   * La etiqueta sale del cuerpo sin comprimir, así que no depende de con qué
   * se comprimió; y es la clave de la caché de comprimidos, así que dos
   * respuestas iguales se comprimen una sola vez. Si el navegador dice que ya
   * tiene esa etiqueta, se va con `304` y sin cuerpo.
   */
  function responder(req, res, { codigo = 200, tipo, datos, cache, firma }) {
    const buf = Buffer.isBuffer(datos) ? datos : Buffer.from(String(datos), 'utf8');
    /* Casi siempre la etiqueta es el cuerpo mismo. Una ruta que sabe qué de
       su respuesta es "lo mismo" aunque los bytes cambien manda su firma. */
    const etag = etagDe(firma === undefined ? buf : firma);
    const cabeceras = { 'content-type': tipo, 'cache-control': cache, etag };
    const leyendo = req.method === 'GET' || req.method === 'HEAD';

    if (leyendo && codigo === 200 && coincide(req.headers['if-none-match'], etag)) {
      if (seComprime(tipo)) cabeceras.vary = 'accept-encoding';
      res.writeHead(304, cabeceras).end();
      return;
    }
    let cuerpo = buf;
    if (seComprime(tipo)) {
      cabeceras.vary = 'accept-encoding';
      const codificacion = elegirCodificacion(req.headers['accept-encoding']);
      const comprimido = comprimidos.obtener(etag, buf, codificacion);
      if (comprimido) {
        cuerpo = comprimido;
        cabeceras['content-encoding'] = codificacion;
      }
    }
    cabeceras['content-length'] = cuerpo.length;
    res.writeHead(codigo, cabeceras);
    res.end(req.method === 'HEAD' ? undefined : cuerpo);
  }

  async function pagina(req, res, archivo) {
    const html = (await readFile(archivo, 'utf8'))
      .replace('<base href="/">', `<base href="${BASE}/">`);
    responder(req, res, { tipo: MIME['.html'], datos: html, cache: 'no-cache' });
  }

  async function archivo(req, res, dir, ruta) {
    let limpia;
    try {
      limpia = normalize(decodeURIComponent(ruta)).replace(/^([/\\]*\.\.[/\\])+/, '');
    } catch {
      res.writeHead(400).end();
      return;
    }
    const destino = join(dir, limpia);
    if (!destino.startsWith(dir)) {
      res.writeHead(403).end();
      return;
    }
    try {
      const s = await stat(destino);
      if (s.isDirectory()) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('no encontrado');
        return;
      }
      const datos = await readFile(destino);
      responder(req, res, {
        tipo: MIME[extname(destino)] || 'application/octet-stream',
        datos,
        /* El service worker maneja el caché del armazón; el navegador siempre
           revalida, y con la etiqueta esa revalidación termina en un `304`
           vacío en vez de bajar el archivo de nuevo. */
        cache: ['.png', '.woff2'].includes(extname(destino)) ? 'public, max-age=604800' : 'no-cache',
      });
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('no encontrado');
    }
  }

  /* El manifest se arma por pedido: si la app se instala entrando por el QR,
     el ícono de inicio abre directo en ese código. En iPhone la app instalada
     no comparte almacenamiento con Safari, y así no pierde el hilo. Las rutas
     son relativas al manifest, así que funcionan con cualquier base. */
  async function manifest(req, res, url) {
    const m = JSON.parse(await readFile(join(PUBLICO, 'manifest.webmanifest'), 'utf8'));
    const codigo = String(url.searchParams.get('codigo') || '').toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 8);
    if (codigo.length === 8) m.start_url = `v/${codigo}`;
    responder(req, res, { tipo: MIME['.webmanifest'], datos: JSON.stringify(m), cache: 'no-cache' });
  }

  return createServer(async (req, res) => {
    for (const [k, v] of Object.entries(CABECERAS_SEGURIDAD)) res.setHeader(k, v);
    /* La ruta que se anota es la que queda DESPUÉS de sacar la base: detrás
       del proxy todo llega como /rootkit/api/..., y sin esto la API entera se
       anotaba como "estático". Se lee al terminar, cuando ya se calculó. */
    let rutaAnotada = req.url;
    if (registro) {
      const empezo = Date.now();
      res.once('finish', () => registro.anotar({
        metodo: req.method, ruta: rutaAnotada, codigo: res.statusCode, ms: Date.now() - empezo,
      }));
    }

    let url;
    try {
      url = new URL(req.url, 'http://localhost');
    } catch {
      res.writeHead(400).end();
      return;
    }
    const ruta = quitarBase(url.pathname, BASE);
    if (ruta !== null) rutaAnotada = ruta;
    if (ruta === null) {
      res.writeHead(301, { location: `${BASE}/${url.search}` }).end();
      return;
    }

    try {
      if (ruta.startsWith('/api/')) {
        const cuerpo = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method) ? await leerCuerpo(req) : null;
        const [codigo, respuesta, pistas] = await api.manejar({
          metodo: req.method,
          ruta,
          query: Object.fromEntries(url.searchParams),
          cuerpo,
          headers: req.headers,
          ip: String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim(),
        });
        /* Un `429` dice tambien cuando volver: un aparato o un telefono
           bien educado espera en vez de insistir. */
        if (codigo === 429 && Number.isFinite(respuesta?.reintentar_en)) {
          res.setHeader('retry-after', String(Math.max(1, respuesta.reintentar_en)));
        }
        if (codigo === 204 || respuesta === null) {
          res.writeHead(codigo).end();
          return;
        }
        /* Una respuesta binaria (las fotos del álbum) va tal cual. */
        if (respuesta && respuesta.binario) {
          res.writeHead(codigo, {
            'content-type': respuesta.mime || 'application/octet-stream',
            'content-length': respuesta.binario.length,
            'cache-control': respuesta.cache || 'private, no-store',
          });
          res.end(respuesta.binario);
          return;
        }
        /* La API sigue con `no-store`: el navegador no guarda nada en disco.
           La etiqueta igual viaja, y la app la repite a mano en la próxima
           lectura (public/lib/api.mjs): el tablero que no cambió vuelve como
           un `304` vacío en vez de todo el JSON, cada quince segundos. */
        responder(req, res, {
          codigo, tipo: MIME['.json'], datos: JSON.stringify(respuesta), cache: 'no-store', firma: pistas?.firma,
        });
        return;
      }
      /* /v/<código> (el QR), /desk/<id> (el modo escritorio) y
         /sitter/<token> (el cuidador) son la app. */
      if (ruta === '/' || ruta === '/index.html' || /^\/(v|desk|sitter)\/[^/]+\/?$/i.test(ruta)) {
        return await pagina(req, res, join(PUBLICO, 'index.html'));
      }
      if (ruta === '/manifest.webmanifest') return await manifest(req, res, url);
      if (/^\/admin\/?$/i.test(ruta)) {
        if (!ruta.endsWith('/')) {
          res.writeHead(301, { location: `${BASE}/admin/` }).end();
          return;
        }
        return await pagina(req, res, join(ADMIN, 'index.html'));
      }
      if (ruta.toLowerCase().startsWith('/admin/')) {
        return await archivo(req, res, ADMIN, ruta.slice('/admin'.length));
      }
      if (/^\/emulador\/?$/i.test(ruta)) {
        if (!ruta.endsWith('/')) {
          res.writeHead(301, { location: `${BASE}/emulador/` }).end();
          return;
        }
        return await pagina(req, res, join(EMULADOR, 'index.html'));
      }
      if (ruta.toLowerCase().startsWith('/emulador/')) {
        return await archivo(req, res, EMULADOR, ruta.slice('/emulador'.length));
      }
      return await archivo(req, res, PUBLICO, ruta);
    } catch (e) {
      res.writeHead(e.codigo || 500, { 'content-type': MIME['.json'] })
        .end(JSON.stringify({ error: e.message }));
    }
  });
}
