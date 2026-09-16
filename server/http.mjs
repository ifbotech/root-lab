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

export function crearServidorHttp({ api, raiz, base = '' }) {
  const BASE = normalizarBase(base);
  const PUBLICO = join(raiz, 'public');
  const EMULADOR = join(raiz, 'emulador');

  async function pagina(res, archivo) {
    const html = (await readFile(archivo, 'utf8'))
      .replace('<base href="/">', `<base href="${BASE}/">`);
    res.writeHead(200, { 'content-type': MIME['.html'], 'cache-control': 'no-cache' });
    res.end(html);
  }

  async function archivo(res, dir, ruta) {
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
      res.writeHead(200, {
        'content-type': MIME[extname(destino)] || 'application/octet-stream',
        /* El service worker maneja el caché del armazón; el navegador siempre
           revalida, así una versión nueva llega en la próxima carga. */
        'cache-control': ['.png', '.woff2'].includes(extname(destino)) ? 'public, max-age=604800' : 'no-cache',
      });
      res.end(datos);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('no encontrado');
    }
  }

  /* El manifest se arma por pedido: si la app se instala entrando por el QR,
     el ícono de inicio abre directo en ese código. En iPhone la app instalada
     no comparte almacenamiento con Safari, y así no pierde el hilo. Las rutas
     son relativas al manifest, así que funcionan con cualquier base. */
  async function manifest(res, url) {
    const m = JSON.parse(await readFile(join(PUBLICO, 'manifest.webmanifest'), 'utf8'));
    const codigo = String(url.searchParams.get('codigo') || '').toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 8);
    if (codigo.length === 8) m.start_url = `v/${codigo}`;
    res.writeHead(200, { 'content-type': MIME['.webmanifest'], 'cache-control': 'no-cache' });
    res.end(JSON.stringify(m));
  }

  return createServer(async (req, res) => {
    for (const [k, v] of Object.entries(CABECERAS_SEGURIDAD)) res.setHeader(k, v);

    let url;
    try {
      url = new URL(req.url, 'http://localhost');
    } catch {
      res.writeHead(400).end();
      return;
    }
    const ruta = quitarBase(url.pathname, BASE);
    if (ruta === null) {
      res.writeHead(301, { location: `${BASE}/${url.search}` }).end();
      return;
    }

    try {
      if (ruta.startsWith('/api/')) {
        const cuerpo = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method) ? await leerCuerpo(req) : null;
        const [codigo, respuesta] = await api.manejar({
          metodo: req.method,
          ruta,
          query: Object.fromEntries(url.searchParams),
          cuerpo,
          headers: req.headers,
          ip: String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim(),
        });
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
        res.writeHead(codigo, { 'content-type': MIME['.json'], 'cache-control': 'no-store' });
        res.end(JSON.stringify(respuesta));
        return;
      }
      /* /v/<código> (el QR), /desk/<id> (el modo escritorio) y
         /sitter/<token> (el cuidador) son la app. */
      if (ruta === '/' || ruta === '/index.html' || /^\/(v|desk|sitter)\/[^/]+\/?$/i.test(ruta)) {
        return await pagina(res, join(PUBLICO, 'index.html'));
      }
      if (ruta === '/manifest.webmanifest') return await manifest(res, url);
      if (/^\/emulador\/?$/i.test(ruta)) {
        if (!ruta.endsWith('/')) {
          res.writeHead(301, { location: `${BASE}/emulador/` }).end();
          return;
        }
        return await pagina(res, join(EMULADOR, 'index.html'));
      }
      if (ruta.toLowerCase().startsWith('/emulador/')) {
        return await archivo(res, EMULADOR, ruta.slice('/emulador'.length));
      }
      return await archivo(res, PUBLICO, ruta);
    } catch (e) {
      res.writeHead(e.codigo || 500, { 'content-type': MIME['.json'] })
        .end(JSON.stringify({ error: e.message }));
    }
  });
}
