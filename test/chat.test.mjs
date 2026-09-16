/* La IA con límites: reconocer pide un Rooti, cada cosa tiene su cuota, el
 * tope de gasto frena antes de gastar, y la planta charla con sus datos.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { crearIA } from '../server/ia.mjs';
import { escenario, cuenta, conRooti, FOTO } from './ayudas.mjs';

/* Una API de Anthropic de mentira que anota lo que le mandan. */
function anthropicFalsa(responder) {
  const pedidos = [];
  const fetch = async (url, op) => {
    const cuerpo = JSON.parse(op.body);
    pedidos.push(cuerpo);
    const { texto, uso = { input_tokens: 1200, output_tokens: 80 } } = responder(cuerpo);
    return {
      ok: true, status: 200,
      json: async () => ({ model: cuerpo.model, content: [{ type: 'text', text: texto }], usage: uso }),
    };
  };
  return { fetch, pedidos };
}

describe('reconocer la planta', () => {
  test('sin Rooti no hay reconocimiento', async () => {
    const esc = escenario();
    const token = await cuenta(esc);
    const [c, r] = await esc.llamar('POST', '/api/identificar', { token, cuerpo: { image_b64: FOTO } });
    assert.equal(c, 403);
    assert.match(r.error, /registrá un Rooti/);
  });

  test('con el cofre cerrado, tampoco', async () => {
    const esc = escenario();
    const token = await cuenta(esc);
    const { planta } = await conRooti(esc, { token, nombre: '' });
    esc.db.plantaGuardar({ ...esc.db.planta(planta.id), revelado: false });
    const [c] = await esc.llamar('POST', '/api/identificar', { token, cuerpo: { planta: planta.id, image_b64: FOTO } });
    assert.equal(c, 409);
  });

  test('tres por día por Rooti; la cuota vuelve al día siguiente', async () => {
    const esc = escenario();
    const { token, planta } = await conRooti(esc);
    for (let i = 0; i < 3; i++) {
      const [c, r] = await esc.llamar('POST', '/api/identificar', { token, cuerpo: { planta: planta.id, image_b64: FOTO } });
      assert.equal(c, 200);
      assert.equal(r.cuota.restantes, 2 - i);
      assert.equal(r.cuidados, undefined, 'los cuidados quedan en el servidor');
    }
    const [c, r] = await esc.llamar('POST', '/api/identificar', { token, cuerpo: { planta: planta.id, image_b64: FOTO } });
    assert.equal(c, 429);
    assert.equal(r.cuota.restantes, 0);
    esc.reloj.t += 24 * 3600 * 1000;
    assert.equal((await esc.llamar('POST', '/api/identificar', { token, cuerpo: { planta: planta.id, image_b64: FOTO } }))[0], 200);
  });

  test('una foto rota no gasta cuota', async () => {
    const esc = escenario();
    const { token, planta } = await conRooti(esc);
    for (let i = 0; i < 5; i++) await esc.llamar('POST', '/api/identificar', { token, cuerpo: { planta: planta.id, image_b64: 'x' } });
    assert.equal((await esc.llamar('POST', '/api/identificar', { token, cuerpo: { planta: planta.id, image_b64: FOTO } }))[0], 200);
  });

  test('con el primer reconocimiento nace la ficha y el prompt del chat', async () => {
    const esc = escenario();
    const { token, planta } = await conRooti(esc, { persona: 'chica-chill', nombre: 'Lola' });
    const [, ident] = await esc.llamar('POST', '/api/identificar', { token, cuerpo: { planta: planta.id, image_b64: FOTO } });
    const [, p] = await esc.llamar('PATCH', `/api/plantas/${planta.id}`, { token, cuerpo: { especie: ident.especie.id } });
    assert.equal(p.ficha.fuente, 'ia', 'con los cuidados del reconocimiento');
    assert.ok(p.ficha.cuidados.sustrato);
    assert.equal(p.chat, true);
    const guardada = esc.db.planta(planta.id);
    assert.match(guardada.prompt, /^Sos Lola, una planta de la especie/);
    assert.match(guardada.prompt, /Chica Chill/);

    /* Elegir otra especie de la lista: ficha sólo con los rangos, sin gastar. */
    const otra = ident.especie.id === 'cactus' ? 'monstera' : 'cactus';
    const [, p2] = await esc.llamar('PATCH', `/api/plantas/${planta.id}`, { token, cuerpo: { especie: otra } });
    assert.equal(p2.ficha.fuente, 'catalogo');
    assert.equal(esc.db.iaUsosPlanta(planta.id, 'identificar', '2026-09-16'), 1);

    /* Cambiar el nombre rehace el prompt. */
    await esc.llamar('PATCH', `/api/plantas/${planta.id}`, { token, cuerpo: { nombre: 'Lolita' } });
    assert.match(esc.db.planta(planta.id).prompt, /^Sos Lolita/);
  });
});

describe('diagnosticar', () => {
  test('dos por día por Rooti', async () => {
    const esc = escenario();
    const { token, planta } = await conRooti(esc);
    const diag = () => esc.llamar('POST', '/api/diagnosticar', { token, cuerpo: { planta: planta.id, image_b64: FOTO } });
    assert.equal((await diag())[0], 200);
    assert.equal((await diag())[1].cuota.restantes, 0);
    assert.equal((await diag())[0], 429);
  });
});

