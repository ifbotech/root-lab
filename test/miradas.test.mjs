/* El invernadero: hacia dónde mira cada Rooti. */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { miradaDe, miradasDe, vecinoEnfermo, PREOCUPANTES, CICLO_S } from '../public/lib/miradas.mjs';

const rooti = (mood = 'HAPPY', revelado = true) => ({ revelado, mood });
const quieta = { mira_x: 0, mira_y: 0, preocupado: 0 };

describe('las miradas del invernadero', () => {
  test('solo o dormido, mira al frente', () => {
    assert.deepEqual(miradaDe(0, [rooti()], 5000), quieta);
    assert.deepEqual(miradaDe(0, [rooti('HAPPY', false), rooti()], 5000), quieta);
    assert.deepEqual(miradaDe(3, [rooti()], 5000), quieta, 'un índice que no existe');
  });

  test('los vecinos miran preocupados al que tiene sed; el que tiene sed mira al frente', () => {
    const fila = [rooti(), rooti('THIRSTY'), rooti(), rooti()];
    assert.equal(vecinoEnfermo(0, fila), 1);
    assert.equal(vecinoEnfermo(3, fila), 1);
    assert.equal(vecinoEnfermo(1, fila), -1, 'no se preocupa por sí mismo');
    const izq = miradaDe(0, fila, 0);
    assert.equal(izq.mira_x, 85, 'a la derecha, donde está');
    assert.equal(izq.preocupado, 100);
    const der = miradaDe(2, fila, 0);
    assert.equal(der.mira_x, -85, 'a la izquierda');
    assert.equal(der.preocupado, 100);
    const lejos = miradaDe(3, fila, 0);
    assert.equal(lejos.mira_x, -60);
    assert.ok(lejos.preocupado < 100 && lejos.preocupado > 0, 'de lejos, menos');
    assert.deepEqual(miradaDe(1, fila, 0), quieta);
    assert.ok(PREOCUPANTES.has('COLD'), 'el frío también preocupa');
  });

  test('hasta el más preocupado descansa la vista un rato', () => {
    const fila = [rooti(), rooti('COLD')];
    let mirando = 0;
    for (let s = 0; s < 90; s++) if (miradaDe(0, fila, s * 1000).preocupado > 0) mirando += 1;
    assert.ok(mirando > 50 && mirando < 75, `${mirando} de 90 segundos mirando`);
  });

  test('todos bien: vistazos cortos al de al lado, casi siempre al frente, nunca fuera de la fila', () => {
    const fila = [rooti(), rooti(), rooti()];
    let vistazos = 0;
    for (let ms = 0; ms < CICLO_S * 1000 * 3; ms += 200) {
      const m = miradasDe(fila, ms);
      for (const x of m) assert.equal(x.preocupado, 0);
      if (m[0].mira_x) { assert.ok(m[0].mira_x > 0, 'el primero sólo tiene vecino a la derecha'); vistazos += 1; }
      if (m[2].mira_x) assert.ok(m[2].mira_x < 0, 'el último, sólo a la izquierda');
    }
    assert.ok(vistazos > 0);
    assert.ok(vistazos < (CICLO_S * 1000 * 3) / 200 / 2, 'la mayor parte del tiempo mira al frente');
    assert.notDeepEqual(miradaDe(0, fila, 4500), miradaDe(1, fila, 4500), 'a destiempo entre uno y otro');
  });

  test('es función del tiempo: el mismo instante da la misma mirada', () => {
    const fila = [rooti(), rooti('DROWNING'), rooti()];
    assert.deepEqual(miradasDe(fila, 1234567), miradasDe(fila, 1234567));
  });
});
