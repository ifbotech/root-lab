/* Pruebas de lib/model.mjs: formato, orden, rangos y vínculo.
 *
 *     npm test
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  formatTemp, formatLux, formatEdad, battPct, ordenarNodos, contarAlertas,
  LINK_ES, ETAPAS, ETAPA_DIAS, etapaDe, progresoEtapa, bateriaDe,
  RAREZAS, progresoColeccion, ordenarColeccion, firmaTablero,
  posicionEnRango, validarAlta, interpretarIdentificacion, MOOD_ES,
} from '../public/lib/model.mjs';

import { ESPECIES, MODELOS } from '../server/catalogo.mjs';

/* ============================================================== formato === */
describe('formato', () => {
  test('la temperatura sale de décimas a coma decimal', () => {
    assert.equal(formatTemp(236), '23,6 °C');
    assert.equal(formatTemp(0), '0,0 °C');
    assert.equal(formatTemp(450), '45,0 °C');
  });

  test('las temperaturas bajo cero no se rompen', () => {
    /* El signo tiene que ir adelante y el decimal seguir siendo positivo:
     * un -55 ingenuo imprime "-5,-5". */
    assert.equal(formatTemp(-55), '-5,5 °C');
    assert.equal(formatTemp(-150), '-15,0 °C');
  });

  test('los valores ausentes no imprimen NaN', () => {
    assert.equal(formatTemp(null), '—');
    assert.equal(formatTemp(undefined), '—');
    assert.equal(formatLux(null), '—');
    assert.equal(formatEdad(undefined), '—');
  });

  test('la luz se abrevia como la lee la gente', () => {
    assert.equal(formatLux(0), '0 lux');
    assert.equal(formatLux(850), '850 lux');
    assert.equal(formatLux(5200), '5,2k lux');
    assert.equal(formatLux(42000), '42k lux');
  });

  test('la antigüedad se redondea a la unidad util', () => {
    assert.equal(formatEdad(30), 'recién');
    assert.equal(formatEdad(600), 'hace 10 min');
    assert.equal(formatEdad(7200), 'hace 2 h');
    assert.equal(formatEdad(259200), 'hace 3 días');
  });
});

/* ============================================================== bateria === */
describe('batería', () => {
  test('coincide con la curva del firmware en los extremos', () => {
    assert.equal(battPct(4300), 100);
    assert.equal(battPct(4200), 100);
    assert.equal(battPct(3700), 55);
    assert.equal(battPct(3000), 0);
    assert.equal(battPct(2500), 0);
  });

  test('es monótona creciente', () => {
    /* Si no lo fuera, el ruido del ADC haría "subir" la batería en pantalla. */
    let prev = -1;
    for (let mv = 2800; mv <= 4300; mv += 10) {
      const p = battPct(mv);
      assert.ok(p >= prev, `bajó en ${mv} mV: ${p} < ${prev}`);
      prev = p;
    }
  });

  test('entradas invalidas devuelven cero en vez de NaN', () => {
    assert.equal(battPct(undefined), 0);
    assert.equal(battPct(NaN), 0);
  });
});

/* ================================================================ lista === */
describe('orden de la lista', () => {
  const plantas = [
    { nombre: 'ZAMIA', severity: 'OK' },
    { nombre: 'ALOE', severity: 'URGENT' },
    { nombre: 'POTUS', severity: 'WATCH' },
    { nombre: 'BONSAI', severity: 'URGENT' },
    { nombre: 'CACTUS', severity: 'OK' },
  ];

  test('lo urgente va primero', () => {
    const o = ordenarNodos(plantas).map((p) => p.nombre);
    assert.deepEqual(o, ['ALOE', 'BONSAI', 'POTUS', 'CACTUS', 'ZAMIA']);
  });

  test('dentro de cada severidad ordena por nombre, sin bailar', () => {
    /* Dos llamadas seguidas tienen que dar el mismo orden: una lista que se
     * reacomoda sola en cada refresco es imposible de usar. */
    const a = ordenarNodos(plantas).map((p) => p.nombre);
    const b = ordenarNodos([...plantas].reverse()).map((p) => p.nombre);
    assert.deepEqual(a, b);
  });

  test('no muta el arreglo original', () => {
    const copia = [...plantas];
    ordenarNodos(plantas);
    assert.deepEqual(plantas, copia);
  });

  test('tolera vacío y nulo', () => {
    assert.deepEqual(ordenarNodos([]), []);
    assert.deepEqual(ordenarNodos(null), []);
    assert.equal(contarAlertas(null), 0);
  });

  test('cuenta las que reclaman algo', () => {
    assert.equal(contarAlertas(plantas), 3);
  });
});

