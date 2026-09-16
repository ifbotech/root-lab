/* El pasaporte botánico: los números del último mes, sin inventar. */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { resumenHistorial, edadEnDias, loQueMasLePaso, numeroDePasaporte } from '../public/lib/pasaporte.mjs';

const H = 3600 * 1000;

describe('el pasaporte', () => {
  test('el resumen del mes: medias, mínimos, máximos y cuánto estuvo cómoda', () => {
    const puntos = [];
    for (let i = 0; i < 48; i++) {
      puntos.push({ t: i * H, soil_pct: 30 + (i % 10), temp_dc: 200 + i, rh_pct: 50, lux: i % 2 ? 4000 : 800, mood: i < 36 ? 'HAPPY' : 'THIRSTY' });
    }
    puntos.push({ t: 48 * H, soil_pct: null, temp_dc: null, rh_pct: null, lux: null, mood: 'OFFLINE' });
    const r = resumenHistorial(puntos);
    assert.equal(r.lecturas, 49);
    assert.equal(r.dias, 2);
    assert.deepEqual(r.suelo, { media: 34, min: 30, max: 39, n: 48 });
    assert.equal(r.temp.min, 200);
    assert.equal(r.temp.max, 247);
    assert.equal(r.hr.media, 50);
    assert.equal(r.lux.max, 4000);
    assert.equal(r.comoda_pct, 75, '36 de 48 con ánimo (OFFLINE no cuenta)');
    assert.deepEqual(r.animos, { HAPPY: 36, THIRSTY: 12 });
    assert.equal(loQueMasLePaso(r.animos), 'THIRSTY');
    assert.equal(loQueMasLePaso({ HAPPY: 10 }), null);
  });

  test('sin lecturas no hay números', () => {
    const r = resumenHistorial([]);
    assert.equal(r.lecturas, 0);
    assert.equal(r.suelo, null);
    assert.equal(r.comoda_pct, null);
    assert.equal(r.dias, 0);
    assert.deepEqual(resumenHistorial(null).animos, {});
  });

  test('la edad y el número', () => {
    const creada = Date.parse('2026-08-01T12:00:00Z');
    assert.equal(edadEnDias(creada, Date.parse('2026-09-16T12:00:00Z')), 46);
    assert.equal(edadEnDias(creada, creada - 5), 0);
    assert.equal(edadEnDias(null), null);
    assert.match(numeroDePasaporte('p5c803202915f'), /^RL-\d{6}$/);
    assert.equal(numeroDePasaporte('p1'), numeroDePasaporte('p1'), 'estable');
    assert.notEqual(numeroDePasaporte('p1'), numeroDePasaporte('p2'));
  });
});
