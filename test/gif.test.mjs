/* El GIF que se escribe a mano: se decodifica acá para verificar que otro
 * programa lo va a leer igual. */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { PALETA, indiceDe, cuantizar, lzw, codificarGif } from '../public/lib/gif.mjs';

/* Un decodificador LZW de GIF, mínimo, para la prueba. */
function deslzw(bytes, minimo = 8) {
  const limpiar = 1 << minimo;
  const fin = limpiar + 1;
  let tamano = minimo + 1;
  let dic = [];
  const reiniciar = () => { dic = []; for (let i = 0; i < limpiar; i++) dic.push([i]); dic.push(null, null); tamano = minimo + 1; };
  reiniciar();
  const out = [];
  let buf = 0;
  let bits = 0;
  let pos = 0;
  let previo = null;
  const leer = () => {
    while (bits < tamano && pos < bytes.length) { buf |= bytes[pos++] << bits; bits += 8; }
    const c = buf & ((1 << tamano) - 1);
    buf >>>= tamano;
    bits -= tamano;
    return c;
  };
  for (;;) {
    const c = leer();
    if (c === fin) break;
    if (c === limpiar) { reiniciar(); previo = null; continue; }
    let entrada;
    if (c < dic.length && dic[c]) entrada = dic[c];
    else if (previo) entrada = [...previo, previo[0]];
    else throw new Error(`código ${c} sin diccionario`);
    out.push(...entrada);
    if (previo) {
      dic.push([...previo, entrada[0]]);
      if (dic.length === (1 << tamano) && tamano < 12) tamano += 1;
    }
    previo = entrada;
    if (pos >= bytes.length && bits < tamano) break;
  }
  return out;
}

/* Recorre los bloques del GIF y devuelve los cuadros decodificados. */
function leerGif(bytes) {
  const texto = (a, b) => String.fromCharCode(...bytes.subarray(a, b));
  assert.equal(texto(0, 6), 'GIF89a');
  const ancho = bytes[6] | (bytes[7] << 8);
  const alto = bytes[8] | (bytes[9] << 8);
  assert.equal(bytes[10], 0xF7, 'tabla global de 256 colores');
  let p = 13 + 768;
  const cuadros = [];
  const retardos = [];
  let bucle = null;
  while (p < bytes.length) {
    const b = bytes[p];
    if (b === 0x3B) break;
    if (b === 0x21) {
      const etiqueta = bytes[p + 1];
      p += 2;
      if (etiqueta === 0xFF) {
        assert.equal(texto(p + 1, p + 12), 'NETSCAPE2.0');
        bucle = bytes[p + 15] | (bytes[p + 16] << 8);
      }
      if (etiqueta === 0xF9) retardos.push(bytes[p + 2] | (bytes[p + 3] << 8));
      while (bytes[p] !== 0) p += bytes[p] + 1;
      p += 1;
      continue;
    }
    if (b === 0x2C) {
      const w = bytes[p + 5] | (bytes[p + 6] << 8);
      const h = bytes[p + 7] | (bytes[p + 8] << 8);
      assert.equal(bytes[p + 9], 0, 'sin tabla local');
      p += 10;
      const minimo = bytes[p++];
      const datos = [];
      while (bytes[p] !== 0) { datos.push(...bytes.subarray(p + 1, p + 1 + bytes[p])); p += bytes[p] + 1; }
      p += 1;
      cuadros.push({ w, h, indices: deslzw(Uint8Array.from(datos), minimo) });
      continue;
    }
    throw new Error(`bloque desconocido 0x${b.toString(16)} en ${p}`);
  }
  return { ancho, alto, cuadros, retardos, bucle };
}

