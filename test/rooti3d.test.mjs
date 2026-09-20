/* Los Rooties en 3D: que los cinco se esculpan bien, que se muevan sin
 * volverse locos y que los colores de cada piel se lean.
 *
 * Lo que NO se prueba acá, a propósito: si la figura se puede imprimir. El
 * personaje de la app y la carcasa del aparato son dos objetos distintos —la
 * carcasa se diseña aparte, en el CAD del hardware— y atar el arte a las
 * reglas de la impresora fue lo que, en la versión anterior, dejó a los cinco
 * convertidos en papas redondas.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { ROOTIES, FIGURAS, ROLES, HUESOS, construir, dentroDe } from '../public/lib/rooti3d/formas.mjs';
import { volumen, superficie, unir, restar, distanciaDe, campo } from '../public/lib/rooti3d/esculpir.mjs';
import { pose, efectos, motasDePolvo, onda, pulso, rebote, limitar } from '../public/lib/rooti3d/animacion.mjs';
import { matrizDeHueso, aRGB } from '../public/lib/rooti3d/motor.mjs';
import { stlBinario } from '../tools/rooties-stl.mjs';
import { coloresDe, PIEL_DORMIDA } from '../public/lib/cuerpo.mjs';
import { MODELOS, RAREZAS, pielDe } from '../public/lib/rooties.mjs';
import { contraste } from '../public/lib/paletas.mjs';

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
/* Cuánto se diferencian dos colores puestos uno al lado del otro. */
const distancia = (a, b) => Math.hypot(...rgb(a).map((v, i) => v - rgb(b)[i]));

const figuras = ROOTIES.map((id) => construir(id));

describe('el elenco', () => {
  test('hay una figura por cada Rooti del firmware', () => {
    assert.deepEqual(ROOTIES.slice().sort(), MODELOS.map((m) => m.id).sort());
  });

  test('cada bulto pide un rol de color y un hueso que existen', () => {
    for (const [id, f] of Object.entries(FIGURAS)) {
      for (const p of [...f.piezas, ...(f.extras || [])]) {
        assert.ok(ROLES.includes(p.rol), `${id}: rol ${p.rol}`);
        assert.ok(!p.hueso || HUESOS.includes(p.hueso), `${id}: hueso ${p.hueso}`);
        assert.ok(p.fundir === undefined || p.fundir >= 0, `${id}: fundir ${p.fundir}`);
      }
    }
  });

  test('cada figura tiene cara, corona y una copa para animar', () => {
    for (const f of figuras) {
      assert.ok(f.cara.ancho >= 30, `${f.id}: la cara es chica`);
      assert.equal(f.corona.length, 2);
      assert.ok(f.pivotes.copa, `${f.id}: no tiene copa`);
      assert.ok(f.pivotes.copa[1] > 30, `${f.id}: la copa nace demasiado abajo`);
    }
  });

  test('todas tienen bracitos, y el cactus levanta uno solo', () => {
    for (const f of figuras) {
      assert.ok(f.pivotes['brazo-izq'], `${f.id}: sin brazo izquierdo`);
      assert.ok(f.pivotes['brazo-der'], `${f.id}: sin brazo derecho`);
    }
    const p = construir('pinchito');
    assert.ok(p.pivotes['brazo-der'][1] > p.pivotes['brazo-izq'][1], 'el brazo que saluda va más arriba');
  });
});