/* =============================================================== rangos === */
describe('posición en el rango', () => {
  test('mapea el rango cómodo a 0..1', () => {
    assert.equal(posicionEnRango(25, 25, 60), 0);
    assert.equal(posicionEnRango(60, 25, 60), 1);
    assert.ok(Math.abs(posicionEnRango(42.5, 25, 60) - 0.5) < 0.001);
  });

  test('satura fuera del rango en vez de salirse de la barra', () => {
    assert.equal(posicionEnRango(5, 25, 60), 0);
    assert.equal(posicionEnRango(90, 25, 60), 1);
  });

  test('un rango invalido devuelve null y la barra no se dibuja', () => {
    assert.equal(posicionEnRango(30, 60, 25), null);
    assert.equal(posicionEnRango(30, 25, 25), null);
    assert.equal(posicionEnRango(NaN, 25, 60), null);
  });
});

/* =========================================================== validacion === */
describe('validación del alta', () => {
  const ids = ESPECIES.map((e) => e.id);

  test('acepta un alta correcta', () => {
    assert.equal(validarAlta({ nombre: 'MONSTERA', especie: 'monstera' }, ids).ok, true);
  });

  test('exige nombre y especie', () => {
    assert.equal(validarAlta({ nombre: '', especie: 'monstera' }, ids).ok, false);
    assert.equal(validarAlta({ nombre: '   ', especie: 'monstera' }, ids).ok, false);
    assert.equal(validarAlta({ nombre: 'X', especie: '' }, ids).ok, false);
  });

  test('rechaza una especie que no está en el catálogo', () => {
    const v = validarAlta({ nombre: 'X', especie: 'palmera-inventada' }, ids);
    assert.equal(v.ok, false);
    assert.match(v.errores.join(' '), /catálogo/);
  });

  test('acepta acentos y eñes, que en castellano no son opcionales', () => {
    assert.equal(validarAlta({ nombre: 'MALVÓN DEL ÑANDÚ', especie: 'pothos' }, ids).ok, true);
  });

  test('corta en 17, que es lo que entra en la barra de la Terminal', () => {
    const largo = 'A'.repeat(18);
    assert.equal(validarAlta({ nombre: largo, especie: 'pothos' }, ids).ok, false);
    assert.equal(validarAlta({ nombre: 'A'.repeat(17), especie: 'pothos' }, ids).ok, true);
  });
});

/* ======================================================= identificacion === */
describe('interpretación de la identificación por IA', () => {
  test('una confianza alta se da por buena', () => {
    const i = interpretarIdentificacion({ especie: 'monstera', nombre: 'Monstera', confianza: 0.93 });
    assert.equal(i.estado, 'seguro');
    assert.equal(i.especie, 'monstera');
  });

  test('una confianza baja pide confirmación, no decide sola', () => {
    /* De la especie salen los umbrales con los que se juzga la planta el
     * resto de su vida: adivinarla en silencio es el peor resultado. */
    const i = interpretarIdentificacion({ especie: 'pothos', nombre: 'Potus', confianza: 0.41 });
    assert.equal(i.estado, 'dudoso');
    assert.match(i.mensaje, /no estoy seguro/i);
  });

  test('una respuesta vacía no rompe la interfaz', () => {
    assert.equal(interpretarIdentificacion(null).estado, 'fallo');
    assert.equal(interpretarIdentificacion({}).estado, 'fallo');
  });
});

/* La escalera de etapas vive dos veces: en firmware/core/companion.c y en
   lib/model.mjs. Es la unica duplicacion deliberada del sistema —el Hub
   necesita dibujar la barra sin un viaje mas— y estos tests son el precio
   de admitirla: si alguien mueve un umbral en el firmware sin moverlo aca,
   fallan. */
