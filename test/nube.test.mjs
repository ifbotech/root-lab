/* Piezas del servidor: código de vinculación, cofre, avisos e IA.
 *
 * Los vectores de código y token son LOS MISMOS que verifica el firmware en
 * rootkit/firmware/test/test_enlace.c. Si alguno de los dos lados cambia la
 * derivación, falla acá y allá a la vez.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  codigoVinculo, tokenApi, normalizarCodigo, ssidDe, codigoLegible, CROCKFORD,
} from '../server/codigo.mjs';
import {
  sortearRareza, PROBABILIDADES, probabilidadDe, LEGADO, normalizarPersona, personaDeAparato,
} from '../server/cofre.mjs';
import { avisosPendientes, esHoraDeCalma, ESPERA, ANIMOS_CON_AVISO } from '../server/avisos.mjs';
import { crearIA, especieDesdeModelo, extraerJson, validarFoto } from '../server/ia.mjs';
import { MODELOS, RAREZAS, ESPECIES, validarEspecie } from '../server/catalogo.mjs';

const SECRETO = Buffer.from([
  0x3a, 0x91, 0x7c, 0x05, 0xee, 0x42, 0x18, 0xb6,
  0x9d, 0x60, 0x2f, 0xc3, 0x71, 0x0e, 0x84, 0x5b,
]);

describe('código de vinculación', () => {
  test('coincide con el firmware', () => {
    assert.equal(codigoVinculo(SECRETO, 0), 'PTS0JHM6');
    assert.equal(codigoVinculo(SECRETO, 1), 'A8XTJCFQ');
    assert.equal(codigoVinculo(SECRETO, 7), 'T6QEH5MP');
    assert.equal(tokenApi(SECRETO), '71859c23a4eb073e425391d23d46eede1760af53a9bec3b4b168724b2d8e6be3');
  });

  test('se normaliza como lo tipea una persona', () => {
    assert.equal(normalizarCodigo('k7q2-m9xa'), 'K7Q2M9XA');
    assert.equal(normalizarCodigo('O0II LLAA'), '001111AA');
    assert.equal(normalizarCodigo('K7Q2'), null);
    assert.equal(normalizarCodigo('K7Q2M9X#'), null);
    assert.equal(normalizarCodigo(null), null);
    for (const c of codigoVinculo(SECRETO, 3)) assert.ok(CROCKFORD.includes(c));
  });

  test('red del portal y forma legible', () => {
    assert.equal(ssidDe('K7Q2M9XA'), 'ROOTKIT-K7Q2');
    assert.equal(codigoLegible('K7Q2M9XA'), 'K7Q2-M9XA');
  });
});

describe('cofre', () => {
  test('las probabilidades de la piel suman uno y son 70/25/5', () => {
    const total = Object.values(PROBABILIDADES).reduce((a, b) => a + b, 0);
    assert.equal(total, 1000);
    assert.deepEqual(PROBABILIDADES, { comun: 700, raro: 250, epico: 50 });
    const suma = RAREZAS.reduce((a, r) => a + probabilidadDe(r), 0);
    assert.ok(Math.abs(suma - 1) < 1e-9);
    assert.equal(probabilidadDe('secreto'), 0);
  });

  test('el sorteo cae en cada rareza según el número', () => {
    assert.equal(sortearRareza(() => 0), 'comun');
    assert.equal(sortearRareza(() => 699), 'comun');
    assert.equal(sortearRareza(() => 700), 'raro');
    assert.equal(sortearRareza(() => 949), 'raro');
    assert.equal(sortearRareza(() => 950), 'epico');
    assert.equal(sortearRareza(() => 999), 'epico');
  });

  test('en muchas tiradas, las proporciones se parecen a las publicadas', () => {
    const cuenta = { comun: 0, raro: 0, epico: 0 };
    for (let i = 0; i < 20000; i++) cuenta[sortearRareza()] += 1;
    assert.ok(Math.abs(cuenta.comun / 20000 - 0.7) < 0.02, JSON.stringify(cuenta));
    assert.ok(Math.abs(cuenta.raro / 20000 - 0.25) < 0.02, JSON.stringify(cuenta));
    assert.ok(Math.abs(cuenta.epico / 20000 - 0.05) < 0.01, JSON.stringify(cuenta));
  });

  test('la figura define el Rooti: el grabado de fábrica manda, y si no hay, uno fijo por id', () => {
    assert.equal(personaDeAparato({ id: 'A1', persona_fabrica: 'nori' }), 'nori');
    const sin = personaDeAparato({ id: 'AABBCCDDEEFF' });
    assert.ok(MODELOS.some((m) => m.id === sin));
    assert.equal(personaDeAparato({ id: 'AABBCCDDEEFF' }), sin, 'siempre el mismo');
    assert.equal(personaDeAparato({ id: 'A1', persona_fabrica: 'inventada' }), personaDeAparato({ id: 'A1' }));
  });

  test('los Rooties de la primera tanda pasan a los nuevos', () => {
    assert.equal(normalizarPersona('KAWAII'), 'plum', 'el tierno de antes es la berenjenita');
    assert.equal(normalizarPersona('chica-chill'), 'nori');
    assert.equal(normalizarPersona('ciclope'), 'blink', 'y el cíclope ya tenía nombre');
    /* Y los cinco botánicos, que duraron una versión. */
    assert.equal(normalizarPersona('pinchito'), 'kip');
    assert.equal(normalizarPersona('champi'), 'blink');
    assert.equal(normalizarPersona('kip'), 'kip');
    assert.equal(normalizarPersona('nada'), null);
    for (const v of Object.values(LEGADO)) {
      assert.ok(MODELOS.some((m) => m.id === v.persona));
      assert.ok(RAREZAS.includes(v.rareza));
    }
  });
});