describe('la escultura', () => {
  test('las mallas están cerradas y del derecho', () => {
    for (const f of figuras) {
      assert.ok(volumen(f.malla) > 1000, `${f.id}: volumen ${Math.round(volumen(f.malla))}`);
      assert.ok(f.malla.triangulos > 2000, `${f.id}: sólo ${f.malla.triangulos} triángulos`);
      assert.ok(f.malla.pos.every(Number.isFinite), `${f.id}: posiciones rotas`);
      assert.ok(f.malla.nor.every(Number.isFinite), `${f.id}: normales rotas`);
    }
  });

  test('cada Rooti apoya en el piso y ninguno se hunde', () => {
    for (const f of figuras) {
      assert.ok(Math.abs(f.limites.lo[1]) < 1.5, `${f.id}: empieza en y=${f.limites.lo[1].toFixed(1)}`);
    }
  });

  test('miden lo que tiene que medir una criatura de bolsillo', () => {
    for (const f of figuras) {
      const [ancho, alto] = [f.limites.hi[0] - f.limites.lo[0], f.alto];
      assert.ok(alto > 90 && alto < 160, `${f.id}: mide ${alto.toFixed(0)} de alto`);
      assert.ok(ancho > 60 && ancho < 120, `${f.id}: mide ${ancho.toFixed(0)} de ancho`);
      /* Ni un palo ni una torta: la proporción de un personaje. */
      assert.ok(alto / ancho > 0.9 && alto / ancho < 2, `${f.id}: proporción ${(alto / ancho).toFixed(2)}`);
    }
  });

  test('los pesos de cada vértice suman uno, en los roles y en los huesos', () => {
    for (const f of figuras) {
      const { rol, hue } = f.malla;
      for (let i = 0; i < rol.length; i += 4) {
        const sr = rol[i] + rol[i + 1] + rol[i + 2] + rol[i + 3];
        const sh = hue[i] + hue[i + 1] + hue[i + 2] + hue[i + 3];
        assert.ok(Math.abs(sr - 1) < 0.02, `${f.id}: los roles suman ${sr}`);
        assert.ok(Math.abs(sh - 1) < 0.02, `${f.id}: los huesos suman ${sh}`);
      }
    }
  });

  test('la copa manda arriba y el cuerpo abajo', () => {
    for (const f of figuras) {
      const { pos, hue } = f.malla;
      let arribaCopa = 0; let abajoCopa = 0;
      for (let i = 0; i < pos.length / 3; i++) {
        const y = pos[i * 3 + 1];
        const copa = hue[i * 4 + 1];
        if (y > f.alto * 0.9) arribaCopa += copa;
        if (y < f.alto * 0.25) abajoCopa += copa;
      }
      assert.ok(arribaCopa > 0, `${f.id}: arriba no hay nada de copa`);
      assert.ok(abajoCopa < arribaCopa, `${f.id}: la copa llega hasta los pies`);
    }
  });

  test('la cara cae sobre el frente del bicho', () => {
    for (const f of figuras) {
      const { pos, uv } = f.malla;
      let enRango = 0; let alFrente = 0;
      for (let i = 0; i < uv.length / 2; i++) {
        const u = uv[i * 2]; const v = uv[i * 2 + 1];
        if (u > 0 && u < 1 && v > 0 && v < 1) {
          enRango++;
          if (pos[i * 3 + 2] > 0) alFrente++;
        }
      }
      assert.ok(enRango > 100, `${f.id}: la cara no tiene dónde pintarse (${enRango})`);
      assert.ok(alFrente / enRango > 0.4, `${f.id}: la cara cae atrás`);
    }
  });

  test('la unión suave devuelve la distancia menor y su peso', () => {
    assert.equal(unir(3, 8, 0).d, 3);
    assert.equal(unir(3, 8, 0).t, 0);
    const u = unir(2, 2, 4);
    assert.ok(u.d < 2, 'en el medio la unión abulta');
    assert.ok(Math.abs(u.t - 0.5) < 1e-9);
    assert.ok(restar(-5, -1, 0) > -5, 'restar saca material');
  });

  test('las primitivas dan distancias con signo coherentes', () => {
    const esfera = { tipo: 'esfera', en: [0, 0, 0], r: 10 };
    assert.ok(Math.abs(distanciaDe(esfera, 0, 0, 0) + 10) < 1e-9);
    assert.ok(Math.abs(distanciaDe(esfera, 15, 0, 0) - 5) < 1e-9);
    const cap = { tipo: 'capsula', a: [0, 0, 0], b: [0, 20, 0], ra: 5, rb: 5 };
    assert.ok(Math.abs(distanciaDe(cap, 0, 10, 8) - 3) < 1e-9);
  });

  test('esculpir una esfera da una esfera', () => {
    const m = superficie({ piezas: [{ tipo: 'esfera', en: [0, 30, 0], r: 20, rol: 'cuerpo' }] }, { paso: 2, roles: ROLES, huesos: HUESOS });
    const v = volumen(m);
    const esperado = (4 / 3) * Math.PI * 20 ** 3;
    assert.ok(Math.abs(v - esperado) / esperado < 0.05, `volumen ${v.toFixed(0)} contra ${esperado.toFixed(0)}`);
  });

  test('el piso corta lo que se hunde', () => {
    const receta = { piso: 0, piezas: [{ tipo: 'esfera', en: [0, 5, 0], r: 20, rol: 'cuerpo' }] };
    const d = campo(receta, HUESOS, ROLES).distancia(0, -3, 0);
    assert.ok(d > 0, 'bajo el piso no hay criatura');
  });

  test('dentroDe distingue el adentro del afuera', () => {
    const f = construir('brote');
    assert.ok(dentroDe(f, [0, 30, 0]), 'el centro está adentro');
    assert.ok(!dentroDe(f, [0, 300, 0]), 'el cielo no');
  });
});

