/* El tope de gasto y las cuotas: la capa que protege la tarjeta. */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { abrirBase } from '../server/db.mjs';
import {
  crearPresupuesto, costoMicro, precioDe, PRECIOS_POR_DEFECTO, LIMITES_POR_DEFECTO,
} from '../server/presupuesto.mjs';

const T0 = Date.parse('2026-09-16T15:00:00-03:00');

function armar(opciones = {}) {
  const reloj = { t: T0 };
  const db = abrirBase();
  db.cuentaCrear({ id: 'c1', email: 'ana@ejemplo.com', clave_hash: 'x', tz: 'America/Argentina/Buenos_Aires', creada: 1 });
  const alertas = [];
  const p = crearPresupuesto({ db, reloj: () => reloj.t, alAlerta: (a) => alertas.push(a), ...opciones });
  return { reloj, db, p, alertas, cuenta: db.cuenta('c1') };
}

describe('precios', () => {
  test('un dólar por millón es un micro-dólar por token', () => {
    assert.equal(costoMicro('claude-sonnet-5', { entrada: 1000, salida: 100 }), 1000 * 3 + 100 * 15);
    assert.equal(costoMicro('claude-opus-5', { entrada: 2000, salida: 500 }), 2000 * 5 + 500 * 25);
  });

  test('el caché de prompts se cobra como corresponde', () => {
    assert.equal(costoMicro('claude-sonnet-5', { cache_escritura: 1000 }), 3750);
    assert.equal(costoMicro('claude-sonnet-5', { cache_lectura: 1000 }), 300);
  });

  test('versiones con fecha usan su familia; lo desconocido se cobra como lo más caro', () => {
    assert.deepEqual(precioDe('claude-haiku-4-5-20251001'), PRECIOS_POR_DEFECTO['claude-haiku-4-5']);
    assert.deepEqual(precioDe('un-modelo-nuevo'), PRECIOS_POR_DEFECTO['claude-opus-5']);
  });
});

describe('cuotas', () => {
  test('plan gratis: 3 mensajes de chat por día por cuenta', () => {
    const { p, cuenta } = armar();
    assert.deepEqual(LIMITES_POR_DEFECTO.gratis.chat, 3);
    for (let i = 0; i < 3; i++) {
      p.verificarCuota(cuenta, 'chat');
      p.registrar({ cuenta, planta: 'p1', tipo: 'chat', fuente: 'simulada' });
    }
    assert.deepEqual(p.cuota(cuenta, 'chat'), { usados: 3, limite: 3, restantes: 0 });
    assert.throws(() => p.verificarCuota(cuenta, 'chat'), (e) => e.codigo === 429 && /mañana/i.test(e.message));
  });

  test('la cuota se renueva a la medianoche de la persona, no a la de UTC', () => {
    const { p, cuenta, reloj } = armar();
    reloj.t = Date.parse('2026-09-16T23:30:00-03:00');   /* 02:30 del 17 en UTC */
    for (let i = 0; i < 3; i++) p.registrar({ cuenta, tipo: 'chat', fuente: 'simulada' });
    assert.equal(p.cuota(cuenta, 'chat').restantes, 0);
    reloj.t = Date.parse('2026-09-16T23:59:00-03:00');
    assert.equal(p.cuota(cuenta, 'chat').restantes, 0, 'sigue siendo el 16 en Buenos Aires');
    reloj.t = Date.parse('2026-09-17T00:01:00-03:00');
    assert.equal(p.cuota(cuenta, 'chat').restantes, 3);
  });

  test('reconocer y diagnosticar cuentan por Rooti', () => {
    const { p, cuenta } = armar();
    for (let i = 0; i < 3; i++) p.registrar({ cuenta, planta: 'p1', tipo: 'identificar', fuente: 'simulada' });
    assert.throws(() => p.verificarCuota(cuenta, 'identificar', 'p1'), /este Rooti/);
    assert.equal(p.cuota(cuenta, 'identificar', 'p2').restantes, 3, 'otro Rooti tiene su propia cuota');
  });

  test('el plan pro tiene más, y un plan desconocido cae en gratis', () => {
    const { p } = armar();
    assert.equal(p.limitesDe({ plan: 'pro' }).chat, 200);
    assert.equal(p.limitesDe({ plan: 'raro' }).chat, 3);
  });
});

describe('tope de gasto', () => {
  test('antes de llamar se suma lo peor que puede costar la llamada', () => {
    const { p, cuenta } = armar({ topeDiaUsd: 0.01, topeMesUsd: 10 });
    p.verificarTope('claude-sonnet-5', { entrada: 1000, salida: 350 });      /* 8.250 µ$ */
    p.registrar({ cuenta, tipo: 'chat', fuente: 'claude', modelo: 'claude-sonnet-5', uso: { entrada: 1000, salida: 100 } });
    assert.throws(() => p.verificarTope('claude-sonnet-5', { entrada: 1000, salida: 350 }), (e) => e.codigo === 503);
  });

  test('el tope mensual también frena, y lo simulado no cuesta', () => {
    const { p, cuenta } = armar({ topeDiaUsd: 100, topeMesUsd: 0.05 });
    p.registrar({ cuenta, tipo: 'identificar', fuente: 'simulada', modelo: 'claude-opus-5', uso: { entrada: 99999, salida: 99999 } });
    assert.equal(p.estado().gastado_mes_usd, 0);
    p.registrar({ cuenta, tipo: 'identificar', fuente: 'claude', modelo: 'claude-opus-5', uso: { entrada: 3000, salida: 1500 } });
    assert.throws(() => p.verificarTope('claude-opus-5', { entrada: 3500, salida: 1500 }), /pausa/);
  });

  test('avisa al 80 % y al 100 %, una sola vez por período', () => {
    const { p, cuenta, alertas, reloj } = armar({ topeDiaUsd: 1, topeMesUsd: 1000 });
    const gastar = (usd) => p.registrar({ cuenta, tipo: 'chat', fuente: 'claude', modelo: 'claude-haiku-4-5', uso: { salida: Math.round((usd * 1e6) / 5) } });
    gastar(0.5);
    assert.equal(alertas.length, 0);
    gastar(0.35);
    assert.deepEqual(alertas.map((a) => [a.periodo, a.umbral]), [['diario', 80]]);
    gastar(0.01);
    assert.equal(alertas.length, 1, 'no repite');
    gastar(0.2);
    assert.deepEqual(alertas.map((a) => a.umbral), [80, 100]);
    reloj.t += 24 * 3600 * 1000;
    gastar(0.9);
    assert.equal(alertas.length, 3, 'al día siguiente vuelve a avisar');
  });
});
