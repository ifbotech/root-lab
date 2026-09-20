/* Lo que el teléfono le agrega a la cara: la luz, la voz, la caricia y el
 * modo escritorio. Son las reglas puras de public/lib; el navegador pone
 * el canvas, el audio y los eventos, pero cuánto, cuándo y con qué números
 * se decide acá y se prueba acá.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { iluminacion, faseEspecular, NEUTRA, UMBRALES, ESPECULAR_PERIODO_MS } from '../public/lib/luz.mjs';
import {
  VOCES, VOZ_BASE, vozDe, notaPara, suena, duracionLetra, puedeSonar, SILENCIO_DESDE, SILENCIO_HASTA,
} from '../public/lib/voz.mjs';
import { PATRON_VIBRACION, UMBRAL_CARICIA_PX, SOLTAR_MS, esCaricia, vibrar } from '../public/lib/caricias.mjs';
import { esDeNoche, ladoDesk, LUX_NOCHE, LADO_MAX, LADO_MIN } from '../public/lib/desk.mjs';
import { trayectoria } from '../public/lib/particulas.mjs';
import { MODELOS } from '../server/catalogo.mjs';

/* ================================================================ luz === */
describe('la luz sobre la cara', () => {
  test('sin dato, la cara de siempre', () => {
    for (const v of [null, undefined, NaN, 'no']) assert.equal(iluminacion(v), NEUTRA);
  });

  test('de 50 a 5000 lux no pasa nada', () => {
    for (const lux of [50, 120, 800, 2500, 5000]) assert.equal(iluminacion(lux).neutra, true, `${lux} lux`);
  });

  test('en penumbra se entibia, pierde color y se oscurecen los bordes', () => {
    const l = iluminacion(5);
    assert.equal(l.modo, 'penumbra');
    assert.ok(l.calidez > 0.8 && l.desaturacion > 0.5 && l.vineta > 0.5);
    assert.equal(l.contraste, 1);
    assert.equal(l.especular, 0);
    /* Y crece desde cero al bajar de 50: no hay salto en el umbral. */
    assert.ok(iluminacion(49).calidez < 0.05);
    assert.ok(iluminacion(0).calidez === 1);
    assert.ok(iluminacion(10).desaturacion > iluminacion(30).desaturacion);
  });

  test('a pleno sol gana contraste y brillo, de a poco desde 5000', () => {
    const claro = iluminacion(7500);
    const pleno = iluminacion(12000);
    assert.equal(claro.modo, 'claro');
    assert.equal(pleno.modo, 'pleno');
    assert.ok(claro.contraste > 1 && claro.contraste < pleno.contraste);
    assert.equal(pleno.contraste, 1.2);
    assert.equal(pleno.especular, 1);
    assert.equal(pleno.calidez, 0);
    assert.ok(iluminacion(5001).especular < 0.01, 'crece desde cero');
    assert.deepEqual(iluminacion(60000), pleno, 'más allá de 10 000 satura');
  });

  test('los umbrales son los del producto', () => {
    assert.deepEqual(UMBRALES, { penumbra: 50, neutroHasta: 5000, pleno: 10000 });
  });

  test('el brillo cruza la cara y vuelve a empezar', () => {
    assert.ok(faseEspecular(0) < 0);
    assert.ok(faseEspecular(ESPECULAR_PERIODO_MS - 1) > 1);
    assert.equal(faseEspecular(ESPECULAR_PERIODO_MS), faseEspecular(0));
    assert.equal(faseEspecular(-100), faseEspecular(ESPECULAR_PERIODO_MS - 100), 'aguanta tiempos negativos');
  });
});

