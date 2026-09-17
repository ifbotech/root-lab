/* Calibrar el sensor de tierra y decir cuánta agua. */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  errorDeCalibracion, calibracionValida, normalizarCalibracion, porcentajeDeCrudo, normalizarMaceta, litrosDeSustrato,
  aguaParaRegar, aguaEnPalabras, CRUDO_PISO, CRUDO_TECHO, CAL_TRAMO_MIN, CAL_POR_DEFECTO, CALIBRANDO_MS, AGUA,
} from '../public/lib/riego.mjs';
import { escenario, conRooti } from './ayudas.mjs';

describe('la calibración', () => {
  test('las reglas son las del firmware (nodo/soil.h y soil.c)', { skip: (() => { try { readFileSync(new URL('../../rootkit/firmware/nodo/soil.h', import.meta.url)); return false; } catch { return 'sin el repo rootkit al lado'; } })() }, () => {
    const h = readFileSync(new URL('../../rootkit/firmware/nodo/soil.h', import.meta.url), 'utf8');
    const c = readFileSync(new URL('../../rootkit/firmware/nodo/soil.c', import.meta.url), 'utf8');
    assert.equal(Number(h.match(/RK_SOIL_RAW_FLOOR\s+(\d+)u/)[1]), CRUDO_PISO);
    assert.equal(Number(h.match(/RK_SOIL_RAW_CEIL\s+(\d+)u/)[1]), CRUDO_TECHO);
    assert.equal(Number(h.match(/RK_SOIL_CAL_MIN_SPAN\s+(\d+)u/)[1]), CAL_TRAMO_MIN);
    const def = c.match(/RK_SOIL_CAL_DEFAULT = \{ (\d+)u, (\d+)u \}/);
    assert.deepEqual({ seco: Number(def[1]), mojado: Number(def[2]) }, CAL_POR_DEFECTO);
  });

  test('qué calibración sirve y por qué no, en palabras para una persona', () => {
    assert.equal(errorDeCalibracion({ seco: 3100, mojado: 1300 }), null);
    assert.match(errorDeCalibracion({ seco: 1300, mojado: 3100 }), /invirtieron/);
    assert.match(errorDeCalibracion({ seco: 2000, mojado: 1800 }), /muy cerca/);
    assert.match(errorDeCalibracion({ seco: 4090, mojado: 1300 }), /conectado/);
    assert.match(errorDeCalibracion({ seco: 3000, mojado: 100 }), /corto/);
    assert.match(errorDeCalibracion({ seco: 3000 }), /Faltan/);
    assert.match(errorDeCalibracion(null), /Faltan/);
    assert.equal(calibracionValida({ seco: '3100', mojado: '1300' }), true, 'los números pueden venir como texto');
    assert.deepEqual(normalizarCalibracion({ seco: 3100.4, mojado: '1300', basura: 1 }), { seco: 3100, mojado: 1300 });
    assert.equal(normalizarCalibracion({ seco: 1, mojado: 2 }), null);
  });

  test('crudo a porcentaje, igual que rk_soil_pct', () => {
    const cal = { seco: 3000, mojado: 1000 };
    assert.equal(porcentajeDeCrudo(3000, cal), 0);
    assert.equal(porcentajeDeCrudo(1000, cal), 100);
    assert.equal(porcentajeDeCrudo(2000, cal), 50);
    assert.equal(porcentajeDeCrudo(3300, cal), 0, 'un poco más seco que el aire: 0');
    assert.equal(porcentajeDeCrudo(3500, cal), null, 'mucho más: no es creíble');
    assert.equal(porcentajeDeCrudo(500, cal), null);
    assert.equal(porcentajeDeCrudo(100, cal), null, 'por debajo del piso');
    assert.equal(porcentajeDeCrudo(2000, { seco: 1, mojado: 2 }), null);
    assert.equal(porcentajeDeCrudo(1915), 50, 'con la de fábrica');
  });
});

describe('cuánta agua', () => {
  test('una maceta: diámetro entre 5 y 80 cm', () => {
    assert.deepEqual(normalizarMaceta({ diametro_cm: '14' }), { diametro_cm: 14 });
    assert.deepEqual(normalizarMaceta({ diametro_cm: 20, alto_cm: 25 }), { diametro_cm: 20, alto_cm: 25 });
    assert.equal(normalizarMaceta({ diametro_cm: 3 }), null);
    assert.equal(normalizarMaceta({ diametro_cm: 200 }), null);
    assert.equal(normalizarMaceta(null), null);
    assert.ok(Math.abs(litrosDeSustrato({ diametro_cm: 14 }) - 1.649) < 0.01, 'una maceta de 14 tiene ~1,6 l');
    assert.ok(litrosDeSustrato({ diametro_cm: 30 }) > 15);
  });

  test('el orden de magnitud correcto, redondeado a 10 ml y acotado', () => {
    const monstera = { soil_min: 25, soil_max: 60 };
    const chica = aguaParaRegar({ suelo: 15, ...monstera, maceta: { diametro_cm: 12 } });
    const grande = aguaParaRegar({ suelo: 15, ...monstera, maceta: { diametro_cm: 30 } });
    assert.ok(chica >= 100 && chica <= 250, `una maceta de 12 con sed: ${chica} ml`);
    assert.ok(grande >= 2000, `una de 30: ${grande} ml`);
    assert.equal(chica % AGUA.paso_ml, 0);
    assert.equal(aguaParaRegar({ suelo: 45, ...monstera, maceta: { diametro_cm: 12 } }), 0, 'en el medio del rango no hace falta');
    assert.equal(aguaParaRegar({ suelo: 42, ...monstera, maceta: { diametro_cm: 5 } }), AGUA.min_ml, 'nunca menos que un chorrito');
    assert.equal(aguaParaRegar({ suelo: 0, ...monstera, maceta: { diametro_cm: 80 } }), AGUA.max_ml);
    assert.equal(aguaParaRegar({ suelo: 15, ...monstera }), null, 'sin maceta no se inventa');
    assert.equal(aguaParaRegar({ suelo: null, ...monstera, maceta: { diametro_cm: 12 } }), null);
    assert.equal(aguaParaRegar({ suelo: 15, soil_min: 60, soil_max: 25, maceta: { diametro_cm: 12 } }), null);
  });

  test('en palabras de cocina', () => {
    assert.equal(aguaEnPalabras(50), '50 ml (un chorrito)');
    assert.equal(aguaEnPalabras(180), '180 ml (un vaso)');
    assert.equal(aguaEnPalabras(500), '500 ml (medio litro)');
    assert.equal(aguaEnPalabras(1000), '1 l (un litro)');
    assert.equal(aguaEnPalabras(2500), '2,5 l (2,5 litros)');
    assert.equal(aguaEnPalabras(0), '');
  });
});

