/* Comprimir y revalidar: las dos cosas que decidí que el teléfono no gaste. */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { gunzipSync, brotliDecompressSync } from 'node:zlib';
import { randomBytes } from 'node:crypto';

import {
  elegirCodificacion, etagDe, coincide, comprimir, seComprime, crearCacheComprimidos, MINIMO,
} from '../server/estatico.mjs';

describe('qué entiende el cliente', () => {
  test('la que mejor comprime de las que acepta', () => {
    assert.equal(elegirCodificacion('gzip, deflate, br, zstd'), 'br');
    assert.equal(elegirCodificacion('gzip, deflate'), 'gzip');
    assert.equal(elegirCodificacion('deflate'), null, 'deflate solo no se usa');
    assert.equal(elegirCodificacion('*'), 'br', 'el comodín acepta todo');
    assert.equal(elegirCodificacion(''), null);
    assert.equal(elegirCodificacion(undefined), null, 'un cliente viejo no manda nada');
  });

  test('un peso en cero es un no', () => {
    assert.equal(elegirCodificacion('br;q=0, gzip'), 'gzip');
    assert.equal(elegirCodificacion('br;q=0, gzip;q=0'), null);
    assert.equal(elegirCodificacion('br;q=0.1, gzip;q=0.9'), 'br', 'alcanza con que la acepte');
    assert.equal(elegirCodificacion('  GZIP ;q=1 '), 'gzip', 'espacios y mayúsculas');
  });
});

describe('la etiqueta de una respuesta', () => {
  test('cambia con el contenido y no con la forma de pedirlo', () => {
    const a = etagDe('{"plantas":[]}');
    assert.equal(a, etagDe(Buffer.from('{"plantas":[]}', 'utf8')), 'texto y bytes son lo mismo');
    assert.notEqual(a, etagDe('{"plantas":[1]}'));
    assert.match(a, /^"[0-9a-f]+-[0-9a-f]{16}"$/);
  });

  test('coincide con lo que dice tener el navegador', () => {
    const e = etagDe('hola');
    assert.ok(coincide(e, e));
    assert.ok(coincide(`W/${e}`, e), 'débil o fuerte, es la misma');
    assert.ok(coincide(`"otra", ${e}`, e), 'una lista');
    assert.ok(coincide('*', e));
    assert.ok(!coincide('"otra"', e));
    assert.ok(!coincide('', e));
    assert.ok(!coincide(undefined, e));
    assert.ok(!coincide(e, ''), 'sin etiqueta propia no coincide nada');
  });
});

describe('qué se comprime', () => {
  test('el texto sí; lo que ya viene comprimido, no', () => {
    for (const t of ['text/javascript; charset=utf-8', 'text/css', 'text/html; charset=utf-8',
      'application/json; charset=utf-8', 'application/manifest+json', 'application/wasm', 'image/svg+xml']) {
      assert.ok(seComprime(t), t);
    }
    for (const t of ['image/png', 'font/woff2', 'application/octet-stream', '', undefined]) {
      assert.ok(!seComprime(t), String(t));
    }
  });

  test('lo comprimido vuelve a ser lo mismo', () => {
    const texto = JSON.stringify({ plantas: Array.from({ length: 200 }, (_, i) => ({ id: `p${i}`, nombre: 'Monsterita' })) });
    assert.equal(brotliDecompressSync(comprimir(texto, 'br')).toString('utf8'), texto);
    assert.equal(gunzipSync(comprimir(texto, 'gzip')).toString('utf8'), texto);
    assert.ok(comprimir(texto, 'br').length < texto.length / 4, 'un JSON repetitivo encoge mucho');
    assert.equal(comprimir(texto, null).toString('utf8'), texto, 'sin codificación, tal cual');
  });
});

describe('la caché de comprimidos', () => {
  const grande = 'a'.repeat(MINIMO * 4);

  test('comprime una vez y devuelve lo mismo', () => {
    const c = crearCacheComprimidos();
    const uno = c.obtener('clave', grande, 'gzip');
    const dos = c.obtener('clave', grande, 'gzip');
    assert.ok(uno && uno.length < grande.length);
    assert.equal(uno, dos, 'el mismo buffer, sin volver a comprimir');
    assert.notEqual(c.obtener('clave', grande, 'br'), uno, 'cada codificación por su lado');
  });

  test('lo chico y lo que no encoge se mandan tal cual', () => {
    const c = crearCacheComprimidos();
    assert.equal(c.obtener('k', 'hola', 'gzip'), null, 'debajo del mínimo no vale la pena');
    assert.equal(c.obtener('k', grande, null), null, 'un cliente que no acepta nada');
    /* Ruido de verdad: comprimirlo lo agranda, así que se manda crudo. */
    assert.equal(c.obtener('ruido', randomBytes(MINIMO * 2), 'gzip'), null);
  });

  test('no crece para siempre', () => {
    const c = crearCacheComprimidos({ tope: 2000 });
    for (let i = 0; i < 50; i++) c.obtener(`k${i}`, `${grande}${i}`, 'gzip');
    assert.ok(c.tamano() <= 2000, `guardó ${c.tamano()} bytes`);
    c.vaciar();
    assert.equal(c.tamano(), 0);
  });
});
