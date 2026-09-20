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
import { MODELOS, RAREZAS, ANIMOS } from '../server/catalogo.mjs';
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

  test('dibuja, y cada Rooti con cada piel se ve distinto', () => {
    assert.equal(x.lienzo(128, 128), 1);
    const vistos = new Set();
    for (let p = 0; p < x.personas(); p++) {
      for (let r = 0; r < RAREZAS.length; r++) {
        x.cara(p, r, 3, 0, 1200);
        vistos.add(hashCuadro(128));
      }
    }
    assert.equal(vistos.size, MODELOS.length * RAREZAS.length);
    x.cara(0, 9, 3, 0, 1200);
    const fuera = hashCuadro(128);
    x.cara(0, 0, 3, 0, 1200);
    assert.equal(fuera, hashCuadro(128), 'una rareza que no existe es la común');
    assert.equal(x.lienzo(9999, 9999), 0, 'un tamaño imposible se rechaza');
  });

  test('los colores de las pieles son los de rooties.mjs, en RGB565', () => {
    const a565 = (hex) => {
      const v = parseInt(hex.slice(1), 16);
      return (((v >> 16) & 0xff) >> 3 << 11) | ((((v >> 8) & 0xff) >> 2) << 5) | ((v & 0xff) >> 3);
    };
    for (const m of MODELOS) {
      RAREZAS.forEach((r, ri) => {
        const piel = m.pieles[r];
        ['fondo', 'ojos', 'piel', 'rubor'].forEach((campo, ci) => {
          assert.equal(x.piel_color(m.idx, ri, ci), a565(piel[campo]), `${m.id}-${r}.${campo}`);
        });
      });
    }
  });

  test('el despertar y la cara dormida son otra cosa', () => {
    x.lienzo(64, 64);
    x.cara(0, 0, 3, 0, 1200);
    const cara = hashCuadro(64);
    x.dormida(0, 1200);
    const dormida = hashCuadro(64);
    x.dormida(1, 1200);
    assert.notEqual(hashCuadro(64), dormida, 'dormido ya se ve qué Rooti es');
    x.despertar(0, 0, 100);
    const negro = hashCuadro(64);
    assert.notEqual(cara, dormida);
    assert.notEqual(dormida, negro);
    x.despertar(0, 2, x.despertar_ms() + 100);
    const epica = hashCuadro(64);
    x.despertar(0, 0, x.despertar_ms() + 100);
    assert.notEqual(epica, hashCuadro(64), 'despierta con la piel que salió');
    assert.ok(x.despertar_ms() > 1000);
  });

  test('la caricia: ^ ^ sobre cualquier ánimo, y en 0 la cara de siempre', () => {
    x.lienzo(64, 64);
    x.cara(1, 1, 4, 0, 1200);
    const sed = hashCuadro(64);
    x.cara_mimo(1, 1, 4, 0, 0, 1200);
    assert.equal(hashCuadro(64), sed, 'sin mimo es la cara del ánimo');
    x.cara_mimo(1, 1, 4, 0, 100, 1200);
    const mimo = hashCuadro(64);
    assert.notEqual(mimo, sed);
    x.cara(1, 1, 3, 0, 1200);
    assert.notEqual(mimo, hashCuadro(64), 'tampoco es la de contento');
    x.cara_mimo(1, 1, 4, 0, 50, 1200);
    const medio = hashCuadro(64);
    assert.ok(medio !== sed && medio !== mimo, 'a medias, entre las dos');
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

  test('los Rooties y sus pieles se leen de persona.c', () => {
    /* Los cinco colores de una piel: fondo, ojos, piel, rubor y acento. */
    const piel = (n, a) => `{ "${n}", RK_HEX(0xE8F5E9), RK_HEX(0x1B5E20), RK_HEX(0xE8F5E9), RK_HEX(0xFF8A80), RK_HEX(0x43A047), ${a} },`;
    const c = `{
    "brote", "Brote", "carcasas/brote.stl",
    "Lema uno.",
    /* comentario */
    RK_OJOS_REDONDOS, RK_BRILLO_CACHORRO, 14, 15, 22, -4,
    { ${piel('Hoja', '0u')} ${piel('Lavanda', 'RK_ADORNO_BRILLOS')} ${piel('Cerezo', 'RK_ADORNO_CORONA | RK_ADORNO_BRILLOS')} }
},
{
    "musgo", "Musgo", "carcasas/musgo.stl", "Lema dos.", RK_OJOS_MEDIALUNA,
    { ${piel('A', '0u')} ${piel('B', '0u')} ${piel('C', 'RK_ADORNO_AURA | RK_ADORNO_LUCES')} }
},`;
    const m = modelosDesdePersona(c);
    assert.equal(m.length, 2);
    assert.equal(m[0].id, 'brote');
    assert.equal(m[0].lema, 'Lema uno.');
    assert.equal(m[0].pieles.comun.fondo, '#e8f5e9');
    assert.equal(m[0].pieles.comun.acento, '#43a047');
    /* El fondo de la cara y el cuerpo van iguales: la cara se pinta encima. */
    assert.equal(m[0].pieles.comun.piel, m[0].pieles.comun.fondo);
    assert.deepEqual(m[0].pieles.epico.adornos, ['corona', 'brillos']);
    assert.equal(m[1].idx, 1);
    assert.deepEqual(m[1].pieles.epico.adornos, ['aura', 'luces']);
    assert.throws(() => modelosDesdePersona('{ "x", "X", "x.stl", "L", { } }'), /pieles/);
  });

  test('hay una imagen por Rooti, piel y ánimo para las notificaciones, y una dormida', () => {
    for (const mo of MODELOS) {
      for (const r of RAREZAS) {
        for (const a of ANIMOS) {
          assert.ok(existsSync(new URL(`../public/caras/${mo.id}-${r}-${a}.png`, import.meta.url)), `${mo.id}-${r}-${a}`);
        }
      }
      assert.ok(readFileSync(new URL(`../public/caras/${mo.id}-dormido.png`, import.meta.url)).length > 100);
    }
  });
});
