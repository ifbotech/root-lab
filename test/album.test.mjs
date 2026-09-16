/* El álbum: fotos que se guardan con la planta, con límites, y las de
 * reconocer que entran solas. */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

import { escenario, conRooti, H, FOTO } from './ayudas.mjs';
import { FOTOS_MAX, FOTO_BYTES_MAX } from '../server/api.mjs';

const jpeg = (n = 300) => Buffer.concat([Buffer.from([0xff, 0xd8]), randomBytes(n)]).toString('base64');

describe('el álbum', () => {
  test('subir, listar, bajar los bytes y borrar', async () => {
    const esc = escenario();
    const { token, planta } = await conRooti(esc);
    let [c, r] = await esc.llamar('GET', `/api/plantas/${planta.id}/fotos`, { token });
    assert.equal(c, 200);
    assert.deepEqual(r, { fotos: [], maximo: FOTOS_MAX });

    const b64 = jpeg();
    [c, r] = await esc.llamar('POST', `/api/plantas/${planta.id}/fotos`, { token, cuerpo: { image_b64: `data:image/jpeg;base64,${b64}`, mime: 'image/jpeg', nota: 'Recién llegada' } });
    assert.equal(c, 201);
    const id = r.id;
    assert.equal(r.t, esc.reloj.t);
    esc.reloj.t += H;
    await esc.llamar('POST', `/api/plantas/${planta.id}/fotos`, { token, cuerpo: { image_b64: jpeg(), mime: 'image/png' } });

    [c, r] = await esc.llamar('GET', `/api/plantas/${planta.id}/fotos`, { token });
    assert.equal(r.fotos.length, 2);
    assert.equal(r.fotos[0].mime, 'image/png', 'la más nueva primero');
    assert.equal(r.fotos[1].id, id);
    assert.equal(r.fotos[1].nota, 'Recién llegada');
    assert.equal(r.fotos[1].origen, 'album');
    assert.equal(r.fotos[1].peso, 302);
    assert.equal(r.fotos[1].bytes, undefined, 'la lista no trae los bytes');

    [c, r] = await esc.llamar('GET', `/api/plantas/${planta.id}/fotos/${id}`, { token });
    assert.equal(c, 200);
    assert.ok(Buffer.isBuffer(r.binario));
    assert.equal(r.mime, 'image/jpeg');
    assert.equal(r.binario.toString('base64'), b64);
    assert.match(r.cache, /immutable/);

    [c] = await esc.llamar('DELETE', `/api/plantas/${planta.id}/fotos/${id}`, { token });
    assert.equal(c, 204);
    [c] = await esc.llamar('GET', `/api/plantas/${planta.id}/fotos/${id}`, { token });
    assert.equal(c, 404);
    [, r] = await esc.llamar('GET', `/api/plantas/${planta.id}/fotos`, { token });
    assert.equal(r.fotos.length, 1);
  });

  test('límites: tipo, tamaño, vacía y álbum lleno; y sólo la cuenta dueña', async () => {
    const esc = escenario();
    const { token, planta } = await conRooti(esc);
    let [c] = await esc.llamar('POST', `/api/plantas/${planta.id}/fotos`, { token, cuerpo: { image_b64: jpeg(), mime: 'image/gif' } });
    assert.equal(c, 400, 'gif no');
    [c] = await esc.llamar('POST', `/api/plantas/${planta.id}/fotos`, { token, cuerpo: { image_b64: 'YWJj', mime: 'image/jpeg' } });
    assert.equal(c, 400, 'vacía');
    [c] = await esc.llamar('POST', `/api/plantas/${planta.id}/fotos`, { token, cuerpo: { image_b64: jpeg(FOTO_BYTES_MAX + 10), mime: 'image/jpeg' } });
    assert.equal(c, 413, 'grande');
    for (let i = 0; i < FOTOS_MAX; i++) {
      [c] = await esc.llamar('POST', `/api/plantas/${planta.id}/fotos`, { token, cuerpo: { image_b64: jpeg(100), mime: 'image/jpeg' } });
      assert.equal(c, 201, `foto ${i}`);
    }
    [c] = await esc.llamar('POST', `/api/plantas/${planta.id}/fotos`, { token, cuerpo: { image_b64: jpeg(100), mime: 'image/jpeg' } });
    assert.equal(c, 409, 'lleno');
    const ajena = await conRooti(esc);
    [c] = await esc.llamar('GET', `/api/plantas/${planta.id}/fotos`, { token: ajena.token });
    assert.equal(c, 404);
    const [, lista] = await esc.llamar('GET', `/api/plantas/${planta.id}/fotos`, { token });
    [c] = await esc.llamar('GET', `/api/plantas/${planta.id}/fotos/${lista.fotos[0].id}`, { token: ajena.token });
    assert.equal(c, 404);
  });

  test('la foto del reconocimiento entra sola al álbum', async () => {
    const esc = escenario();
    const { token, planta } = await conRooti(esc);
    const [ci] = await esc.llamar('POST', '/api/identificar', { token, cuerpo: { planta: planta.id, image_b64: FOTO, mime: 'image/jpeg' } });
    assert.equal(ci, 200);
    const [, r] = await esc.llamar('GET', `/api/plantas/${planta.id}/fotos`, { token });
    assert.equal(r.fotos.length, 1);
    assert.equal(r.fotos[0].origen, 'reconocimiento');
    const [cd] = await esc.llamar('POST', '/api/diagnosticar', { token, cuerpo: { planta: planta.id, image_b64: FOTO, mime: 'image/jpeg' } });
    assert.equal(cd, 200);
    const [, r2] = await esc.llamar('GET', `/api/plantas/${planta.id}/fotos`, { token });
    assert.equal(r2.fotos.length, 2);
    assert.equal(r2.fotos[0].origen, 'diagnostico');
  });
});