describe('charlar con la planta', () => {
  async function plantaLista(esc, opciones = {}) {
    const r = await conRooti(esc, { persona: 'kawaii', nombre: 'Rulo', ...opciones });
    await esc.llamar('PATCH', `/api/plantas/${r.planta.id}`, { token: r.token, cuerpo: { especie: 'monstera' } });
    r.maceta.medir({ suelo: 12, temp: 231, hr: 58, lux: 5200, animo: 'THIRSTY', sev: 'URGENT' });
    r.maceta.pasar(60);
    await r.maceta.sync();
    return r;
  }
  const decir = (esc, token, id, texto) => esc.llamar('POST', `/api/plantas/${id}/chat`, { token, cuerpo: { texto } });

  test('sin especie todavía no se puede', async () => {
    const esc = escenario();
    const { token, planta } = await conRooti(esc);
    const [, estado] = await esc.llamar('GET', `/api/plantas/${planta.id}/chat`, { token });
    assert.equal(estado.disponible, false);
    assert.equal((await decir(esc, token, planta.id, 'hola'))[0], 409);
  });

  test('contesta con sus datos, guarda la charla y descuenta la cuota', async () => {
    const esc = escenario();
    const { token, planta } = await plantaLista(esc);
    const [c, r] = await decir(esc, token, planta.id, '¿Necesitás agua?');
    assert.equal(c, 200, JSON.stringify(r));
    assert.equal(r.mensajes.length, 2);
    assert.equal(r.mensajes[0].rol, 'persona');
    assert.equal(r.mensajes[1].rol, 'planta');
    assert.match(r.mensajes[1].texto, /12%/, 'habla de su tierra de verdad');
    assert.equal(r.cuota.restantes, 2);

    const [, historial] = await esc.llamar('GET', `/api/plantas/${planta.id}/chat`, { token });
    assert.equal(historial.mensajes.length, 2);
    assert.equal(historial.cuota.restantes, 2);
  });

  test('3 mensajes por día en el plan gratis, compartidos entre todas las plantas', async () => {
    const esc = escenario();
    const token = await cuenta(esc);
    const { planta: a } = await plantaLista(esc, { token });
    const { planta: b } = await plantaLista(esc, { token, nombre: 'Tita' });
    assert.equal((await decir(esc, token, a.id, 'hola'))[0], 200);
    assert.equal((await decir(esc, token, b.id, 'hola'))[0], 200);
    assert.equal((await decir(esc, token, a.id, 'hola'))[0], 200);
    const [c, r] = await decir(esc, token, b.id, 'hola');
    assert.equal(c, 429);
    assert.match(r.error, /3 mensajes/);
    assert.equal(esc.db.chatDe(b.id).length, 2, 'lo rechazado no queda en la charla');
  });

  test('mensajes vacíos o larguísimos se rechazan sin gastar', async () => {
    const esc = escenario();
    const { token, planta } = await plantaLista(esc);
    assert.equal((await decir(esc, token, planta.id, '   '))[0], 400);
    assert.equal((await decir(esc, token, planta.id, 'x'.repeat(501)))[0], 400);
    const [, estado] = await esc.llamar('GET', `/api/plantas/${planta.id}/chat`, { token });
    assert.equal(estado.cuota.restantes, 3);
  });

  test('con Claude: prompt fijo cacheado, datos en vivo, turnos alternados y costo anotado', async () => {
    const falsa = anthropicFalsa(() => ({ texto: 'Soy Rulo. Tengo sed: la tierra está al 12%.' }));
    const esc = escenario({ ia: crearIA({ clave: 'sk-prueba', modeloChat: 'claude-sonnet-5', fetch: falsa.fetch }) });
    const { token, planta } = await plantaLista(esc);
    await decir(esc, token, planta.id, 'hola');
    await decir(esc, token, planta.id, '¿y el sol?');
    const ultimo = falsa.pedidos.at(-1);
    assert.equal(ultimo.model, 'claude-sonnet-5');
    assert.ok(ultimo.max_tokens <= 350);
    assert.equal(ultimo.system[0].cache_control.type, 'ephemeral');
    assert.match(ultimo.system[0].text, /^Sos Rulo/);
    assert.match(ultimo.system[1].text, /Humedad de la tierra: 12%/);
    assert.deepEqual(ultimo.messages.map((m) => m.role), ['user', 'assistant', 'user']);
    assert.equal(ultimo.messages.at(-1).content, '¿y el sol?');
    assert.equal(esc.presupuesto.estado().gastado_dia_usd, 2 * (1200 * 3 + 80 * 15) / 1e6);
  });

  test('llegado el tope de gasto, no se llama a la IA', async () => {
    const falsa = anthropicFalsa(() => ({ texto: 'hola', uso: { input_tokens: 2000, output_tokens: 300 } }));
    const esc = escenario({
      ia: crearIA({ clave: 'sk-prueba', fetch: falsa.fetch }),
      tope: { topeDiaUsd: 0.012, topeMesUsd: 10 },
    });
    const { token, planta } = await plantaLista(esc);
    assert.equal((await decir(esc, token, planta.id, 'hola'))[0], 200);
    const llamadas = falsa.pedidos.length;
    const [c, r] = await decir(esc, token, planta.id, 'hola de nuevo');
    assert.equal(c, 503);
    assert.match(r.error, /pausa/);
    assert.equal(falsa.pedidos.length, llamadas, 'ni una llamada más');
    assert.equal(esc.alertas.length, 1, 'y se avisó');
  });

  test('una respuesta fallida de la IA no descuenta cuota pero sí anota lo gastado', async () => {
    let n = 0;
    const falsa = anthropicFalsa(() => { n += 1; return { texto: '' }; });
    const esc = escenario({ ia: crearIA({ clave: 'sk-prueba', fetch: falsa.fetch }) });
    const { token, planta } = await plantaLista(esc);
    const [c] = await decir(esc, token, planta.id, 'hola');
    assert.equal(c, 502);
    assert.equal(n, 1);
    assert.ok(esc.presupuesto.estado().gastado_dia_usd > 0);
    assert.equal(esc.db.chatDe(planta.id).length, 0);
  });
});
