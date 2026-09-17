/* El cuerpo de los Rooties: que la silueta que se dibuja se pueda imprimir. */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  SILUETAS, ROOTIES, BASE_Y, VOLADIZO_MAX, ANCHO, POLVO_MAX,
  trazado, muestrear, voladizoMaximo, dentro, centroide, poligonoDe, biselDe, coloresDe, posicionesPolvo, areaConSigno,
} from '../public/lib/cuerpo.mjs';
import { MODELOS, RAREZAS, pielDe } from '../public/lib/rooties.mjs';

describe('las siluetas de los Rooties', () => {
  test('hay una por cada Rooti del firmware', () => {
    assert.deepEqual([...ROOTIES].sort(), MODELOS.map((m) => m.id).sort());
  });

  for (const id of Object.keys(SILUETAS)) {
    const s = SILUETAS[id];
    const pol = poligonoDe(id);

    test(`${id}: ningún voladizo pasa de 45° sobre la curva dibujada`, () => {
      const { grados, donde } = voladizoMaximo(pol);
      assert.ok(grados <= VOLADIZO_MAX, `${id} tiene ${grados}° en ${donde}`);
    });

    test(`${id}: la base es plana y está apoyada`, () => {
      const primero = s.contorno[0];
      const ultimo = s.contorno[s.contorno.length - 1];
      assert.equal(primero[1], BASE_Y);
      assert.equal(ultimo[1], BASE_Y);
      assert.ok(ultimo[0] - primero[0] >= 60, 'una base de al menos 60 de 200: no se vuelca');
      assert.ok(pol.every(([, y]) => y <= BASE_Y + 0.01), 'nada baja de la cama');
      assert.match(trazado(s.contorno, { base: true }), /Z$/, 'se cierra con la recta de la base');
    });

    test(`${id}: el centro de masa cae bajo, sobre la base`, () => {
      const [cx, cy] = centroide(pol);
      const arriba = Math.min(...pol.map(([, y]) => y));
      assert.ok(cy > (arriba + BASE_Y) / 2, `el centro (${cy.toFixed(1)}) queda en la mitad de abajo`);
      assert.ok(cx > s.contorno[0][0] && cx < s.contorno[s.contorno.length - 1][0], 'y encima de la base');
    });

    test(`${id}: la ventana del TFT entra entera con su bisel`, () => {
      const b = biselDe(id);
      for (const p of [[b.x0, b.y0], [b.x1, b.y0], [b.x0, b.y1], [b.x1, b.y1]]) {
        assert.ok(dentro(p, pol), `la esquina ${p} del bisel está dentro`);
      }
      assert.ok(b.y1 < BASE_Y, 'no toca la base');
      assert.ok(s.ventana.lado >= 60 && s.ventana.lado <= 72, 'del tamaño del área activa de 1,44"');
    });

    test(`${id}: el polvo cae sobre el cuerpo, fuera de la pantalla y siempre en el mismo lugar`, () => {
      const motas = posicionesPolvo(id);
      assert.equal(motas.length, POLVO_MAX);
      const b = biselDe(id);
      for (const m of motas) {
        assert.ok(dentro([m.x, m.y], pol));
        assert.ok(!(m.x > b.x0 && m.x < b.x1 && m.y > b.y0 && m.y < b.y1), 'no tapa la cara');
      }
      assert.deepEqual(posicionesPolvo(id), motas);
      assert.equal(posicionesPolvo(id, 4).length, 4);
    });

    if (s.brazo) {
      test(`${id}: el brazo que saluda, en reposo, es parte de la silueta que se imprime`, () => {
        const contorno = poligonoDe(id);
        for (const p of s.brazo.puntos.slice(1, -1)) assert.ok(dentro(p, contorno) || contorno.some(([x, y]) => Math.hypot(x - p[0], y - p[1]) < 3));
      });
    }
  }
});

describe('la geometría', () => {
  test('un cuadrado con la base abajo no tiene voladizos; un techo sí', () => {
    const caja = [[0, BASE_Y], [0, 100], [100, 100], [100, BASE_Y]];
    assert.equal(voladizoMaximo(caja).grados, 0);
    const hongo = [[40, BASE_Y], [40, 150], [0, 150], [0, 100], [100, 100], [100, 150], [60, 150], [60, BASE_Y]];
    assert.equal(voladizoMaximo(hongo).grados, 90, 'el ala plana del hongo es 90°');
    const rampa = [[40, BASE_Y], [0, 168], [0, 100], [100, 100], [100, 168], [60, BASE_Y]];
    assert.equal(voladizoMaximo(rampa).grados, 45);
  });

  test('da lo mismo el sentido en que se recorre', () => {
    const rampa = [[40, BASE_Y], [0, 150], [0, 100], [100, 100], [100, 150], [60, BASE_Y]];
    assert.equal(voladizoMaximo([...rampa].reverse()).grados, voladizoMaximo(rampa).grados);
    assert.ok(areaConSigno(rampa) * areaConSigno([...rampa].reverse()) < 0);
  });

  test('una esquina no se suaviza; un punto común sí', () => {
    const d = trazado([[0, 0], [10, 0, 1], [10, 10]]);
    assert.match(d, /C1.7,0 10,0 10,0 C10,0 /, 'la tangente de la esquina es cero, a los dos lados');
    const curva = muestrear([[0, 0], [10, 0], [10, 10]], { pasos: 4 });
    assert.equal(curva.length, 9);
    assert.deepEqual(curva.at(-1), [10, 10]);
  });

  test('centroide y dentro de un rectángulo', () => {
    const r = [[0, 0], [ANCHO, 0], [ANCHO, 100], [0, 100]];
    assert.deepEqual(centroide(r).map(Math.round), [100, 50]);
    assert.ok(dentro([5, 5], r));
    assert.ok(!dentro([-5, 5], r));
  });
});

describe('los colores del cuerpo', () => {
  test('salen de la piel, con un rol por Rooti', () => {
    const hex = /^#[0-9a-f]{6}$/;
    for (const m of MODELOS) {
      for (const r of RAREZAS) {
        const piel = pielDe(m.id, r);
        const c = coloresDe(m.id, piel);
        for (const [k, v] of Object.entries(c)) assert.match(v, hex, `${m.id}-${r}.${k}`);
      }
    }
    assert.equal(coloresDe('brote', pielDe('brote', 'epico')).cuerpo, pielDe('brote', 'epico').piel);
    assert.equal(coloresDe('pinchito', pielDe('pinchito', 'raro')).acento, pielDe('pinchito', 'raro').piel, 'la flor del cactus es la piel');
    assert.notEqual(coloresDe('champi', pielDe('champi', 'comun')).cuerpo, pielDe('champi', 'comun').piel, 'el tallo es claro; el sombrero, la piel');
  });
});