describe('avisos', () => {
  const T = Date.parse('2026-09-16T15:00:00-03:00');
  const planta = { id: 'p1', nombre: 'Rulo', persona: 'blink', rareza: 'raro', revelado: true };
  const disp = (extra) => ({
    visto: T, usb: false, bat_mv: 3900, animo: 'THIRSTY', sev: 'WATCH',
    ultima: { suelo: 18, temp: 220, hr: 50, lux: 3000 }, ...extra,
  });
  const esp = ESPECIES.find((e) => e.id === 'monstera');
  const tz = 'America/Argentina/Buenos_Aires';

  test('cada ánimo malo tiene su texto accionable', () => {
    for (const animo of ANIMOS_CON_AVISO) {
      const [a] = avisosPendientes({ planta, dispositivo: disp({ animo }), especie: esp, ahora: T, tz });
      assert.ok(a, animo);
      assert.ok(a.titulo.includes('Rulo'), animo);
      assert.ok(a.cuerpo.length > 20, animo);
    }
  });

  test('antes del cofre no avisa nada', () => {
    assert.deepEqual(avisosPendientes({ planta: { ...planta, revelado: false }, dispositivo: disp(), ahora: T, tz }), []);
  });

  test('respeta la espera entre avisos', () => {
    const enviados = { 'animo:THIRSTY': T - ESPERA.WATCH + 1000 };
    assert.equal(avisosPendientes({ planta, dispositivo: disp(), ahora: T, enviados, tz }).length, 0);
    const urgente = disp({ sev: 'URGENT' });
    const hace4h = { 'animo:THIRSTY': T - 4 * 3600 * 1000 };
    assert.equal(avisosPendientes({ planta, dispositivo: urgente, ahora: T, enviados: hace4h, tz }).length, 1,
      'lo urgente se repite antes');
  });

  test('de noche sólo lo urgente', () => {
    const noche = Date.parse('2026-09-17T02:00:00-03:00');
    assert.equal(esHoraDeCalma(noche, tz), true);
    assert.equal(esHoraDeCalma(T, tz), false);
    assert.equal(avisosPendientes({ planta, dispositivo: disp({ visto: noche }), ahora: noche, tz }).length, 0);
    assert.equal(avisosPendientes({ planta, dispositivo: disp({ visto: noche, sev: 'URGENT' }), ahora: noche, tz }).length, 1);
  });

  test('un riego que se escurrió avisa aunque el ánimo esté bien, una vez por día', () => {
    const d = disp({ animo: 'HAPPY', sev: 'OK', ultima: { suelo: 30, temp: 220, hr: 50, lux: 3000, escurre: true } });
    const [a] = avisosPendientes({ planta, dispositivo: d, especie: esp, ahora: T, tz });
    assert.equal(a.clave, 'escurre');
    assert.match(a.titulo, /se escurrió/);
    assert.match(a.cuerpo, /dos o tres veces/);
    assert.equal(avisosPendientes({ planta, dispositivo: d, ahora: T, enviados: { escurre: T - 3600 * 1000 }, tz }).length, 0);
    const noche = Date.parse('2026-09-16T02:00:00-03:00');
    assert.equal(avisosPendientes({ planta, dispositivo: d, ahora: noche, tz }).length, 0, 'de noche no');
  });

  test('batería baja, pero no enchufado', () => {
    const baja = avisosPendientes({ planta, dispositivo: disp({ sev: 'OK', bat_mv: 3400 }), ahora: T, tz });
    assert.equal(baja.length, 1);
    assert.equal(baja[0].clave, 'bateria');
    assert.equal(avisosPendientes({ planta, dispositivo: disp({ sev: 'OK', bat_mv: 3400, usb: true }), ahora: T, tz }).length, 0);
  });

  test('si no reporta, sólo avisa eso', () => {
    const r = avisosPendientes({ planta, dispositivo: disp({ visto: T - 8 * 3600 * 1000 }), ahora: T, tz });
    assert.equal(r.length, 1);
    assert.equal(r[0].clave, 'caido');
  });
});

