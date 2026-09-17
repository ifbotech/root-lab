/* El Pou botánico: felicidad, caricias, polvo, gotas de rocío y la noche. */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  mascotaNueva, normalizar, felicidadEn, polvoEn, caricia_falta, acumularOptimo, aplicar, publico, esNoche,
  saludBiologica, FELICIDAD_INICIAL, DECAE_POR_DIA, CARICIA, LIMPIEZA, SNACK, POLVO, GOTAS,
} from '../public/lib/mascota.mjs';

const H = 3600 * 1000;
const DIA = 24 * H;
const T0 = Date.UTC(2026, 8, 1, 12);

describe('la felicidad', () => {
  test('empieza en 60 con una gota de bienvenida y baja despacio', () => {
    const m = mascotaNueva(T0);
    assert.equal(felicidadEn(m, T0), FELICIDAD_INICIAL);
    assert.equal(m.gotas, GOTAS.bienvenida);
    assert.equal(felicidadEn(m, T0 + DIA), FELICIDAD_INICIAL - DECAE_POR_DIA);
    assert.equal(felicidadEn(m, T0 + 30 * DIA), 0, 'no baja de cero');
  });

  test('un estado viejo o roto se completa', () => {
    const m = normalizar({ felicidad: 250, gotas: 99, ultima_caricia: 'x' }, T0);
    assert.equal(m.felicidad, 100);
    assert.equal(m.gotas, GOTAS.maximo);
    assert.equal(m.ultima_caricia, 0);
    assert.deepEqual(normalizar(null, T0), mascotaNueva(T0));
  });
});

describe('los gestos', () => {
  test('la caricia suma 5, y la siguiente no suma hasta 4 h después', () => {
    let m = mascotaNueva(T0);
    let r = aplicar(m, 'caricia', T0);
    assert.equal(r.ok, true);
    assert.equal(r.suma, CARICIA.suma);
    m = r.mascota;
    assert.equal(felicidadEn(m, T0), FELICIDAD_INICIAL + CARICIA.suma);
    r = aplicar(m, 'caricia', T0 + H);
    assert.equal(r.ok, true, 'se siente igual');
    assert.equal(r.suma, 0);
    assert.equal(r.motivo, 'espera');
    assert.equal(caricia_falta(m, T0 + H), 3 * H);
    r = aplicar(m, 'caricia', T0 + CARICIA.cadaMs);
    assert.equal(r.suma, CARICIA.suma);
  });

  test('no se pasa de 100: la suma dice lo que de verdad sumó', () => {
    const m = { ...mascotaNueva(T0), felicidad: 98 };
    const r = aplicar(m, 'snack', T0);
    assert.equal(r.suma, 2);
    assert.equal(felicidadEn(r.mascota, T0), 100);
  });

  test('el polvo aparece a los 3 días sin cuidados, crece y se limpia', () => {
    const m = mascotaNueva(T0);
    assert.equal(polvoEn(m, T0 + POLVO.desdeMs - 1), 0);
    assert.equal(aplicar(m, 'limpiar', T0 + DIA).motivo, 'sin-polvo');
    assert.equal(polvoEn(m, T0 + POLVO.desdeMs), POLVO.minimo);
    assert.equal(polvoEn(m, T0 + POLVO.desdeMs + 2 * POLVO.cadaMs), POLVO.minimo + 2);
    assert.equal(polvoEn(m, T0 + 60 * DIA), POLVO.maximo);
    const t = T0 + 4 * DIA;
    const r = aplicar(m, 'limpiar', t);
    assert.equal(r.ok, true);
    assert.equal(felicidadEn(r.mascota, t), felicidadEn(m, t) + LIMPIEZA.suma);
    assert.equal(polvoEn(r.mascota, t), 0, 'limpio');
  });

  test('con polvo encima, una caricia o un snack no limpian; sin polvo, reinician el reloj', () => {
    const m = mascotaNueva(T0);
    const t = T0 + 4 * DIA;
    const acariciada = aplicar(m, 'caricia', t).mascota;
    assert.ok(polvoEn(acariciada, t) > 0, 'el polvo sigue');
    const comida = aplicar(acariciada, 'snack', t + H).mascota;
    assert.ok(polvoEn(comida, t + H) > 0);
    const temprano = aplicar(m, 'caricia', T0 + 2 * DIA).mascota;
    assert.equal(polvoEn(temprano, T0 + 4 * DIA), 0, 'acariciado a los 2 días: el reloj volvió a cero');
    assert.equal(polvoEn(normalizar({ ultima_interaccion: T0 }, T0), T0 + POLVO.desdeMs), POLVO.minimo, 'un estado viejo cuenta desde el último cuidado');
  });

  test('el snack gasta una gota; sin gotas no hay', () => {
    const m = mascotaNueva(T0);
    const r = aplicar(m, 'snack', T0);
    assert.equal(r.suma, SNACK.suma);
    assert.equal(r.mascota.gotas, 0);
    assert.equal(aplicar(r.mascota, 'snack', T0).motivo, 'sin-gotas');
    assert.equal(aplicar(m, 'bailar', T0).ok, false);
  });
});

describe('las gotas de rocío', () => {
  test('una cada 8 h con la planta cómoda, sin contar huecos, hasta 9', () => {
    let m = { ...mascotaNueva(T0), gotas: 0 };
    for (let i = 0; i < 8 * 4; i++) m = acumularOptimo(m, 15 * 60 * 1000);
    assert.equal(m.gotas, 1);
    assert.equal(m.ms_optimo, 0);
    m = acumularOptimo(m, 10 * DIA);
    assert.equal(m.ms_optimo, GOTAS.huecoMaxMs, 'un hueco largo cuenta como una hora');
    m = { ...m, gotas: GOTAS.maximo };
    m = acumularOptimo({ ...m, ms_optimo: GOTAS.cadaMs - 1 }, 1000);
    assert.equal(m.gotas, GOTAS.maximo);
  });

  test('lo público trae el progreso hacia la próxima gota', () => {
    const m = { ...mascotaNueva(T0), ms_optimo: 4 * H };
    const p = publico(m, T0);
    assert.equal(p.optimo_pct, 50);
    assert.equal(p.felicidad, FELICIDAD_INICIAL);
    assert.equal(p.polvo, 0);
  });
});

describe('la noche y la salud', () => {
  test('duerme de 22 a 8', () => {
    assert.equal(esNoche(22), true);
    assert.equal(esNoche(3), true);
    assert.equal(esNoche(8), false);
    assert.equal(esNoche(21), false);
  });

  test('la salud sale de los sensores, no de los mimos', () => {
    const e = { soil_min: 30, soil_max: 60 };
    const nodo = (severity, soil) => ({ revelado: true, link: 'VIVO', mood: 'HAPPY', severity, tel: { soil_pct: soil }, especie_info: e });
    assert.equal(saludBiologica(nodo('OK', 45)), 100);
    assert.ok(saludBiologica(nodo('OK', 32)) < 100);
    assert.ok(saludBiologica(nodo('WATCH', 45)) < saludBiologica(nodo('OK', 30)));
    assert.ok(saludBiologica(nodo('URGENT', 45)) < saludBiologica(nodo('WATCH', 30)));
    assert.equal(saludBiologica({ ...nodo('OK', 45), link: 'CAIDO' }), null);
    assert.equal(saludBiologica({ revelado: false }), null);
  });
});
