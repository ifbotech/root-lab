/* VPD y DLI: los dos números de invernadero de la pestaña "Avanzado". */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  presionSaturacion, vpd, zonaVpd, dli, dliObjetivo, dliHoyYAyer, juicioDli, LUX_A_UMOL, HUECO_MAX_MS,
} from '../public/lib/botanica.mjs';

const H = 3600 * 1000;

describe('VPD', () => {
  test('la fórmula de Tetens da los valores de tabla', () => {
    assert.ok(Math.abs(presionSaturacion(20) - 2.34) < 0.02);
    assert.ok(Math.abs(presionSaturacion(25) - 3.17) < 0.02);
    assert.equal(vpd(250, 50), 1.58);
    assert.equal(vpd(200, 100), 0, 'aire saturado');
    assert.equal(vpd(200, 0), 2.34, 'aire seco del todo');
    assert.ok(vpd(300, 40) > vpd(200, 40), 'más calor, más déficit');
  });

  test('sin dato no hay VPD', () => {
    assert.equal(vpd(null, 50), null);
    assert.equal(vpd(250, undefined), null);
    assert.equal(vpd('x', 50), null);
    assert.equal(zonaVpd(null), null);
  });

  test('las zonas cubren todo el rango y dicen qué hacer', () => {
    assert.equal(zonaVpd(0.2).nivel, 'muy-bajo');
    assert.equal(zonaVpd(0.6).nivel, 'bajo');
    assert.equal(zonaVpd(1.0).nivel, 'ideal');
    assert.equal(zonaVpd(1.4).nivel, 'alto');
    assert.equal(zonaVpd(3).nivel, 'muy-alto');
    for (const v of [0, 0.5, 1, 1.5, 2, 5]) assert.ok(zonaVpd(v).texto.length > 10);
  });
});

describe('DLI', () => {
  test('12 horas a 10 000 lux son 8 mol/m²', () => {
    const puntos = [];
    for (let i = 0; i <= 12 * 4; i++) puntos.push({ t: i * 15 * 60 * 1000, lux: 10000 });
    const esperado = (10000 * LUX_A_UMOL * 12 * 3600) / 1e6;
    assert.ok(Math.abs(dli(puntos) - esperado) < 0.05, `${dli(puntos)} vs ${esperado}`);
  });

  test('un hueco largo no suma luz, y la ventana recorta', () => {
    const puntos = [{ t: 0, lux: 10000 }, { t: 10 * H, lux: 10000 }, { t: 11 * H, lux: 0 }];
    /* El primer punto vale una hora como mucho; el segundo, hasta el tercero. */
    const esperado = (10000 * LUX_A_UMOL * 2 * 3600) / 1e6;
    assert.ok(Math.abs(dli(puntos) - esperado) < 0.05);
    assert.equal(HUECO_MAX_MS, H);
    assert.ok(dli(puntos, { desde: 10.5 * H }) < dli(puntos), 'desde la mitad del segundo tramo');
    assert.equal(dli([]), 0);
    assert.equal(dli([{ t: 0, lux: null }, { t: 1, lux: 'x' }]), 0);
  });

  test('el objetivo sale del rango de lux de la especie', () => {
    const o = dliObjetivo({ lux_min: 1000, lux_max: 15000 });
    assert.equal(o.min, 0.8);
    assert.equal(o.max, 12);
    assert.equal(dliObjetivo(null), null);
    assert.equal(dliObjetivo({ lux_min: 500 }).max, 1.6, 'sin máximo, cuatro veces el mínimo');
  });

  test('hoy y ayer se separan por la medianoche local', () => {
    const ahora = new Date(2026, 8, 16, 12, 0, 0).getTime();
    const hoy0 = new Date(2026, 8, 16, 0, 0, 0).getTime();
    const puntos = [];
    for (let t = hoy0 - 24 * H; t <= ahora; t += 15 * 60 * 1000) puntos.push({ t, lux: t < hoy0 ? 20000 : 5000 });
    const r = dliHoyYAyer(puntos, ahora);
    assert.equal(r.horasDeHoy, 12);
    assert.ok(r.ayer > r.hoy * 3, 'ayer hubo cuatro veces más luz durante el doble de horas');
    assert.ok(Math.abs(r.hoy - (5000 * LUX_A_UMOL * 12 * 3600) / 1e6) < 0.1);
  });

  test('el juicio proyecta el día entero antes de opinar', () => {
    const objetivo = { min: 4, max: 12 };
    assert.equal(juicioDli({ hoy: 1, horasDeHoy: 2, objetivo }).nivel, 'bien', 'a las 2 de la mañana no se sabe');
    assert.equal(juicioDli({ hoy: 1, horasDeHoy: 10, objetivo }).nivel, 'poco');
    assert.equal(juicioDli({ hoy: 20, horasDeHoy: 10, objetivo }).nivel, 'mucho');
    assert.equal(juicioDli({ hoy: 5, horasDeHoy: 0, objetivo: null }), null);
  });
});
