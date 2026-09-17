/* Operar el servicio: el vigía, las métricas anónimas, el estado para quien
 * administra, y la IA que se esconde cuando no es de verdad. */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { detectarCaidaMasiva, VIGIA } from '../server/vigia.mjs';
import { alertaOperacion, informeRespaldo } from '../server/plantillas-correo.mjs';
import { escenario, aparato, cuenta, conRooti, FOTO } from './ayudas.mjs';

const ADMIN = 'una-clave-de-administracion-bien-larga';
const admin = (esc, metodo, ruta, cuerpo = null) => esc.llamar(metodo, ruta, { cuerpo, token: ADMIN });
const MIN = 60 * 1000;
const H = 60 * MIN;

describe('el vigía', () => {
  const T = Date.parse('2026-09-17T12:00:00Z');
  const rooti = (visto, extra = {}) => ({ planta: 'p', origen: 'fabrica', visto, ...extra });

  test('muchos Rooties callados a la vez es el servidor, no las casas', () => {
    const juntos = [rooti(T - 60 * MIN), rooti(T - 62 * MIN), rooti(T - 65 * MIN), rooti(T - 2 * MIN)];
    const v = detectarCaidaMasiva(juntos, T);
    assert.equal(v.alarma, true);
    assert.deepEqual([v.activos, v.callados, v.juntos], [4, 3, 3]);
  });

  test('pocos, de a uno o repartidos en el día no disparan nada', () => {
    const vivos = [rooti(T - MIN), rooti(T - 2 * MIN), rooti(T - 3 * MIN), rooti(T - 4 * MIN)];
    assert.equal(detectarCaidaMasiva(vivos, T).alarma, false);
    assert.equal(detectarCaidaMasiva([rooti(T - 2 * H), rooti(T - 2 * H), ...vivos], T).alarma, false, 'dos de seis');
    const repartidos = [rooti(T - 2 * H), rooti(T - 5 * H), rooti(T - 9 * H), rooti(T - MIN)];
    assert.equal(detectarCaidaMasiva(repartidos, T).alarma, false, 'se fueron callando a lo largo del día');
    const viejos = [rooti(T - 30 * H), rooti(T - 31 * H), rooti(T - 32 * H)];
    assert.equal(detectarCaidaMasiva(viejos, T).activos, 0, 'los que ya no estaban activos no cuentan');
    const emus = [1, 2, 3, 4].map(() => rooti(T - 60 * MIN, { origen: 'emulador' }));
    assert.equal(detectarCaidaMasiva(emus, T).alarma, false, 'los emuladores no son clientes');
    assert.equal(detectarCaidaMasiva([rooti(T - 60 * MIN, { planta: null })], T).activos, 0, 'ni los que no son de nadie');
    assert.equal(detectarCaidaMasiva(null, T).alarma, false);
  });

  test('revisar() avisa a quien opera, una vez cada seis horas', async () => {
    const alertas = [];
    const esc = escenario({ opciones: { alAlerta: (a) => alertas.push(a) } });
    const token = await cuenta(esc);
    for (let i = 0; i < 4; i++) await conRooti(esc, { token, nombre: `P${i}` });
    await esc.api.revisar();
    assert.equal(alertas.length, 0, 'todos vivos');
    esc.reloj.t += 50 * MIN;
    await esc.api.revisar();
    assert.equal(alertas.length, 1);
    assert.equal(alertas[0].tipo, 'caida');
    assert.equal(alertas[0].callados, 4);
    esc.reloj.t += H;
    await esc.api.revisar();
    assert.equal(alertas.length, 1, 'no insiste');
    esc.reloj.t += VIGIA.esperaMs;
    await esc.api.revisar();
    assert.equal(alertas.length, 2, 'seis horas después, si sigue, vuelve a avisar');
  });

  test('los emails para quien opera dicen qué mirar', () => {
    const a = alertaOperacion({ activos: 12, callados: 9, juntos: 9, desde: Date.parse('2026-09-17T11:00:00Z') });
    assert.match(a.asunto, /9 de 12/);
    assert.match(a.texto, /systemctl status root-lab/);
    assert.match(a.html, /11:00 UTC/);
    const ok = informeRespaldo({ ok: true, archivo: 'rootkit-x.db.enc', conteo: { cuentas: 2, plantas: 4, lecturas: 1004, esquema: 7 } });
    assert.match(ok.asunto, /se restaura bien/);
    assert.match(ok.texto, /1004 lecturas/);
    const mal = informeRespaldo({ ok: false, detalle: 'clave <incorrecta>' });
    assert.match(mal.asunto, /NO SE PUDO/);
    assert.ok(!mal.html.includes('<incorrecta>'), 'el detalle va escapado');
  });
});