describe('vinculo y crecimiento', () => {
  test('la escalera de etapas es la del firmware', () => {
    assert.deepEqual(ETAPA_DIAS, [0, 7, 30, 90, 180]);
    assert.equal(ETAPAS.length, ETAPA_DIAS.length);
  });

  test('los dias sanos deciden la etapa', () => {
    assert.equal(etapaDe(0), 'ESPORA');
    assert.equal(etapaDe(6), 'ESPORA');
    assert.equal(etapaDe(7), 'BROTE');
    assert.equal(etapaDe(29), 'BROTE');
    assert.equal(etapaDe(30), 'JOVEN');
    assert.equal(etapaDe(90), 'MADURO');
    assert.equal(etapaDe(180), 'ANCESTRAL');
    assert.equal(etapaDe(9999), 'ANCESTRAL');
  });

  test('la etapa nunca retrocede al subir los dias', () => {
    let anterior = -1;
    for (let d = 0; d <= 400; d++) {
      const i = ETAPAS.indexOf(etapaDe(d));
      assert.ok(i >= anterior, `retrocedio en ${d} dias`);
      anterior = i;
    }
  });

  test('datos invalidos caen en la primera etapa', () => {
    assert.equal(etapaDe(undefined), 'ESPORA');
    assert.equal(etapaDe(null), 'ESPORA');
    assert.equal(etapaDe(NaN), 'ESPORA');
    assert.equal(etapaDe(-5), 'ESPORA');
  });

  test('el progreso va de 0 a 100 dentro de cada etapa', () => {
    assert.equal(progresoEtapa(0), 0);
    assert.equal(progresoEtapa(7), 0);          // recien entro en BROTE
    assert.equal(progresoEtapa(18), 48);        // a mitad de camino a JOVEN
    assert.equal(progresoEtapa(29), 96);
    assert.equal(progresoEtapa(180), 100);      // ultima etapa: siempre lleno
    assert.equal(progresoEtapa(5000), 100);
    for (let d = 0; d <= 400; d++) {
      const p = progresoEtapa(d);
      assert.ok(p >= 0 && p <= 100, `progreso fuera de rango en ${d}: ${p}`);
    }
  });

  test('la bateria distingue "no se" de "vacia"', () => {
    assert.equal(bateriaDe({ nodo: { batt_pct: 44 } }), 44);
    assert.equal(bateriaDe({ tel: { batt_mv: 3700 } }), 55);
    assert.equal(bateriaDe({ tel: { batt_mv: 0 } }), null,
      'sin lectura todavia es null, no 0%');
    assert.equal(bateriaDe(null), null);
  });

  test('el orden de la lista no mira la carcasa', () => {
    // Una maceta con sed importa lo mismo la carcasa que tenga puesta.
    const nodos = [
      { nombre: 'A', modelo: 'bulbo', severity: 'OK' },
      { nombre: 'B', modelo: 'pinchito', severity: 'URGENT' },
    ];
    assert.deepEqual(ordenarNodos(nodos).map((n) => n.nombre), ['B', 'A']);
  });

  const pieles = (id) => ['comun', 'raro', 'epico'].map((rareza) => ({ id: `${id}-${rareza}`, rareza }));
  const catalogo = [{ id: 'brote', pieles: pieles('brote') }, { id: 'musgo', pieles: pieles('musgo') }];

  test('la colección cuenta pieles, Rooties y épicas', () => {
    const vacia = progresoColeccion(catalogo, []);
    assert.deepEqual(vacia, { tengo: 0, total: 6, completa: false, rooties: 0, epicas: 0 });
    const algo = progresoColeccion(catalogo, ['brote-comun', 'brote-epico', 'otra-cosa']);
    assert.equal(algo.tengo, 2, 'lo que no está en el catálogo no cuenta');
    assert.equal(algo.rooties, 1);
    assert.equal(algo.epicas, 1);
    const todo = progresoColeccion(catalogo, catalogo.flatMap((m) => m.pieles.map((p) => p.id)));
    assert.equal(todo.completa, true);
    assert.equal(todo.rooties, 2);
    assert.equal(progresoColeccion(null, null).total, 0);
  });

  test('la colección deja los Rooties en su orden y las pieles de común a épica', () => {
    const desordenado = [{ id: 'musgo', pieles: [...pieles('musgo')].reverse() }, { id: 'brote', pieles: pieles('brote') }];
    const o = ordenarColeccion(desordenado);
    assert.deepEqual(o.map((m) => m.id), ['musgo', 'brote']);
    assert.deepEqual(o[0].pieles.map((p) => p.rareza), ['comun', 'raro', 'epico']);
    assert.deepEqual(ordenarColeccion(null), []);
  });
});

describe('la firma del tablero', () => {
  const nodo = (extra = {}) => ({ id: 'p1', mood: 'HAPPY', tel: { soil_pct: 40, age_s: 30 }, mascota: { felicidad: 60, caricia_en_ms: 5000 }, ...extra });

  test('no cambia porque pasaron unos segundos, ni por la cuenta regresiva de la caricia', () => {
    const a = firmaTablero([nodo()]);
    assert.equal(firmaTablero([nodo({ tel: { soil_pct: 40, age_s: 45 }, mascota: { felicidad: 60, caricia_en_ms: 4000 } })]), a);
  });

  test('cambia con lo que se ve: el texto de la edad, un dato, la felicidad o que la caricia ya suma', () => {
    const a = firmaTablero([nodo()]);
    assert.notEqual(firmaTablero([nodo({ tel: { soil_pct: 40, age_s: 600 } })]), a, 'de "recién" a "hace 10 min"');
    assert.notEqual(firmaTablero([nodo({ tel: { soil_pct: 39, age_s: 30 } })]), a);
    assert.notEqual(firmaTablero([nodo({ mascota: { felicidad: 65, caricia_en_ms: 5000 } })]), a);
    assert.notEqual(firmaTablero([nodo({ mascota: { felicidad: 60, caricia_en_ms: 0 } })]), a);
    assert.equal(firmaTablero(null), '[]');
  });
});