describe('por la API', () => {
  test('la calibración se guarda, llega al Rooti en el sync y se puede volver a la de fábrica', async () => {
    const esc = escenario();
    const { maceta, token, planta } = await conRooti(esc);
    let [c, n] = await esc.llamar('PATCH', `/api/plantas/${planta.id}`, { token, cuerpo: { calibracion: { seco: 1300, mojado: 3100 } } });
    assert.equal(c, 400);
    assert.match(n.error, /invirtieron/);
    [c, n] = await esc.llamar('PATCH', `/api/plantas/${planta.id}`, { token, cuerpo: { calibracion: { seco: 3100, mojado: 1300 } } });
    assert.equal(c, 200);
    assert.deepEqual([n.calibracion.seco, n.calibracion.mojado], [3100, 1300]);
    assert.ok(n.calibracion.t > 0);
    const [, r] = await maceta.sync();
    assert.deepEqual(r.calibracion, { seco: 3100, mojado: 1300 }, 'en el formato que lee net/nube.c');
    [, n] = await esc.llamar('PATCH', `/api/plantas/${planta.id}`, { token, cuerpo: { calibracion: null } });
    assert.equal(n.calibracion, null);
    assert.equal((await maceta.sync())[1].calibracion, undefined);
  });

  test('calibrando: diez minutos de lecturas seguidas, con el crudo a la vista', async () => {
    const esc = escenario();
    const { maceta, token, planta } = await conRooti(esc);
    assert.equal((await maceta.sync())[1].calibrando, undefined);
    let [c, n] = await esc.llamar('POST', `/api/plantas/${planta.id}/calibrar`, { token, cuerpo: { activo: true } });
    assert.equal(c, 200);
    assert.equal(n.calibrando, true);
    assert.equal((await maceta.sync())[1].calibrando, true);
    maceta.medir({ suelo: 12, suelo_raw: 2890, animo: 'HAPPY', sev: 'OK' });
    maceta.pasar(5);
    await maceta.sync();
    [, n] = await esc.llamar('GET', `/api/plantas/${planta.id}`, { token });
    assert.equal(n.tel.suelo_raw, 2890, 'la app ve el número crudo');
    /* Guardar la calibración la termina; y si nadie la termina, se apaga sola. */
    await esc.llamar('PATCH', `/api/plantas/${planta.id}`, { token, cuerpo: { calibracion: { seco: 2890, mojado: 1200 } } });
    assert.equal((await maceta.sync())[1].calibrando, undefined);
    await esc.llamar('POST', `/api/plantas/${planta.id}/calibrar`, { token });
    esc.reloj.t += CALIBRANDO_MS + 1000;
    assert.equal((await maceta.sync())[1].calibrando, undefined, 'a los diez minutos se apaga sola');
    [c, n] = await esc.llamar('POST', `/api/plantas/${planta.id}/calibrar`, { token, cuerpo: { activo: false } });
    assert.equal(n.calibrando, false);
    const otra = await conRooti(esc);
    assert.equal((await esc.llamar('POST', `/api/plantas/${planta.id}/calibrar`, { token: otra.token }))[0], 404, 'la planta de otro no');
  });

  test('con la maceta cargada, la planta dice cuánta agua', async () => {
    const esc = escenario();
    const { maceta, token, planta } = await conRooti(esc);
    await esc.llamar('PATCH', `/api/plantas/${planta.id}`, { token, cuerpo: { especie: 'monstera' } });
    maceta.medir({ suelo: 15, animo: 'THIRSTY', sev: 'WATCH' });
    maceta.pasar(60);
    await maceta.sync();
    let [, n] = await esc.llamar('GET', `/api/plantas/${planta.id}`, { token });
    assert.equal(n.agua_ml, null, 'sin maceta no se inventa');
    let c;
    [c, n] = await esc.llamar('PATCH', `/api/plantas/${planta.id}`, { token, cuerpo: { maceta: { diametro_cm: 14 } } });
    assert.equal(c, 200);
    assert.deepEqual(n.maceta, { diametro_cm: 14 });
    assert.ok(n.agua_ml >= 150 && n.agua_ml <= 400, `${n.agua_ml} ml`);
    [c] = await esc.llamar('PATCH', `/api/plantas/${planta.id}`, { token, cuerpo: { maceta: { diametro_cm: 2 } } });
    assert.equal(c, 400);
    [, n] = await esc.llamar('PATCH', `/api/plantas/${planta.id}`, { token, cuerpo: { maceta: null } });
    assert.equal(n.maceta, null);
  });
});
