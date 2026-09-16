/* El renderer del firmware, cargado como lo carga la app.
 *
 * public/caras/rootkit_caras.wasm es rootkit/firmware compilado. Estas
 * pruebas verifican que el módulo que se sirve está completo y dibuja: si
 * alguien lo reemplaza por uno viejo o roto, la app se quedaría sin caras y
 * sin emulador, y eso se ve acá antes que en un teléfono.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { cargarModulo, png, modelosDesdePersona } from '../tools/sincronizar-firmware.mjs';
import { MODELOS, ANIMOS } from '../server/catalogo.mjs';
import { codigoVinculo } from '../server/codigo.mjs';

const WASM = new URL('../public/caras/rootkit_caras.wasm', import.meta.url);

describe('el módulo de caras', async () => {
  const { x, texto } = await cargarModulo(WASM);
  const hashCuadro = (lado) => createHash('sha1')
    .update(new Uint8Array(x.memory.buffer, x.rgba(), lado * lado * 4)).digest('hex');

  test('trae los mismos modelos y ánimos que el servidor', () => {
    assert.equal(x.personas(), MODELOS.length);
    for (let i = 0; i < x.personas(); i++) assert.equal(texto(x.persona_id(i)), MODELOS[i].id);
    assert.equal(x.animos(), ANIMOS.length);
    for (let i = 0; i < x.animos(); i++) assert.equal(texto(x.animo_id(i)), ANIMOS[i]);
  });

  test('dibuja, y cada modelo se ve distinto', () => {
    assert.equal(x.lienzo(128, 128), 1);
    const vistos = new Set();
    for (let p = 0; p < x.personas(); p++) {
      x.cara(p, 3, 0, 1200);
      vistos.add(hashCuadro(128));
    }
    assert.equal(vistos.size, MODELOS.length);
    assert.equal(x.lienzo(9999, 9999), 0, 'un tamaño imposible se rechaza');
  });

  test('el despertar y la cara dormida son otra cosa', () => {
    x.lienzo(64, 64);
    x.cara(0, 3, 0, 1200);
    const cara = hashCuadro(64);
    x.dormida(1200);
    const dormida = hashCuadro(64);
    x.despertar(0, 100);
    const negro = hashCuadro(64);
    assert.notEqual(cara, dormida);
    assert.notEqual(dormida, negro);
    assert.ok(x.despertar_ms() > 1000);
  });

  test('deriva el mismo código que el servidor', () => {
    const secreto = Buffer.from('3a917c05ee4218b69d602fc3710e845b', 'hex');
    new Uint8Array(x.memory.buffer, x.secreto(), 16).set(secreto);
    assert.equal(texto(x.codigo(0)), codigoVinculo(secreto, 0));
    assert.equal(texto(x.codigo(5)), codigoVinculo(secreto, 5));
  });

  test('la máquina de vínculo recorre el flujo', () => {
    x.enlace_iniciar(0, 0, 0, 0, 0);
    assert.equal(texto(x.enlace_nombre()), 'SIN_WIFI');
    x.enlace_evento(1, 0, 0, 10);
    x.enlace_evento(2, 0, 0, 20);
    assert.equal(texto(x.enlace_nombre()), 'SIN_VINCULO');
    x.enlace_evento(4, 1, 0, 30);
    assert.equal(x.enlace_pantalla(), 1, 'dormida');
    x.enlace_evento(4, 1, 1, 40);
    assert.equal(x.enlace_pantalla(), 2, 'despertando');
    x.enlace_evento(0, 0, 0, 40 + x.despertar_ms());
    assert.equal(x.enlace_pantalla(), 3, 'cara');
  });

  test('evalúa el ánimo igual que la placa', () => {
    x.especie(25, 60, 180, 300, 50, 1000, 15000);
    assert.equal(ANIMOS[x.animo(10, 230, 60, 5000, 0)], 'THIRSTY');
    assert.equal(x.severidad(), 2, 'muy seca es urgente');
    x.especie(25, 60, 180, 300, 50, 1000, 15000);
    assert.equal(ANIMOS[x.animo(40, 230, 60, 5000, 0)], 'HAPPY');
    x.especie(25, 60, 180, 300, 50, 1000, 15000);
    assert.equal(ANIMOS[x.animo(40, 50, 60, 5000, 2)], 'HAPPY', 'sin AHT20 no hay frío');
  });
});

describe('herramientas', () => {
  test('el PNG tiene firma y cabecera', () => {
    const p = png(new Uint8Array(4 * 4 * 4).fill(200), 4, 4);
    assert.deepEqual([...p.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(p.readUInt32BE(16), 4);
  });

  test('los modelos se leen de persona.c', () => {
    const c = `{ "cresta", "Cresta", "c.stl", "Lema uno.", RK_RAR_COMUN, x, RK_RGB( 98, 197,  54), RK_RGB(1,2,3) },
               { "glitch", "?????", "g.stl", "Lema dos.", RK_RAR_SECRETO, y, RK_RGB( 28,  28,  38) }`;
    const m = modelosDesdePersona(c);
    assert.equal(m.length, 2);
    assert.equal(m[0].fondo, '#62c536');
    assert.equal(m[1].rareza, 'SECRETO');
  });

  test('hay una imagen por modelo y ánimo para las notificaciones', () => {
    for (const mo of MODELOS) {
      for (const a of ANIMOS) {
        assert.ok(existsSync(new URL(`../public/caras/${mo.id}-${a}.png`, import.meta.url)), `${mo.id}-${a}`);
      }
    }
    assert.ok(readFileSync(new URL('../public/caras/incognito.png', import.meta.url)).length > 100);
  });
});
