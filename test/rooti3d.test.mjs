/* Los Rooties en 3D: que la figura que se ve en la app sea la que sale de la
 * impresora, que adentro entre el hardware y que se mueva sin volverse loca.
 *
 * Es la prueba que reemplaza a la de las siluetas: antes el cuerpo de la app
 * era un dibujo 2D que "cumplía las reglas de FDM" sobre su contorno; ahora es
 * la malla de verdad, así que se mide sobre los triángulos.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { ROOTIES, FIGURAS, ENVOLVENTE, ROLES, construir, dentroDe } from '../public/lib/rooti3d/formas.mjs';
import { volumenConSigno, triangulos, limites } from '../public/lib/rooti3d/geometria.mjs';
import {
  analizar, voladizos, sinApoyo, base, centroDeMasa, curvaturaCara, entraElHardware, CAMA, VOLADIZO_MAX, stlBinario,
} from '../public/lib/rooti3d/imprimible.mjs';
import { pose, efectos, motasDePolvo, onda, pulso, rebote, limitar } from '../public/lib/rooti3d/animacion.mjs';
import { matrizDeGrupo } from '../public/lib/rooti3d/motor.mjs';
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

  test('cada pieza pide un rol de color que existe', () => {
    for (const f of figuras) {
      for (const p of f.partes) assert.ok(ROLES.includes(p.color), `${f.id}/${p.id}: rol ${p.color}`);
    }
  });

  test('cada figura tiene cara, corona y un grupo copa para animar', () => {
    for (const f of figuras) {
      assert.ok(f.cara.ancho >= 25 && f.cara.alto >= 25, `${f.id}: la ventana es chica`);
      assert.equal(f.corona.length, 2);
      assert.ok(f.grupos.copa, `${f.id}: no tiene copa`);
      assert.ok(f.grupos.copa.partes.length > 0);
    }
  });
});

describe('se imprime en FDM sin soportes', () => {
  test('ningún triángulo visible mira al piso más de 45°', () => {
    for (const f of figuras) {
      const malos = voladizos(f);
      assert.deepEqual(malos, [], `${f.id}: ${malos.map((v) => `${v.parte} ${v.grados}°`).join(', ')}`);
    }
  });

  test('ninguna pieza empieza en el aire', () => {
    for (const f of figuras) {
      const sueltas = sinApoyo(f);
      assert.deepEqual(sueltas, [], `${f.id}: ${sueltas.map((s) => s.parte).join(', ')}`);
    }
  });

  test('todas las mallas están del derecho (volumen positivo)', () => {
    for (const f of figuras) {
      for (const p of f.partes) {
        assert.ok(volumenConSigno(p.malla) > 0, `${f.id}/${p.id}: triángulos al revés`);
      }
    }
  });

  test('la base es plana y ancha, y el centro de masa cae abajo', () => {
    for (const f of figuras) {
      const b = base(f);
      assert.ok(b.plana, `${f.id}: la base no apoya`);
      assert.ok(b.proporcion >= 0.45, `${f.id}: base ${b.proporcion} del ancho`);
      const cdm = centroDeMasa(f);
      assert.ok(cdm < f.alto * 0.5, `${f.id}: centro de masa a ${Math.round((cdm / f.alto) * 100)}%`);
      assert.ok(cdm < b.radio * 3.2, `${f.id}: alto y flaco, se vuelca`);
    }
  });

  test('entra en la cama de una impresora casera', () => {
    for (const f of figuras) {
      const a = analizar(f);
      assert.ok(a.entraEnLaCama, `${f.id}: ${a.tamano.join(' x ')} no entra en ${CAMA.join(' x ')}`);
    }
  });

  test('nada más fino que dos hilos de boquilla', () => {
    for (const f of figuras) {
      const g = analizar(f).grosorMinimo;
      if (g !== null) assert.ok(g >= 2, `${f.id}: pieza de ${g} mm`);
    }
  });

  test('el límite de voladizo es el de la carcasa', () => {
    assert.equal(VOLADIZO_MAX, 45);
  });
});

describe('adentro entra el hardware', () => {
  test('la 18650 parada y el módulo del TFT', () => {
    for (const f of figuras) {
      const h = entraElHardware(f);
      assert.ok(h.bateria, `${f.id}: no entra la celda`);
      assert.ok(h.pantalla, `${f.id}: no entra la pantalla`);
    }
  });

  test('la celda está de verdad adentro de la figura, no sólo del bounding', () => {
    const b = ENVOLVENTE.bateria;
    for (const f of figuras) {
      const esquinas = [];
      for (const x of [-1, 1]) for (const y of [0, 1]) for (const z of [-1, 1]) {
        esquinas.push([x * (b.ancho / 2), b.desdeY + y * b.alto, b.z + z * (b.fondo / 2)]);
      }
      for (const p of esquinas) assert.ok(dentroDe(f, p), `${f.id}: la celda se sale en ${p.map((n) => Math.round(n))}`);
    }
  });

  test('la cara queda en una zona bastante plana para el vidrio', () => {
    for (const f of figuras) {
      const ventana = curvaturaCara(f);
      const hueco = curvaturaCara(f, ENVOLVENTE.pantalla.ancho + ENVOLVENTE.pared, ENVOLVENTE.pantalla.alto + ENVOLVENTE.pared);
      assert.ok(ventana.mm < 6, `${f.id}: la ventana se curva ${ventana.mm.toFixed(1)} mm`);
      assert.ok(hueco.mm < 8, `${f.id}: el hueco del módulo sería de ${hueco.mm.toFixed(1)} mm`);
    }
  });

  test('la pantalla no queda tapada por una pieza de adelante', () => {
    for (const f of figuras) {
      const c = f.cara;
      const delante = f.partes.filter((p) => p.id !== 'cuerpo' && p.dentro([0, c.y, f.limites.hi[2] + 1]));
      assert.deepEqual(delante.map((p) => p.id), [], `${f.id}: ${delante.map((p) => p.id).join(', ')} tapa la cara`);
    }
  });
});

describe('el STL', () => {
  test('sale binario, con todos los triángulos y cabecera de 84 bytes', () => {
    const f = construir('brote');
    const stl = stlBinario(f);
    const n = f.partes.reduce((s, p) => s + p.malla.idx.length / 3, 0);
    assert.equal(stl.byteLength, 84 + n * 50);
    assert.equal(new DataView(stl.buffer, stl.byteOffset).getUint32(80, true), n);
  });
});

describe('cómo se mueve', () => {
  const brote = construir('brote');

  test('con el mismo milisegundo da la misma pose', () => {
    const a = pose(brote, { animo: 'HAPPY' }, 4321);
    const b = pose(brote, { animo: 'HAPPY' }, 4321);
    assert.deepEqual(a, b);
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

  test('sólo el contento despega los pies del piso', () => {
    const suben = [];
    for (const animo of ['HAPPY', 'THIRSTY', 'COLD', 'HOT', 'DROWNING', 'SCORCHED', 'SLEEPING']) {
      let max = 0;
      for (let t = 0; t < 9000; t += 50) max = Math.max(max, pose(brote, { animo }, t).cuerpo.en[1]);
      if (max > 6) suben.push(animo);
    }
    /* El ahogo también flota, pero poquito y sin salto: es otra cosa. */
    assert.deepEqual(suben, ['HAPPY']);
  });

  test('el mimo no le borra la sed', () => {
    const conSed = pose(brote, { animo: 'THIRSTY' }, 1000).grupos.copa.giro[0];
    const mimado = pose(brote, { animo: 'THIRSTY', mimo: 1 }, 1000).grupos.copa.giro[0];
    assert.ok(conSed > 10, 'la sed tiene que vencer la copa');
    assert.ok(mimado < conSed, 'el mimo tiene que levantarla');
    assert.ok(mimado > 0, 'pero no hasta hacerle olvidar que tiene sed');
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
    const arriba = pose(brote, { saludo: true, desde: 0 }, 900).grupos['brazo-der'].giro[2];
    const despues = pose(brote, { saludo: true, desde: 0 }, 2600).grupos['brazo-der'].giro[2];
    assert.ok(arriba > 45, `el brazo llegó a ${arriba}°`);
    assert.ok(despues < 25);
  });

  test('cada Rooti mueve todos sus grupos, y ninguno que no tenga', () => {
    for (const f of figuras) {
      const p = pose(f, { animo: 'HAPPY' }, 700);
      const suyos = Object.keys(f.grupos).filter((g) => g !== 'cuerpo').sort();
      assert.deepEqual(Object.keys(p.grupos).sort(), suyos, f.id);
    }
  });

  test('la sombra se achica cuando salta', () => {
    let arriba = null; let abajo = null;
    for (let t = 0; t < 2400; t += 20) {
      const p = pose(brote, { animo: 'HAPPY' }, t);
      if (!arriba || p.cuerpo.en[1] > arriba.alto) arriba = { alto: p.cuerpo.en[1], s: p.sombra };
      if (!abajo || p.cuerpo.en[1] < abajo.alto) abajo = { alto: p.cuerpo.en[1], s: p.sombra };
    }
    assert.ok(arriba.s.esc < abajo.s.esc);
    assert.ok(arriba.s.alfa < abajo.s.alfa);
  });

  test('la matriz de un grupo deja el pivote quieto', () => {
    const pivote = [0, 108, 0];
    const m = matrizDeGrupo({ en: [0, 0, 0], giro: [20, 10, -5], esc: [1.1, 0.9, 1.1] }, pivote);
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
      const b = motasDePolvo(f, 8, 'nodo-1');
      assert.deepEqual(a, b, `${f.id}: el polvo se mueve solo`);
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
        /* Entre dos colores pegados uno al lado del otro no manda el contraste
           de luminancia (el de leer texto) sino la distancia de color: un
           verde y un lavanda igual de claros se distinguen perfecto. */
        assert.ok(distancia(c.cuerpo, c.acento) >= 60, `${m.id}/${r}: el acento se pierde en el cuerpo`);
        /* El contorno sí es una línea fina, y para eso hace falta luminancia. */
        assert.ok(contraste(c.cuerpo, c.contorno) >= 2.2, `${m.id}/${r}: el contorno no se ve`);
      }
    }
  });

  test('el fondo de escena es claro: va detrás del Rooti, no encima', () => {
    for (const m of MODELOS) {
      for (const r of RAREZAS) {
        const c = coloresDe(pielDe(m.id, r));
        assert.ok(contraste(c.escena, '#ffffff') < 1.6, `${m.id}/${r}: la escena es demasiado saturada`);
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
});

describe('las mallas', () => {
  test('ningún triángulo es degenerado ni tiene NaN', () => {
    for (const f of figuras) {
      for (const p of f.partes) {
        assert.ok(p.malla.pos.every(Number.isFinite), `${f.id}/${p.id}: posiciones rotas`);
        assert.ok(p.malla.idx.length % 3 === 0);
        let degenerados = 0;
        for (const t of triangulos(p.malla, p.matriz)) {
          const u = [t[1][0] - t[0][0], t[1][1] - t[0][1], t[1][2] - t[0][2]];
          const v = [t[2][0] - t[0][0], t[2][1] - t[0][1], t[2][2] - t[0][2]];
          const n = Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]);
          if (n < 1e-6) degenerados++;
        }
        /* Los polos de una revolución son un abanico: ahí sí hay costuras de
           área cero, y son inofensivas mientras sean pocas. */
        assert.ok(degenerados < p.malla.idx.length / 3 * 0.05, `${f.id}/${p.id}: ${degenerados} triángulos sin área`);
      }
    }
  });

  test('las UV de la cara caen en la ventana y sólo ahí', () => {
    for (const f of figuras) {
      const cuerpo = f.partes.find((p) => p.conCara);
      assert.ok(cuerpo, `${f.id}: ninguna pieza lleva la cara`);
      let dentro = 0;
      for (let i = 0; i < cuerpo.malla.uv.length; i += 2) {
        const [u, v] = [cuerpo.malla.uv[i], cuerpo.malla.uv[i + 1]];
        if (u > 0 && u < 1 && v > 0 && v < 1) dentro++;
      }
      assert.ok(dentro > 8, `${f.id}: la cara no tiene dónde pintarse`);
    }
  });

  test('el cuerpo llega hasta el piso y nada se hunde', () => {
    for (const f of figuras) {
      assert.ok(Math.abs(f.limites.lo[1]) < 0.01, `${f.id}: empieza en y=${f.limites.lo[1]}`);
      for (const p of f.partes) {
        const l = limites(p.malla, p.matriz);
        assert.ok(l.lo[1] > -0.01, `${f.id}/${p.id}: se hunde ${l.lo[1]} mm`);
      }
    }
  });
});

describe('la tabla de figuras es editable sin tocar código', () => {
  test('los perfiles están en milímetros y suben', () => {
    for (const [id, f] of Object.entries(FIGURAS)) {
      const perfil = f.cuerpo.perfil;
      assert.equal(perfil[0][1], 0, `${id}: no arranca en el piso`);
      for (let i = 1; i < perfil.length; i++) {
        assert.ok(perfil[i][1] > perfil[i - 1][1], `${id}: el perfil baja en ${i}`);
        assert.ok(perfil[i][0] > 0, `${id}: radio ${perfil[i][0]}`);
      }
    }
  });

  test('la cara está a una altura alcanzable y centrada', () => {
    for (const [id, f] of Object.entries(FIGURAS)) {
      assert.ok(f.cara.y > 25, `${id}: la cara queda demasiado abajo`);
      assert.ok(f.cara.y < f.cuerpo.perfil[f.cuerpo.perfil.length - 1][1], `${id}: la cara queda arriba del cuerpo`);
    }
  });
});
