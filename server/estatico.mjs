/* estatico.mjs — comprimir y revalidar: los datos que el teléfono no gasta.
 *
 * POR QUÉ
 *
 * El armazón de ROOTLAB son 44 módulos, una hoja de estilos y el renderer en
 * WebAssembly: medio mega de texto que viajaba entero, sin comprimir, en cada
 * carga. Comprimido son unos 140 KB. Y como todo se sirve con `no-cache` —el
 * service worker maneja el caché, el navegador revalida— sin una etiqueta que
 * comparar el navegador no podía revalidar nada: volvía a bajarlo todo.
 *
 * Acá viven las dos piezas que faltaban, puras y probadas aparte:
 *
 *   - `etagDe` / `coincide`: la etiqueta de una respuesta y si el navegador ya
 *     la tiene (`If-None-Match` -> `304`, sin cuerpo).
 *   - `elegirCodificacion` / `comprimir`: qué entiende el cliente (brotli o
 *     gzip) y el cuerpo comprimido, con una caché en memoria para no volver a
 *     comprimir lo mismo.
 *
 * COMPRIMIR RESPUESTAS CON DATOS PERSONALES
 *
 * Comprimir una respuesta que mezcla un secreto con algo que elige un atacante
 * puede filtrar el secreto por su tamaño (BREACH). Acá no aplica: la API se
 * autentica con `Authorization`, no con cookies, así que una página ajena no
 * puede pedir nada en nombre de nadie; y las respuestas no reflejan entrada
 * del atacante. Aun así, la API sigue con `no-store`: nada queda en el disco
 * del teléfono.
 */
import { createHash } from 'node:crypto';
import { brotliCompressSync, gzipSync, constants } from 'node:zlib';

/** Lo que vale la pena comprimir: texto y formatos que son texto por dentro. */
export const COMPRIMIBLE = /^(?:text\/|image\/svg\+xml|application\/(?:json|javascript|manifest\+json|wasm))/;

/** Abajo de esto, comprimir agrega más cabecera de la que ahorra. */
export const MINIMO = 1024;

/** Cuánto guarda la caché de comprimidos antes de vaciarse. */
export const TOPE_CACHE = 16 * 1024 * 1024;

/**
 * Qué codificación acepta el cliente, de la que mejor comprime a ninguna.
 * Entiende los pesos (`br;q=0.1, gzip`) y el comodín; `identity;q=0` no
 * cambia nada porque siempre hay una opción sin comprimir.
 */
export function elegirCodificacion(aceptado) {
  const pesos = new Map();
  for (const parte of String(aceptado || '').split(',')) {
    const [nombre, ...params] = parte.trim().split(';');
    if (!nombre) continue;
    const q = params.map((p) => p.trim().match(/^q=([\d.]+)$/i)).find(Boolean);
    const peso = q ? Number(q[1]) : 1;
    if (Number.isFinite(peso) && peso > 0) pesos.set(nombre.trim().toLowerCase(), peso);
  }
  const comodin = pesos.has('*');
  for (const cod of ['br', 'gzip']) {
    if (pesos.has(cod) || comodin) return cod;
  }
  return null;
}

/** La etiqueta de un cuerpo: su largo y el principio de su SHA-256. */
export function etagDe(datos) {
  const buf = Buffer.isBuffer(datos) ? datos : Buffer.from(String(datos), 'utf8');
  return `"${buf.length.toString(16)}-${createHash('sha256').update(buf).digest('hex').slice(0, 16)}"`;
}

/** Si lo que el navegador ya tiene (`If-None-Match`) es esto mismo. */
export function coincide(ifNoneMatch, etag) {
  if (!ifNoneMatch || !etag) return false;
  const limpiar = (s) => s.trim().replace(/^W\//, '');
  const mio = limpiar(etag);
  return String(ifNoneMatch).split(',').some((uno) => {
    const u = limpiar(uno);
    return u === '*' || u === mio;
  });
}

/** El cuerpo comprimido. Brotli en calidad media: se guarda y se reusa. */
export function comprimir(datos, codificacion) {
  const buf = Buffer.isBuffer(datos) ? datos : Buffer.from(String(datos), 'utf8');
  if (codificacion === 'br') {
    return brotliCompressSync(buf, {
      params: {
        [constants.BROTLI_PARAM_QUALITY]: 6,
        [constants.BROTLI_PARAM_SIZE_HINT]: buf.length,
      },
    });
  }
  if (codificacion === 'gzip') return gzipSync(buf, { level: 6 });
  return buf;
}

/**
 * Comprime una vez y se acuerda. La clave la pone quien llama e incluye lo
 * que hace único al contenido (la ruta y la fecha del archivo): un archivo
 * editado es otra clave. Si se pasa del tope, se vacía entera: el armazón es
 * chico y estable, y volver a llenarla cuesta una compresión por archivo.
 */
export function crearCacheComprimidos({ tope = TOPE_CACHE } = {}) {
  const cache = new Map();
  let bytes = 0;
  return {
    /** El cuerpo listo para mandar, o `null` si no conviene comprimirlo. */
    obtener(clave, datos, codificacion) {
      if (!codificacion) return null;
      const buf = Buffer.isBuffer(datos) ? datos : Buffer.from(String(datos), 'utf8');
      if (buf.length < MINIMO) return null;
      const k = `${clave}|${codificacion}`;
      const guardado = cache.get(k);
      if (guardado) return guardado;
      const salida = comprimir(buf, codificacion);
      /* Un cuerpo que no encoge (ya está comprimido, o es puro ruido) se manda
         tal cual: mejor eso que pagar la cabecera y el trabajo del teléfono. */
      if (salida.length >= buf.length) return null;
      if (bytes + salida.length > tope) {
        cache.clear();
        bytes = 0;
      }
      cache.set(k, salida);
      bytes += salida.length;
      return salida;
    },
    /** Cuántos bytes tiene guardados (para las pruebas). */
    tamano: () => bytes,
    vaciar() { cache.clear(); bytes = 0; },
  };
}

/** Si un tipo de contenido se comprime (los `.png` y las fuentes ya vienen así). */
export const seComprime = (tipo) => COMPRIMIBLE.test(String(tipo || ''));