describe('el STL de referencia', () => {
  test('sale binario, con todos los triángulos y cabecera de 84 bytes', () => {
    const f = construir('brote');
    const stl = stlBinario(f.malla, 'Brote');
    const n = f.malla.idx.length / 3;
    assert.equal(stl.byteLength, 84 + n * 50);
    assert.equal(new DataView(stl.buffer, stl.byteOffset).getUint32(80, true), n);
  });
});

describe('cómo se mueve', () => {
  const brote = construir('brote');

  test('con el mismo milisegundo da la misma pose', () => {
    assert.deepEqual(pose(brote, { animo: 'HAPPY' }, 4321), pose(brote, { animo: 'HAPPY' }, 4321));
  });

  test('todos los ánimos tienen pose, y ninguna se va de escala', () => {
    const animos = ['HAPPY', 'THIRSTY', 'COLD', 'HOT', 'DROWNING', 'PARCHED_AIR', 'DARK', 'SCORCHED', 'SLEEPING', 'OFFLINE', 'UNKNOWN'];
    for (const animo of animos) {
      for (let t = 0; t < 12000; t += 97) {
        const p = pose(brote, { animo }, t);
        for (const v of [...p.cuerpo.esc, ...p.grupos.copa.esc]) {
          assert.ok(v > 0.8 && v < 1.3, `${animo}: escala ${v}`);
        }
        for (const v of p.cuerpo.giro) assert.ok(Math.abs(v) <= 30, `${animo}: giro ${v}`);
        assert.ok(p.cuerpo.en[1] >= -10 && p.cuerpo.en[1] <= 20, `${animo}: altura ${p.cuerpo.en[1]}`);
        assert.ok(Math.abs(p.mirada[0]) <= 1 && Math.abs(p.mirada[1]) <= 1);
      }
    }
  });

  test('la pose trae siempre los cuatro huesos que el motor necesita', () => {
    for (const f of figuras) {
      const p = pose(f, { animo: 'HAPPY' }, 700);
      assert.deepEqual(Object.keys(p.grupos).sort(), ['brazo-der', 'brazo-izq', 'copa']);
    }
  });

  test('sólo el contento despega los pies del piso', () => {
    const suben = [];
    for (const animo of ['HAPPY', 'THIRSTY', 'COLD', 'HOT', 'DROWNING', 'SCORCHED', 'SLEEPING']) {
      let max = 0;
      for (let t = 0; t < 9000; t += 50) max = Math.max(max, pose(brote, { animo }, t).cuerpo.en[1]);
      if (max > 6) suben.push(animo);
    }
    assert.deepEqual(suben, ['HAPPY']);
  });

  test('el mimo no le borra la sed', () => {
    const conSed = pose(brote, { animo: 'THIRSTY' }, 1000).grupos.copa.giro[0];
    const mimado = pose(brote, { animo: 'THIRSTY', mimo: 1 }, 1000).grupos.copa.giro[0];
    assert.ok(conSed > 10 && mimado < conSed && mimado > 0);
  });

  test('de noche se sienta, aunque esté contento', () => {
    const dia = pose(brote, { animo: 'HAPPY' }, 3000);
    const noche = pose(brote, { animo: 'HAPPY', noche: true }, 3000);
    assert.ok(noche.cuerpo.en[1] < dia.cuerpo.en[1]);
    assert.ok(noche.cuerpo.esc[1] < 1);
  });

  test('el despertar termina en la pose de reposo', () => {
    const fin = pose(brote, { despertar: true, desde: 0 }, 1500);
    const reposo = pose(brote, {}, 1500);
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(fin.cuerpo.esc[i] - reposo.cuerpo.esc[i]) < 0.02);
  });

  test('el saludo levanta el brazo derecho y lo baja', () => {
    const arriba = pose(brote, { saludo: true, desdeSaludo: 0 }, 900).grupos['brazo-der'].giro[2];
    const despues = pose(brote, { saludo: true, desdeSaludo: 0 }, 2600).grupos['brazo-der'].giro[2];
    assert.ok(arriba > 45, `el brazo llegó a ${arriba}°`);
    assert.ok(despues < 25);
  });

  test('el saludo y el despertar llevan relojes distintos', () => {
    const a = pose(brote, { saludo: true, desde: 0, desdeSaludo: 5000 }, 5900).grupos['brazo-der'].giro[2];
    assert.ok(a > 45, 'el saludo empieza cuando dice desdeSaludo');
  });

  test('la sombra se achica cuando salta', () => {
    let arriba = null; let abajo = null;
    for (let t = 0; t < 2400; t += 20) {
      const p = pose(brote, { animo: 'HAPPY' }, t);
      if (!arriba || p.cuerpo.en[1] > arriba.alto) arriba = { alto: p.cuerpo.en[1], s: p.sombra };
      if (!abajo || p.cuerpo.en[1] < abajo.alto) abajo = { alto: p.cuerpo.en[1], s: p.sombra };
    }
    assert.ok(arriba.s.esc < abajo.s.esc && arriba.s.alfa < abajo.s.alfa);
  });

  test('la matriz de un hueso deja su pivote quieto', () => {
    const pivote = [0, 88, 0];
    const m = matrizDeHueso({ en: [0, 0, 0], giro: [20, 10, -5], esc: [1.1, 0.9, 1.1] }, pivote);
    const movido = [
      m[0] * pivote[0] + m[4] * pivote[1] + m[8] * pivote[2] + m[12],
      m[1] * pivote[0] + m[5] * pivote[1] + m[9] * pivote[2] + m[13],
      m[2] * pivote[0] + m[6] * pivote[1] + m[10] * pivote[2] + m[14],
    ];
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(movido[i] - pivote[i]) < 0.001, `eje ${i}`);
  });

  test('las curvas de la animación no se desbordan', () => {
    for (let t = 0; t < 5000; t += 13) {
      assert.ok(Math.abs(onda(t, 900)) <= 1);
      assert.ok(pulso(t, 900) >= 0 && pulso(t, 900) <= 1);
    }
    assert.ok(Math.abs(rebote(1) - 1) < 1e-9);
    assert.equal(limitar(5, 0, 1), 1);
  });
});

