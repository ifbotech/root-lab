/* gif.mjs — un GIF animado, escrito a mano.
 *
 * "Exportar evolución" arma un GIF con las fotos del álbum de una planta:
 * una por cuadro, con su fecha, para mandar por WhatsApp o guardar. No hay
 * librería de terceros en la app (docs/seguridad.md), así que el GIF se
 * escribe acá: la cuantización a 256 colores, la compresión LZW y los
 * bloques del formato GIF89a. Son ciento y pico de líneas y andan en
 * cualquier navegador; el WebP animado no se puede armar con el canvas, y
 * un GIF se abre en todos lados.
 *
 * Todo es puro sobre arreglos de bytes: se prueba en Node decodificándolo.
 */

/* Una paleta fija: un cubo de 6 × 7 × 6 (252 colores) más cuatro grises.
 * Con tramado (Floyd–Steinberg) una foto se ve bien; una paleta adaptativa
 * sería mejor y bastante más código. */
export const PALETA = (() => {
  const p = new Uint8Array(256 * 3);
  let i = 0;
  for (let r = 0; r < 6; r++) {
    for (let g = 0; g < 7; g++) {
      for (let b = 0; b < 6; b++) {
        p[i++] = Math.round((r * 255) / 5);
        p[i++] = Math.round((g * 255) / 6);
        p[i++] = Math.round((b * 255) / 5);
      }
    }
  }
  for (const v of [32, 96, 160, 224]) { p[i++] = v; p[i++] = v; p[i++] = v; }
  return p;
})();

const acotar = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

/** El índice de la paleta más cercano a (r, g, b). */
export function indiceDe(r, g, b) {
  const ri = Math.round((acotar(r) * 5) / 255);
  const gi = Math.round((acotar(g) * 6) / 255);
  const bi = Math.round((acotar(b) * 5) / 255);
  const cubo = ri * 42 + gi * 6 + bi;
  /* Si es casi gris, un gris puro queda mejor que el cubo. */
  const media = (r + g + b) / 3;
  if (Math.abs(r - media) < 12 && Math.abs(g - media) < 12 && Math.abs(b - media) < 12) {
    const gris = Math.round((media - 32) / 64);
    if (gris >= 0 && gris <= 3 && Math.abs(media - (32 + gris * 64)) < 20) return 252 + gris;
  }
  return cubo;
}

/**
 * RGBA → índices de PALETA, con tramado de Floyd–Steinberg para que los
 * degradés de una foto no se vuelvan franjas.
 */
export function cuantizar(rgba, ancho, alto, { tramado = true } = {}) {
  const idx = new Uint8Array(ancho * alto);
  const err = new Float32Array((ancho + 2) * 3 * 2);   /* dos filas de error */
  let fila = 0;
  for (let y = 0; y < alto; y++) {
    const actual = fila * (ancho + 2) * 3;
    const proxima = (1 - fila) * (ancho + 2) * 3;
    err.fill(0, proxima, proxima + (ancho + 2) * 3);
    for (let x = 0; x < ancho; x++) {
      const o = (y * ancho + x) * 4;
      const e = actual + (x + 1) * 3;
      const r = rgba[o] + (tramado ? err[e] : 0);
      const g = rgba[o + 1] + (tramado ? err[e + 1] : 0);
      const b = rgba[o + 2] + (tramado ? err[e + 2] : 0);
      const i = indiceDe(r, g, b);
      idx[y * ancho + x] = i;
      if (!tramado) continue;
      const dr = r - PALETA[i * 3];
      const dg = g - PALETA[i * 3 + 1];
      const db = b - PALETA[i * 3 + 2];
      const der = actual + (x + 2) * 3;
      const ab = proxima + (x + 1) * 3;
      err[der] += dr * 7 / 16; err[der + 1] += dg * 7 / 16; err[der + 2] += db * 7 / 16;
      err[ab - 3] += dr * 3 / 16; err[ab - 2] += dg * 3 / 16; err[ab - 1] += db * 3 / 16;
      err[ab] += dr * 5 / 16; err[ab + 1] += dg * 5 / 16; err[ab + 2] += db * 5 / 16;
      err[ab + 3] += dr / 16; err[ab + 4] += dg / 16; err[ab + 5] += db / 16;
    }
    fila = 1 - fila;
  }
  return idx;
}

/* LZW de GIF (código mínimo 8): igual que los codificadores clásicos. */
export function lzw(indices, minimo = 8) {
  const salida = [];
  const limpiar = 1 << minimo;
  const fin = limpiar + 1;
  let tamano = minimo + 1;
  let proximo = fin + 1;
  let tabla = new Map();
  let buf = 0;
  let bits = 0;
  const emitir = (codigo) => {
    buf |= codigo << bits;
    bits += tamano;
    while (bits >= 8) {
      salida.push(buf & 255);
      buf >>>= 8;
      bits -= 8;
    }
  };
  emitir(limpiar);
  if (indices.length === 0) {
    emitir(fin);
    if (bits > 0) salida.push(buf & 255);
    return salida;
  }
  let prefijo = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const clave = (prefijo << 8) | k;
    const conocido = tabla.get(clave);
    if (conocido !== undefined) {
      prefijo = conocido;
      continue;
    }
    emitir(prefijo);
    if (proximo === 4096) {
      emitir(limpiar);
      proximo = fin + 1;
      tamano = minimo + 1;
      tabla = new Map();
    } else {
      if (proximo >= (1 << tamano)) tamano += 1;
      tabla.set(clave, proximo++);
    }
    prefijo = k;
  }
  emitir(prefijo);
  emitir(fin);
  if (bits > 0) salida.push(buf & 255);
  return salida;
}

const u16 = (v) => [v & 255, (v >> 8) & 255];
const subBloques = (bytes) => {
  const out = [];
  for (let i = 0; i < bytes.length; i += 255) {
    const trozo = bytes.slice(i, i + 255);
    out.push(trozo.length, ...trozo);
  }
  out.push(0);
  return out;
};

/**
 * Arma el GIF. `cuadros` son índices de PALETA (`cuantizar`), todos de
 * `ancho` × `alto`; `retardoMs` por cuadro (o un arreglo); `bucle` 0 es
 * para siempre. Devuelve los bytes.
 */
export function codificarGif(cuadros, { ancho, alto, retardoMs = 600, bucle = 0 } = {}) {
  const partes = [];
  partes.push(...[71, 73, 70, 56, 57, 97]);                        /* GIF89a */
  partes.push(...u16(ancho), ...u16(alto), 0xF7, 0, 0);            /* tabla global de 256 */
  partes.push(...PALETA);
  partes.push(0x21, 0xFF, 0x0B, ...[..."NETSCAPE2.0"].map((c) => c.charCodeAt(0)), 3, 1, ...u16(bucle), 0);
  cuadros.forEach((indices, n) => {
    const ms = Array.isArray(retardoMs) ? retardoMs[n] ?? 600 : retardoMs;
    const cs = Math.max(2, Math.round(ms / 10));
    partes.push(0x21, 0xF9, 4, 0, ...u16(cs), 0, 0);                /* control gráfico */
    partes.push(0x2C, 0, 0, 0, 0, ...u16(ancho), ...u16(alto), 0);   /* descriptor de imagen */
    partes.push(8, ...subBloques(lzw(indices, 8)));
  });
  partes.push(0x3B);
  return Uint8Array.from(partes);
}