describe('IA', () => {
  const FOTO = { image_b64: 'y'.repeat(5000), mime: 'image/jpeg' };

  test('la simulada es estable y usa el catálogo', async () => {
    const ia = crearIA({ clave: '' });
    assert.equal(ia.proveedor, 'simulada');
    const a = await ia.identificar(FOTO);
    const b = await ia.identificar(FOTO);
    assert.deepEqual(a, b);
    assert.ok(ESPECIES.some((e) => e.id === a.especie.id));
    const d = await ia.diagnosticar(FOTO, { tel: { suelo: 90, hr: 60, lux: 5000 }, especie: ESPECIES[6] });
    assert.ok(d.hallazgos.includes('hojas_amarillas'));
  });

  test('con clave llama a Claude y prefiere el catálogo', async () => {
    let pedido;
    const falso = async (url, op) => {
      pedido = { url, cuerpo: JSON.parse(op.body), headers: op.headers };
      return {
        ok: true,
        json: async () => ({
          content: [{ type: 'text', text: 'Acá va:\n{"nombre":"Costilla","cientifico":"Monstera deliciosa","confianza":0.97,"catalogo":"monstera","rangos":{"suelo_min":1,"suelo_max":99,"temp_min_c":1,"temp_max_c":50,"hr_min":1,"lux_min":1,"lux_max":100000,"dificultad":1},"alternativas":[{"nombre":"Filodendro","catalogo":"filodendro","confianza":0.02}]}' }],
        }),
      };
    };
    const ia = crearIA({ clave: 'sk-prueba', fetch: falso });
    assert.equal(ia.proveedor, 'claude');
    const r = await ia.identificar(FOTO);
    assert.equal(pedido.url, 'https://api.anthropic.com/v1/messages');
    assert.equal(pedido.headers['x-api-key'], 'sk-prueba');
    assert.equal(pedido.cuerpo.model, 'claude-opus-5');
    assert.equal(pedido.cuerpo.messages[0].content[0].type, 'image');
    assert.equal(r.especie.id, 'monstera');
    assert.equal(r.especie.soil_min, 25, 'los rangos salen del catálogo, no del modelo');
    assert.equal(r.catalogo, true);
    assert.equal(r.alternativas[0].id, 'filodendro');
  });

  test('una planta fuera del catálogo se guarda con rangos validados', () => {
    const r = especieDesdeModelo({
      nombre: 'Planta del dinero', cientifico: 'Pilea peperomioides', catalogo: null,
      rangos: { suelo_min: 20, suelo_max: 55, temp_min_c: 15, temp_max_c: 29, hr_min: 40, lux_min: 1500, lux_max: 20000, dificultad: 25 },
    });
    assert.equal(r.catalogo, false);
    assert.equal(r.especie.temp_min_dc, 150);
    assert.match(r.especie.id, /^propia-/);
    assert.equal(especieDesdeModelo({ nombre: 'x', rangos: { suelo_min: 90, suelo_max: 10 } }), null);
    assert.equal(especieDesdeModelo({ no_es_planta: true }), null);
  });

  test('lo que no es planta se dice con claridad', async () => {
    const ia = crearIA({
      clave: 'k',
      fetch: async () => ({ ok: true, json: async () => ({ content: [{ type: 'text', text: '{"no_es_planta": true}' }] }) }),
    });
    await assert.rejects(() => ia.identificar(FOTO), /No encontré una planta/);
  });

  test('ayudas', () => {
    assert.deepEqual(extraerJson('bla {"a":1} bla'), { a: 1 });
    assert.equal(extraerJson('sin json'), null);
    assert.equal(validarFoto({ image_b64: 'a' }), 'falta la foto');
    assert.equal(validarFoto({ image_b64: 'a'.repeat(200), mime: 'text/html' }), 'formato de imagen no soportado');
    assert.equal(validarEspecie({ id: 'a', nombre: 'A', soil_min: 1 }), null);
  });
});
