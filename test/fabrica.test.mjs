/* La fábrica y la confianza: quién puede registrar un aparato en la nube. */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

import { tokenApi, hash } from '../server/codigo.mjs';
import { EMULADOR_OCIOSO_MS } from '../server/api.mjs';
import { escenario, aparato, cuenta } from './ayudas.mjs';

const ADMIN = 'una-clave-de-administracion-bien-larga';
const admin = (esc, metodo, ruta, cuerpo = null) => esc.llamar(metodo, ruta, { cuerpo, token: ADMIN });
const DIA = 24 * 3600 * 1000;

describe('confianza al primer uso, por modos', () => {
  test('en desarrollo cualquier aparato se registra solo', async () => {
    const esc = escenario();
    assert.equal((await aparato(esc).sync())[0], 200);
  });

  test('en producción sólo los emuladores; las placas de verdad las registra la fábrica', async () => {
    const esc = escenario({ opciones: { tofu: 'emulador', adminClave: ADMIN } });
    const placa = aparato(esc, { id: 'AA0000000001', persona: 'musgo' });
    const [c, r] = await placa.sync();
    assert.equal(c, 401);
    assert.match(r.error, /no registrado/);
    const emu = aparato(esc, { id: 'AA0000000002', placa: 'emulador' });
    assert.equal((await emu.sync())[0], 200, 'el emulador público sigue andando');

    /* La estación de fábrica la registra con el hash de su token. */
    const [ca, reg] = await admin(esc, 'POST', '/api/admin/aparatos', {
      id: placa.id.toLowerCase(), token_hash: hash(placa.token), persona: 'musgo', lote: 'L2609',
    });
    assert.equal(ca, 201);
    assert.deepEqual([reg.origen, reg.lote, reg.persona, reg.canal], ['fabrica', 'L2609', 'musgo', 'estable']);
    assert.equal((await placa.sync())[0], 200, 'ahora sí');
    const lista = (await admin(esc, 'GET', '/api/admin/aparatos'))[1].aparatos;
    assert.equal(lista.length, 2);
    assert.ok(lista.every((a) => a.token_hash === undefined), 'el hash del token no sale de la base');
    assert.equal(lista.find((a) => a.id === 'AA0000000002').origen, 'emulador');
  });

  test('con la confianza apagada del todo, ni el emulador', async () => {
    const esc = escenario({ opciones: { tofu: false } });
    assert.equal((await aparato(esc, { placa: 'emulador' }).sync())[0], 401);
  });

  test('un emulador no puede crear aparatos sin límite desde la misma IP', async () => {
    const esc = escenario({ opciones: { tofu: 'emulador' } });
    let ultimo = 200;
    for (let i = 0; i < 21; i++) {
      [ultimo] = await aparato(esc, { id: `EE00000000${String(i).padStart(2, '0')}`, placa: 'emulador' }).sync();
    }
    assert.equal(ultimo, 429, 'veinte por día por IP');
  });
});

