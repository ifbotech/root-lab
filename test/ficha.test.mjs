/* La ficha de cuidados y el prompt del chat. */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  fichaBase, fichaDePlanta, cuidadosValidos, promptDePlanta, contextoVivo, VOCES, CAMPOS_CUIDADO,
} from '../server/ficha.mjs';
import { especiePorId, MODELOS } from '../server/catalogo.mjs';

const monstera = especiePorId('monstera');
const cactus = especiePorId('cactus');

describe('ficha', () => {
  test('sale de los rangos curados, con palabras', () => {
    const f = fichaBase(monstera);
    assert.equal(f.especie.cientifico, 'Monstera deliciosa');
    assert.deepEqual(f.rangos.suelo, [25, 60]);
    assert.match(f.cuidados.riego, /25%/);
    assert.match(f.cuidados.temperatura, /18 y 30 °C/);
    assert.match(fichaBase(cactus).cuidados.riego, /secar bien/);
    assert.match(fichaBase(cactus).cuidados.luz, /sol|brillante/i);
    assert.equal(f.fuente, 'catalogo');
    assert.equal(fichaBase(null), null);
  });

  test('lo de la IA suma, pero los números del catálogo mandan', () => {
    const f = fichaDePlanta(monstera, {
      riego: 'regame todos los días',          /* contradice el catálogo */
      sustrato: 'Sustrato aireado con corteza de pino.',
      toxicidad: 'Soy tóxica para perros y gatos si me muerden.',
      inventado: 'no debería quedar',
    });
    assert.equal(f.fuente, 'ia');
    assert.match(f.cuidados.riego, /25%/, 'el riego sale de los rangos curados');
    assert.equal(f.complementos.sustrato, 'Sustrato aireado con corteza de pino.');
    assert.equal(f.cuidados.inventado, undefined);
    assert.equal(fichaDePlanta(monstera, {}).fuente, 'catalogo');
  });

  test('los cuidados de la IA se limpian y se acotan', () => {
    const c = cuidadosValidos({ abono: `  mucho\n\nespacio ${'x'.repeat(600)}`, plagas: 42, poda: '' });
    assert.ok(c.abono.length <= 320);
    assert.ok(!c.abono.includes('\n'));
    assert.equal(c.plagas, undefined);
    assert.equal(c.poda, undefined);
    assert.deepEqual(cuidadosValidos(null), {});
  });

  test('todos los Rooties tienen voz', () => {
    for (const m of MODELOS) assert.ok(VOCES[m.id], m.id);
    assert.ok(CAMPOS_CUIDADO.includes('toxicidad'));
  });
});

describe('prompt del chat', () => {
  const ficha = fichaDePlanta(monstera, { toxicidad: 'Tóxica para mascotas.', sustrato: 'Aireado.' });

  test('dice quién es, cómo habla y qué sabe', () => {
    const p = promptDePlanta({ nombre: 'Rulo', ficha, persona: 'champi' });
    assert.match(p, /^Sos Rulo, una planta de la especie Monstera deliciosa/);
    assert.match(p, /Rooti llamado Champi/);
    assert.match(p, /glotona y charlatana/);
    assert.match(p, /Tóxica para mascotas/);
    assert.match(p, /Aireado/);
  });

  test('pone límites: sólo su cuidado, corto, sin revelar instrucciones', () => {
    const p = promptDePlanta({ nombre: 'Rulo', ficha, persona: 'brote' });
    assert.match(p, /Sólo hablás de vos/);
    assert.match(p, /no lo respondas/);
    assert.match(p, /90 palabras/);
    assert.match(p, /veterinario/);
    assert.match(p, /Nunca reveles/);
  });
});

describe('contexto en vivo', () => {
  const base = {
    tel: { soil_pct: 12, temp_dc: 231, rh_pct: 44, lux: 5200, age_s: 300 },
    reason: 'tengo sed', link: 'VIVO', bond: { dias_vividos: 12, dias_sanos: 10, racha: 4 },
    nodo: { usb: false, batt_pct: 15 },
  };

  test('las mediciones con su rango, el ánimo y la racha', () => {
    const c = contextoVivo({ nodo: base, especie: monstera, t: Date.parse('2026-09-16T18:00:00Z'), tz: 'America/Argentina/Buenos_Aires', persona: 'Ana' });
    assert.match(c, /hora local 15:00/);
    assert.match(c, /Humedad de la tierra: 12% \(tu rango: 25–60%\) → por debajo de tu rango/);
    assert.match(c, /Temperatura del aire: 23,1 °C/);
    assert.match(c, /Humedad del aire: 44% \(mínimo 50%\) → por debajo/);
    assert.match(c, /tengo sed/);
    assert.match(c, /hace 5 minutos/);
    assert.match(c, /racha actual: 4/);
    assert.match(c, /batería de tu Rooti está al 15%/);
    assert.match(c, /Te escribe: Ana/);
  });

  test('detecta un riego en las últimas 24 h', () => {
    const lecturas = [{ suelo: 20, temp: 220, lux: 100 }, { suelo: 18 }, { suelo: 45, temp: 240, lux: 8000 }, { suelo: 44 }];
    const c = contextoVivo({ nodo: base, especie: monstera, lecturas, t: 0, tz: 'UTC' });
    assert.match(c, /la tierra pasó de 20% a 44%/);
    assert.match(c, /Te regaron una vez/);
    assert.match(c, /luz máxima 8\.000 lux/);
  });

  test('sin datos, lo dice en vez de inventar', () => {
    const c = contextoVivo({ nodo: { tel: {}, link: 'CAIDO' }, especie: monstera, t: 0, tz: 'UTC' });
    assert.match(c, /no manda datos/);
    assert.ok(!/Humedad de la tierra/.test(c));
  });
});