describe('métricas anónimas', () => {
  test('la app cuenta pasos del alta y pantallas; lo demás lo cuenta el servidor', async () => {
    const esc = escenario({ opciones: { adminClave: ADMIN } });
    const { token, planta } = await conRooti(esc);
    const evento = (e, tk = token) => esc.llamar('POST', '/api/evento', { token: tk, cuerpo: { evento: e } });
    assert.equal((await evento('alta:hola'))[0], 204);
    assert.equal((await evento('alta:hola', null))[0], 204, 'el primer paso del alta es antes de tener cuenta');
    assert.equal((await evento('vista:pasaporte'))[0], 204);
    assert.equal((await evento('vista:inventada'))[0], 400);
    assert.equal((await evento('compra:oro'))[0], 400);
    assert.equal((await evento(''))[0], 400);
    await esc.llamar('POST', `/api/plantas/${planta.id}/mascota`, { token, cuerpo: { accion: 'caricia' } });

    const [c, m] = await admin(esc, 'GET', '/api/admin/metricas');
    assert.equal(c, 200);
    assert.equal(m.totales['alta:hola'], 2);
    assert.equal(m.totales['vista:pasaporte'], 1);
    assert.equal(m.totales.vinculo, 1);
    assert.equal(m.totales['cofre:comun'], 1);
    assert.equal(m.totales['mascota:caricia'], 1);
    assert.ok(m.eventos.every((e) => Object.keys(e).sort().join() === 'dia,evento,n'), 'sólo día, nombre y cuántas veces: ni cuenta ni planta');
    assert.equal((await esc.llamar('GET', '/api/admin/metricas', { token }))[0], 401);
  });

  test('el estado para quien administra', async () => {
    const esc = escenario({ opciones: { adminClave: ADMIN, tofu: 'emulador' } });
    await aparato(esc, { placa: 'emulador' }).sync();
    const [c, e] = await admin(esc, 'GET', '/api/admin/estado');
    assert.equal(c, 200);
    assert.deepEqual(e.aparatos, { reales: 0, emuladores: 1, de_fabrica: 0, deshabilitados: 0 });
    assert.equal(e.tofu, 'emulador');
    assert.equal(e.ia.proveedor, 'simulada');
    assert.equal(e.vigia.alarma, false);
    assert.equal(e.esquema, 7);
  });
});

describe('la IA que no es de verdad se esconde', () => {
  test('en producción sin clave: ni chat, ni reconocimiento, ni diagnóstico; la especie se elige de la lista', async () => {
    const esc = escenario({ opciones: { iaDemo: false } });
    const [, cfg] = await esc.llamar('GET', '/api/config');
    assert.equal(cfg.ia, 'simulada');
    assert.equal(cfg.ia_visible, false);
    const { token, planta } = await conRooti(esc);
    await esc.llamar('PATCH', `/api/plantas/${planta.id}`, { token, cuerpo: { especie: 'monstera' } });
    const [, n] = await esc.llamar('GET', `/api/plantas/${planta.id}`, { token });
    assert.equal(n.chat, false, 'la ficha no ofrece charlar');
    const [, chat] = await esc.llamar('GET', `/api/plantas/${planta.id}/chat`, { token });
    assert.deepEqual([chat.disponible, chat.motivo], [false, 'ia']);
    assert.equal((await esc.llamar('POST', `/api/plantas/${planta.id}/chat`, { token, cuerpo: { texto: 'hola' } }))[0], 503);
    const [ci, ri] = await esc.llamar('POST', '/api/identificar', { token, cuerpo: { planta: planta.id, image_b64: FOTO, mime: 'image/jpeg' } });
    assert.equal(ci, 503);
    assert.match(ri.error, /lista/);
    assert.equal((await esc.llamar('POST', '/api/diagnosticar', { token, cuerpo: { planta: planta.id, image_b64: FOTO, mime: 'image/jpeg' } }))[0], 503);
  });

  test('en desarrollo la simulada se muestra (y lo dice)', async () => {
    const esc = escenario();
    assert.equal((await esc.llamar('GET', '/api/config'))[1].ia_visible, true);
  });
});