/* ================================================================ voz === */
describe('la voz de cada Rooti', () => {
  test('cada uno suena como es', () => {
    const kip = VOCES.kip;
    const nori = VOCES.nori;
    const plum = VOCES.plum;
    /* Kip habla acelerado y con filo; Nori, medida y con pausas. */
    assert.equal(kip.onda, 'square');
    assert.equal(nori.onda, 'sine');
    assert.ok(nori.ataque > kip.ataque * 4, 'Nori ataca suave');
    assert.ok(kip.msPorLetra < nori.msPorLetra, 'Kip habla más rápido');
    assert.ok(nori.pausaPunto > kip.pausaPunto, 'y Nori hace pausas más largas');
    /* Blink canta: es el único con escala. */
    assert.ok(Array.isArray(VOCES.blink.escala) && VOCES.blink.escala.length >= 4);
    assert.equal(VOCES.kip.escala, null);
    /* Y Plum es la más grave y redonda de las cuatro. */
    assert.ok(plum.fmin < VOCES.blink.fmin && plum.fmin < nori.fmin);
    assert.equal(plum.onda, 'sine');
  });

  test('cada modelo tiene voz, y la base sirve para uno nuevo', () => {
    for (const m of MODELOS) assert.ok(VOCES[m.id], m.id);
    assert.equal(vozDe('inventado'), VOZ_BASE);
    for (const v of Object.values(VOCES)) {
      assert.ok(v.fmin < v.fmax && v.ganancia > 0 && v.ganancia < 0.1, 'bajito');
      assert.ok(['sine', 'triangle', 'square', 'sawtooth'].includes(v.onda));
    }
  });

  test('la nota queda dentro del rango, y una letra siempre suena igual', () => {
    for (const [id, v] of Object.entries(VOCES)) {
      for (const letra of 'hola qué tal ñandú 42') {
        if (!suena(v, letra)) continue;
        const hz = notaPara(v, letra, 3);
        assert.ok(hz >= v.fmin && hz <= v.fmax, `${id}: ${letra} -> ${hz}`);
      }
    }
    assert.equal(notaPara(VOCES.kip, 'a', 1), notaPara(VOCES.kip, 'a', 9));
    assert.ok(notaPara(VOCES.kip, 'a') > notaPara(VOCES.kip, 'k'), 'las vocales van arriba');
  });

  test('Blink arpegia por la pentatónica, subiendo y bajando', () => {
    const k = VOCES.blink;
    const notas = [...Array(8)].map((_, i) => notaPara(k, 'x', i));
    for (const n of notas) assert.ok(k.escala.includes(n));
    assert.deepEqual(notas.slice(0, 4), k.escala, 'sube');
    assert.equal(notas[4], k.escala[2], 'y baja');
    assert.equal(notas[6], k.escala[0]);
  });

  test('qué letras suenan', () => {
    const todas = VOCES.kip;
    const vocales = VOCES.nori;
    assert.ok(suena(todas, 'k') && suena(todas, 'a') && suena(todas, '7'));
    assert.ok(!suena(todas, ' ') && !suena(todas, '.') && !suena(todas, '¿'));
    assert.ok(suena(vocales, 'a') && suena(vocales, 'É') && !suena(vocales, 'k'));
  });

  test('las pausas: la coma respira, el punto descansa', () => {
    const v = VOCES.nori;
    assert.equal(duracionLetra(v, 'a'), v.msPorLetra);
    assert.ok(duracionLetra(v, ' ') > v.msPorLetra);
    assert.ok(duracionLetra(v, ',') > duracionLetra(v, ' '));
    assert.ok(duracionLetra(v, '.') > duracionLetra(v, ','));
    assert.equal(duracionLetra(v, '?'), duracionLetra(v, '.'));
  });

  test('se calla con el mute y de noche', () => {
    assert.equal(puedeSonar({ silenciado: false, hora: 12 }), true);
    assert.equal(puedeSonar({ silenciado: true, hora: 12 }), false);
    assert.equal(puedeSonar({ silenciado: false, hora: SILENCIO_DESDE }), false);
    assert.equal(puedeSonar({ silenciado: false, hora: 2 }), false);
    assert.equal(puedeSonar({ silenciado: false, hora: SILENCIO_HASTA - 1 }), false);
    assert.equal(puedeSonar({ silenciado: false, hora: SILENCIO_HASTA }), true);
    assert.equal(puedeSonar({ silenciado: false, hora: SILENCIO_DESDE - 1 }), true);
    assert.deepEqual([SILENCIO_DESDE, SILENCIO_HASTA], [23, 8]);
  });
});

/* =========================================================== caricias === */
describe('la caricia', () => {
  test('vibra 20-40-20', () => {
    assert.deepEqual([...PATRON_VIBRACION], [20, 40, 20]);
    const llamadas = [];
    assert.equal(vibrar({ vibrate: (p) => { llamadas.push(p); return true; } }), true);
    assert.deepEqual([...llamadas[0]], [20, 40, 20]);
    assert.equal(vibrar({}), false, 'sin vibración no explota');
    assert.equal(vibrar({ vibrate: () => { throw new Error('bloqueada'); } }), false);
    assert.equal(vibrar(null), false);
  });

  test('un toque quieto no es una caricia; moverse sí', () => {
    assert.equal(esCaricia(0, 0), false);
    assert.equal(esCaricia(UMBRAL_CARICIA_PX - 1, 0), false);
    assert.equal(esCaricia(UMBRAL_CARICIA_PX, 0), true);
    assert.equal(esCaricia(10, 10), true);
    assert.equal(esCaricia(-20, 0), true);
    assert.ok(SOLTAR_MS >= 300 && SOLTAR_MS <= 1500, 'vuelve a su ánimo enseguida, pero no de golpe');
  });

  test('los corazones suben y se van', () => {
    const t = trayectoria(() => 0.5);
    assert.equal(t.cuadros.length, 4);
    assert.equal(t.cuadros[0].opacity, 0);
    assert.equal(t.cuadros[1].opacity, 1);
    assert.equal(t.cuadros[2].opacity, 1, 'entero la mayor parte del viaje');
    assert.equal(t.cuadros[3].opacity, 0);
    assert.match(t.cuadros[3].transform, /- 120px/);
    assert.ok(t.duracion >= 1300 && t.duracion <= 1900);
  });
});

/* =============================================================== desk === */
describe('el modo escritorio', () => {
  test('de noche: a oscuras en la maceta o de 23 a 7', () => {
    assert.equal(esDeNoche({ lux: 500, hora: 15 }), false);
    assert.equal(esDeNoche({ lux: LUX_NOCHE - 1, hora: 15 }), true);
    assert.equal(esDeNoche({ lux: LUX_NOCHE, hora: 15 }), false);
    assert.equal(esDeNoche({ lux: 500, hora: 23 }), true);
    assert.equal(esDeNoche({ lux: 500, hora: 3 }), true);
    assert.equal(esDeNoche({ lux: 500, hora: 7 }), false);
    assert.equal(esDeNoche({ lux: null, hora: 12 }), false, 'sin dato de luz, es de día');
    assert.equal(esDeNoche({ lux: null, hora: 0 }), true);
  });

  test('la cara ocupa la pantalla sin pasarse del renderer', () => {
    assert.equal(ladoDesk(390, 844), Math.round(390 * 0.92));
    assert.equal(ladoDesk(844, 390), Math.round(390 * 0.74));
    assert.equal(ladoDesk(1920, 1080), LADO_MAX);
    assert.equal(ladoDesk(100, 100), LADO_MIN);
  });
});