describe('la estación de fábrica', () => {
  test('valida lo que registra y no pisa un aparato que ya es de alguien', async () => {
    const esc = escenario({ opciones: { tofu: 'emulador', adminClave: ADMIN } });
    const token = tokenApi(randomBytes(16));
    const bueno = { id: 'BB0000000001', token_hash: hash(token), persona: 'brote', lote: 'L1' };
    assert.equal((await admin(esc, 'POST', '/api/admin/aparatos', { ...bueno, id: 'corto' }))[0], 400);
    assert.equal((await admin(esc, 'POST', '/api/admin/aparatos', { ...bueno, token_hash: 'x' }))[0], 400);
    assert.equal((await admin(esc, 'POST', '/api/admin/aparatos', { ...bueno, persona: 'dragon' }))[0], 400);
    assert.equal((await admin(esc, 'POST', '/api/admin/aparatos', bueno))[0], 201);
    assert.equal((await admin(esc, 'POST', '/api/admin/aparatos', bueno))[0], 409, 'dos veces no, salvo que se pida');
    assert.equal((await admin(esc, 'POST', '/api/admin/aparatos', { ...bueno, persona: 'champi', reemplazar: true }))[0], 200);
    /* También se puede mandar el token y que el servidor lo hashee. */
    assert.equal((await admin(esc, 'POST', '/api/admin/aparatos', { id: 'BB0000000002', token, persona: 'bulbo' }))[0], 201);
    assert.equal((await esc.llamar('POST', '/api/admin/aparatos', { cuerpo: bueno }))[0], 401, 'sin la clave, nada');
  });

  test('lo que grabó la fábrica manda sobre lo que diga el aparato', async () => {
    const esc = escenario({ opciones: { tofu: 'emulador', adminClave: ADMIN } });
    const maceta = aparato(esc, { id: 'CC0000000001', persona: 'pinchito' });
    await admin(esc, 'POST', '/api/admin/aparatos', { id: maceta.id, token_hash: hash(maceta.token), persona: 'bulbo', lote: 'L7' });
    const t = await cuenta(esc);
    await maceta.sync({ lote: 'OTRO' });
    const [, planta] = await esc.llamar('POST', '/api/vinculo', { token: t, cuerpo: { codigo: maceta.codigo } });
    assert.equal(planta.modelo, 'bulbo', 'el Rooti de la figura, no el que dice el firmware');
    const a = (await admin(esc, 'GET', '/api/admin/aparatos'))[1].aparatos[0];
    assert.equal(a.lote, 'L7');
    assert.equal(a.vinculado, true);
    assert.equal((await admin(esc, 'POST', '/api/admin/aparatos', { id: maceta.id, token_hash: hash(maceta.token), persona: 'brote', reemplazar: true }))[0], 409,
      'un aparato que ya es de alguien no se regraba');
  });

  test('un aparato (o un lote entero) se puede deshabilitar y cambiar de canal', async () => {
    const esc = escenario({ opciones: { adminClave: ADMIN } });
    const a = aparato(esc, { id: 'DD0000000001' });
    const b = aparato(esc, { id: 'DD0000000002' });
    await a.sync({ lote: 'L9' });
    await b.sync({ lote: 'L9' });
    assert.equal((await admin(esc, 'PATCH', '/api/admin/aparatos/DD0000000001', { deshabilitado: true }))[1].deshabilitado, true);
    const [c, r] = await a.sync();
    assert.equal(c, 403);
    assert.match(r.error, /deshabilitado/);
    assert.equal((await b.sync())[0], 200);
    const [cl, lote] = await admin(esc, 'PATCH', '/api/admin/lotes/L9', { canal: 'beta', deshabilitado: false });
    assert.equal(cl, 200);
    assert.equal(lote.aparatos, 2);
    assert.equal((await a.sync())[0], 200, 'rehabilitado');
    assert.ok((await admin(esc, 'GET', '/api/admin/aparatos'))[1].aparatos.every((x) => x.canal === 'beta'));
    assert.equal((await admin(esc, 'PATCH', '/api/admin/lotes/NADA', { canal: 'beta' }))[0], 404);
    assert.equal((await admin(esc, 'PATCH', '/api/admin/aparatos/FFFFFFFFFFFF', { canal: 'beta' }))[0], 404);
  });

  test('dar de baja: sólo un aparato que nunca fue de nadie', async () => {
    const esc = escenario({ opciones: { adminClave: ADMIN } });
    const suelto = aparato(esc, { id: 'DE0000000001' });
    const deAlguien = aparato(esc, { id: 'DE0000000002' });
    const huerfano = aparato(esc, { id: 'DE0000000003' });
    for (const a of [suelto, deAlguien, huerfano]) await a.sync();
    const t = await cuenta(esc);
    await esc.llamar('POST', '/api/vinculo', { token: t, cuerpo: { codigo: deAlguien.codigo } });
    const [, planta] = await esc.llamar('POST', '/api/vinculo', { token: t, cuerpo: { codigo: huerfano.codigo } });
    assert.equal((await esc.llamar('DELETE', `/api/plantas/${planta.id}`, { token: t }))[0], 204);

    assert.equal((await esc.llamar('DELETE', '/api/admin/aparatos/DE0000000001'))[0], 401, 'sin la clave, nada');
    assert.equal((await admin(esc, 'DELETE', '/api/admin/aparatos/de0000000001'))[0], 204);
    assert.equal((await admin(esc, 'DELETE', '/api/admin/aparatos/DE0000000001'))[0], 404, 'ya no está');
    assert.equal((await admin(esc, 'DELETE', '/api/admin/aparatos/DE0000000002'))[0], 409, 'el de alguien no se borra');
    const [c, r] = await admin(esc, 'DELETE', '/api/admin/aparatos/DE0000000003');
    assert.equal(c, 409, 'el que tuvo planta tampoco: su historia lo nombra');
    assert.match(r.error, /deshabilita/);
    const ids = (await admin(esc, 'GET', '/api/admin/aparatos'))[1].aparatos.map((a) => a.id).sort();
    assert.deepEqual(ids, ['DE0000000002', 'DE0000000003']);
  });

  test('los emuladores que nadie vinculó ni usó en un mes se borran solos; los vinculados y las placas, nunca', async () => {
    const esc = escenario({ opciones: { adminClave: ADMIN } });
    const suelto = aparato(esc, { id: 'EE0000000001', placa: 'emulador' });
    const usado = aparato(esc, { id: 'EE0000000002', placa: 'emulador' });
    const placa = aparato(esc, { id: 'EE0000000003' });
    await suelto.sync();
    await usado.sync();
    await placa.sync();
    const t = await cuenta(esc);
    await esc.llamar('POST', '/api/vinculo', { token: t, cuerpo: { codigo: usado.codigo } });
    esc.reloj.t += EMULADOR_OCIOSO_MS + DIA;
    await esc.api.revisar();
    const ids = (await admin(esc, 'GET', '/api/admin/aparatos'))[1].aparatos.map((a) => a.id).sort();
    assert.deepEqual(ids, ['EE0000000002', 'EE0000000003']);
  });
});