describe('lo que flota alrededor', () => {
  const brote = construir('brote');

  test('cada ánimo con clima tiene su efecto, y el resto no tiene ninguno', () => {
    const conEfecto = { COLD: 'copo', HOT: 'vaho', PARCHED_AIR: 'polvillo', DROWNING: 'burbuja' };
    for (const [animo, tipo] of Object.entries(conEfecto)) {
      const e = efectos(brote, { animo }, 500);
      assert.ok(e.length > 0 && e.every((x) => x.tipo === tipo), animo);
    }
    assert.deepEqual(efectos(brote, { animo: 'HAPPY' }, 500), []);
  });

  test('de noche suelta Zzz y no copos', () => {
    const e = efectos(brote, { animo: 'HAPPY', noche: true }, 500);
    assert.ok(e.length && e.every((x) => x.tipo === 'zzz'));
  });

  test('la rareza se nota: la épica tira más destellos que la rara', () => {
    const rara = efectos(brote, { animo: 'HAPPY', rareza: 'raro' }, 300);
    const epica = efectos(brote, { animo: 'HAPPY', rareza: 'epico' }, 300);
    assert.ok(epica.length > rara.length);
    assert.ok(rara.every((x) => x.tipo === 'destello'));
  });

  test('todo lo que flota queda cerca del bicho y con alfa válido', () => {
    for (const f of figuras) {
      for (const estado of [{ animo: 'COLD' }, { animo: 'HOT' }, { animo: 'DROWNING' }, { noche: true }, { mimo: 1 }, { rareza: 'epico' }]) {
        for (let t = 0; t < 6000; t += 211) {
          for (const e of efectos(f, estado, t)) {
            assert.ok(e.alfa >= -0.001 && e.alfa <= 1.001, `${f.id}: alfa ${e.alfa}`);
            assert.ok(e.en.every(Number.isFinite));
            assert.ok(Math.abs(e.en[0]) < f.alto * 1.2 && e.en[1] > -10 && e.en[1] < f.alto * 2);
          }
        }
      }
    }
  });

  test('el polvo cae sobre el cuerpo, adelante, y siempre en el mismo lugar', () => {
    for (const f of figuras) {
      const a = motasDePolvo(f, 8, 'nodo-1');
      assert.deepEqual(a, motasDePolvo(f, 8, 'nodo-1'), `${f.id}: el polvo se mueve solo`);
      assert.notDeepEqual(a, motasDePolvo(f, 8, 'nodo-2'));
      assert.equal(a.length, 8);
      for (const m of a) {
        assert.ok(m.en[2] > 0, `${f.id}: una mota quedó atrás`);
        assert.ok(m.en[1] > 0 && m.en[1] < f.limites.hi[1]);
        assert.ok(m.r >= 2 && m.r <= 4.4);
      }
    }
  });
});