describe('la paleta y la cuantización', () => {
  test('256 colores: el cubo y cuatro grises', () => {
    assert.equal(PALETA.length, 768);
    assert.deepEqual([...PALETA.subarray(0, 3)], [0, 0, 0]);
    assert.deepEqual([...PALETA.subarray(251 * 3, 252 * 3)], [255, 255, 255]);
    assert.deepEqual([...PALETA.subarray(253 * 3, 254 * 3)], [96, 96, 96]);
    const rojo = indiceDe(255, 0, 0);
    assert.deepEqual([...PALETA.subarray(rojo * 3, rojo * 3 + 3)], [255, 0, 0]);
    assert.equal(indiceDe(97, 95, 96), 253, 'casi gris va a un gris');
    assert.equal(indiceDe(300, -5, 128), indiceDe(255, 0, 128), 'se acota');
  });

  test('cuantizar devuelve un índice por pixel, con y sin tramado', () => {
    const w = 8;
    const h = 2;
    const rgba = new Uint8Array(w * h * 4);
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        const o = (y * w + x) * 4;
        rgba[o] = Math.round((x * 255) / (w - 1)); rgba[o + 1] = 0; rgba[o + 2] = 0; rgba[o + 3] = 255;
      }
    }
    const sin = cuantizar(rgba, w, h, { tramado: false });
    const con = cuantizar(rgba, w, h);
    assert.equal(sin.length, w * h);
    assert.equal(sin[0], indiceDe(0, 0, 0));
    assert.equal(sin[w - 1], indiceDe(255, 0, 0));
    assert.ok(con.every((i) => i < 256));
    /* Con tramado, el degradé usa más matices o al menos los mismos. */
    assert.ok(new Set(con).size >= new Set(sin).size);
  });
});

describe('LZW y el archivo', () => {
  test('lo comprimido se descomprime igual', () => {
    for (const largo of [1, 2, 17, 300, 5000]) {
      const indices = Uint8Array.from({ length: largo }, (_, i) => (i * 7 + (i >> 3)) % 256);
      assert.deepEqual(deslzw(Uint8Array.from(lzw(indices)), 8), [...indices], `largo ${largo}`);
    }
    const repetido = new Uint8Array(20000).fill(3);
    const c = lzw(repetido);
    assert.ok(c.length < 600, `una imagen lisa comprime mucho: ${c.length} bytes`);
    assert.deepEqual(deslzw(Uint8Array.from(c), 8).length, 20000);
    assert.deepEqual(deslzw(Uint8Array.from(lzw(new Uint8Array(0))), 8), []);
  });

  test('un GIF de dos cuadros se lee entero: tamaño, bucle, retardos y pixeles', () => {
    const w = 6;
    const h = 4;
    const a = new Uint8Array(w * h).fill(indiceDe(255, 0, 0));
    const b = new Uint8Array(w * h).fill(indiceDe(0, 0, 255));
    b[0] = indiceDe(255, 255, 255);
    const gif = codificarGif([a, b], { ancho: w, alto: h, retardoMs: [500, 1200], bucle: 0 });
    assert.ok(gif instanceof Uint8Array);
    const r = leerGif(gif);
    assert.equal(r.ancho, w);
    assert.equal(r.alto, h);
    assert.equal(r.bucle, 0, 'para siempre');
    assert.deepEqual(r.retardos, [50, 120], 'en centésimas');
    assert.equal(r.cuadros.length, 2);
    assert.deepEqual(r.cuadros[0].indices, [...a]);
    assert.deepEqual(r.cuadros[1].indices, [...b]);
    assert.equal(gif[gif.length - 1], 0x3B);
  });

  test('una foto de verdad (ruido) sobrevive a la ida y vuelta', () => {
    const w = 64;
    const h = 48;
    const rgba = new Uint8Array(w * h * 4);
    let s = 7;
    for (let i = 0; i < rgba.length; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; rgba[i] = s & 255; }
    const idx = cuantizar(rgba, w, h);
    const gif = codificarGif([idx], { ancho: w, alto: h });
    const r = leerGif(gif);
    assert.deepEqual(r.cuadros[0].indices, [...idx]);
  });
});