describe('los colores del cuerpo', () => {
  test('cada piel da un juego completo de roles', () => {
    for (const m of MODELOS) {
      for (const r of RAREZAS) {
        const c = coloresDe(pielDe(m.id, r));
        for (const rol of ROLES) assert.match(c[rol], /^#[0-9a-f]{6}$/i, `${m.id}/${r}/${rol}`);
        for (const extra of ['contorno', 'cielo', 'suelo', 'brillo', 'sombra', 'escena']) {
          assert.match(c[extra], /^#[0-9a-f]{6}$/i, `${m.id}/${r}/${extra}`);
        }
      }
    }
  });

  test('el cuerpo y lo de arriba se distinguen entre sí', () => {
    for (const m of MODELOS) {
      for (const r of RAREZAS) {
        const c = coloresDe(pielDe(m.id, r));
        /* Entre dos colores pegados no manda el contraste de luminancia (el de
           leer texto) sino la distancia de color. */
        assert.ok(distancia(c.cuerpo, c.acento) >= 60, `${m.id}/${r}: el acento se pierde en el cuerpo`);
        assert.ok(contraste(c.cuerpo, c.contorno) >= 2.2, `${m.id}/${r}: el contorno no se ve`);
      }
    }
  });

  test('el fondo de escena es claro: va detrás del Rooti, no encima', () => {
    for (const m of MODELOS) {
      for (const r of RAREZAS) {
        assert.ok(contraste(coloresDe(pielDe(m.id, r)).escena, '#ffffff') < 1.6, `${m.id}/${r}`);
      }
    }
  });

  test('de noche la luz cambia y el cuerpo no', () => {
    const dia = coloresDe(pielDe('brote', 'comun'));
    const noche = coloresDe(pielDe('brote', 'comun'), { noche: true });
    assert.equal(dia.cuerpo, noche.cuerpo);
    assert.notEqual(dia.cielo, noche.cielo);
    assert.notEqual(dia.suelo, noche.suelo);
  });

  test('el dormido es gris: el que todavía no despertó no muestra su piel', () => {
    const c = coloresDe(PIEL_DORMIDA);
    for (const rol of ['cuerpo', 'acento', 'claro', 'rubor']) {
      const [r, g, b] = rgb(c[rol]);
      assert.ok(Math.max(r, g, b) - Math.min(r, g, b) < 24, `${rol} tiene color: ${c[rol]}`);
    }
  });

  test('los colores llegan al shader en lineal, no en sRGB', () => {
    const [r] = aRGB('#808080');
    assert.ok(r > 0.2 && r < 0.25, `gris medio en lineal: ${r}`);
    assert.deepEqual(aRGB('#000000'), [0, 0, 0]);
    assert.deepEqual(aRGB('#ffffff'), [1, 1, 1]);
  });
});

describe('la tabla de figuras es editable sin tocar código', () => {
  test('los bultos están en milímetros y con la cara a una altura mirable', () => {
    for (const [id, f] of Object.entries(FIGURAS)) {
      assert.ok(f.cara.y > 25, `${id}: la cara queda demasiado abajo`);
      assert.ok(f.piezas.length >= 6, `${id}: sólo ${f.piezas.length} bultos`);
      assert.equal(f.piso, 0, `${id}: sin piso, la criatura flota`);
    }
  });

  test('esculpir dos veces el mismo Rooti da la misma malla', () => {
    const a = construir('musgo');
    const b = construir('musgo');
    assert.equal(a, b, 'la figura se guarda en caché');
    const c = superficie(FIGURAS.musgo, { paso: 3, roles: ROLES, huesos: HUESOS });
    const d = superficie(FIGURAS.musgo, { paso: 3, roles: ROLES, huesos: HUESOS });
    assert.deepEqual([...c.pos], [...d.pos]);
  });
});
