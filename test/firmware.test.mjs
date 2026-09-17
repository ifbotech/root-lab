/* Actualizaciones por aire: versiones, canales, firma y el camino completo
 * desde publicar hasta que el aparato baja su binario. */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

import {
  versionValida, compararVersiones, elegirFirmware, generarClaves, firmarFirmware, firmaValida, cabeceraC,
  sha256Hex, archivoDe,
} from '../server/firmware.mjs';
import { tokenApi } from '../server/codigo.mjs';
import { escenario, aparato, conRooti } from './ayudas.mjs';

const ADMIN = 'una-clave-de-administracion-bien-larga';
const admin = (esc, metodo, ruta, cuerpo = null, token = ADMIN) => esc.llamar(metodo, ruta, { cuerpo, token });
const binario = (semilla = 1) => Buffer.concat([Buffer.from([0xe9]), Buffer.alloc(4096, semilla)]);

describe('versiones y canales', () => {
  test('una versión es X.Y.Z, con sufijo opcional, y entra en el aparato', () => {
    for (const v of ['0.5.0', '1.20.300', '0.6.0-beta.2']) assert.equal(versionValida(v), true, v);
    for (const v of ['0.5', 'v0.5.0', '', '1.0.0-', '1.0.0-be ta', '1.0.0-abcdefghijklmnop', null, 5]) assert.equal(versionValida(v), false, String(v));
  });

  test('se comparan como números, no como texto (espejo de rk_version_cmp)', () => {
    assert.ok(compararVersiones('0.5.0', '0.6.0') < 0);
    assert.ok(compararVersiones('0.10.0', '0.9.9') > 0);
    assert.equal(compararVersiones('1.2.3-beta', '1.2.3'), 0);
    assert.ok(compararVersiones('basura', '0.0.1') < 0);
  });

  test('cada canal recibe lo último que se publicó ahí; beta ve también lo estable', () => {
    const pub = [
      { id: 1, version: '0.5.0', canal: 'estable', placa: 'c3-supermini', publicado: 100 },
      { id: 2, version: '0.6.0', canal: 'beta', placa: 'c3-supermini', publicado: 200 },
      { id: 3, version: '0.6.0', canal: 'estable', placa: 'esp32-devkit', publicado: 300 },
    ];
    const para = (canal, version, placa = 'c3-supermini') => elegirFirmware(pub, { placa, canal, version })?.version || null;
    assert.equal(para('estable', '0.4.0'), '0.5.0');
    assert.equal(para('estable', '0.5.0'), null, 'ya la corre');
    assert.equal(para('beta', '0.5.0'), '0.6.0');
    assert.equal(para('beta', '0.6.0'), null);
    assert.equal(para('estable', '0.4.0', 'otra-placa'), null, 'cada placa, lo suyo');
    /* Sale la estable 0.7.0: beta también la recibe. */
    const mas = [...pub, { id: 4, version: '0.7.0', canal: 'estable', placa: 'c3-supermini', publicado: 400 }];
    assert.equal(elegirFirmware(mas, { placa: 'c3-supermini', canal: 'beta', version: '0.6.0' }).version, '0.7.0');
    /* Volver atrás: se publica una más vieja en el canal y los aparatos la instalan. */
    const atras = [...mas, { id: 5, version: '0.5.0', canal: 'estable', placa: 'c3-supermini', publicado: 500 }];
    assert.equal(elegirFirmware(atras, { placa: 'c3-supermini', canal: 'estable', version: '0.7.0' }).id, 5);
    /* Lo retirado no se ofrece. */
    const retirada = mas.map((f) => (f.id === 4 ? { ...f, retirado: 450 } : f));
    assert.equal(elegirFirmware(retirada, { placa: 'c3-supermini', canal: 'estable', version: '0.4.0' }).version, '0.5.0');
    assert.equal(elegirFirmware([], { placa: 'x' }), null);
    assert.equal(archivoDe({ version: '0.6.0', placa: 'c3-supermini', canal: 'beta' }), '0.6.0-c3-supermini-beta.bin');
  });
});

describe('la firma', () => {
  const claves = generarClaves();

  test('firma y verifica; cualquier cambio la rompe', () => {
    const bin = binario();
    const f = firmarFirmware(bin, claves.privada);
    assert.equal(f.sha256, sha256Hex(bin));
    assert.equal(f.tamano, bin.length);
    const der = Buffer.from(f.firma, 'base64');
    assert.ok(der.length >= 68 && der.length <= 72 && der[0] === 0x30, 'DER de ECDSA P-256: lo que espera mbedTLS');
    assert.ok(f.firma.length < 128, 'entra en el buffer del firmware');
    assert.equal(firmaValida(bin, f.firma, claves.publica), true);
    const tocado = Buffer.from(bin);
    tocado[100] ^= 1;
    assert.equal(firmaValida(tocado, f.firma, claves.publica), false, 'un bit distinto');
    assert.equal(firmaValida(bin, f.firma, generarClaves().publica), false, 'otra clave');
    assert.equal(firmaValida(bin, 'aG9sYQ==', claves.publica), false);
    assert.equal(firmaValida(bin, '', claves.publica), false);
    assert.equal(firmaValida(bin, f.firma, 'esto no es una clave'), false);
  });

  test('la cabecera de C lleva la pública, línea por línea', () => {
    const h = cabeceraC(claves.publica);
    assert.match(h, /static const char RK_OTA_CLAVE_PUBLICA\[\] =/);
    assert.match(h, /"-----BEGIN PUBLIC KEY-----\\n"/);
    assert.match(h, /"-----END PUBLIC KEY-----\\n";/);
    assert.ok(!h.includes('PRIVATE'));
  });
});

describe('publicar y actualizar', () => {
  const claves = generarClaves();
  const nuevo = (extra = {}) => escenario({ opciones: { adminClave: ADMIN, firmwarePublica: claves.publica, ...extra } });
  const publicar = (esc, { version = '0.6.0', placa = 'c3-supermini', canal = 'estable', bin = binario(), firma } = {}) => {
    const f = firmarFirmware(bin, claves.privada);
    return admin(esc, 'POST', '/api/admin/firmware', {
      version, placa, canal, notas: 'prueba', sha256: f.sha256, firma: firma ?? f.firma, contenido_b64: bin.toString('base64'),
    });
  };

  test('sin la clave de administración no se publica; sin configurarla, la ruta no existe', async () => {
    const esc = nuevo();
    assert.equal((await admin(esc, 'GET', '/api/admin/firmware', null, 'otra-clave-cualquiera-bien-larga'))[0], 401);
    assert.equal((await admin(esc, 'GET', '/api/admin/firmware', null, ''))[0], 401);
    assert.equal((await admin(esc, 'GET', '/api/admin/firmware'))[0], 200);
    const sin = escenario();
    assert.equal((await admin(sin, 'GET', '/api/admin/firmware'))[0], 404, 'sin ROOTLAB_ADMIN_CLAVE no hay administración');
    const { token } = await conRooti(esc);
    assert.equal((await esc.llamar('GET', '/api/admin/firmware', { token }))[0], 401, 'una sesión de la app no es la administración');
  });

  test('un binario mal firmado, cortado o con datos raros no entra', async () => {
    const esc = nuevo();
    const otra = firmarFirmware(binario(), generarClaves().privada).firma;
    assert.equal((await publicar(esc, { firma: otra }))[0], 403, 'firmado con otra clave');
    const [c, r] = await admin(esc, 'POST', '/api/admin/firmware', {
      version: '0.6.0', placa: 'c3-supermini', canal: 'estable', sha256: 'ab'.repeat(32),
      firma: firmarFirmware(binario(), claves.privada).firma, contenido_b64: binario().toString('base64'),
    });
    assert.equal(c, 400);
    assert.match(r.error, /SHA-256/);
    assert.equal((await publicar(esc, { version: 'ultima' }))[0], 400);
    assert.equal((await publicar(esc, { placa: 'Placa Rara!' }))[0], 400);
    assert.equal((await publicar(esc, { canal: 'nocturno' }))[0], 400);
    assert.equal((await publicar(esc, { bin: Buffer.alloc(4) }))[0], 400);
    const sinPublica = escenario({ opciones: { adminClave: ADMIN } });
    assert.equal((await publicar(sinPublica))[0], 503, 'sin la pública, el servidor no puede verificar y no publica');
    assert.deepEqual((await admin(esc, 'GET', '/api/admin/firmware'))[1].firmware, []);
  });

  test('el sync ofrece la versión de su canal y su placa, y el aparato baja el binario con su token', async () => {
    const esc = nuevo();
    const bin = binario(7);
    const [cp, pub] = await publicar(esc, { bin });
    assert.equal(cp, 201);
    assert.equal(pub.tamano, bin.length);

    const maceta = aparato(esc, { fw: '0.5.0' });
    const [, r] = await maceta.sync();
    assert.equal(r.firmware.version, '0.6.0');
    assert.equal(r.firmware.tamano, bin.length);
    assert.equal(r.firmware.sha256, sha256Hex(bin));
    assert.equal(firmaValida(bin, r.firmware.firma, claves.publica), true);
    assert.equal(r.firmware.url, `https://rootlab.test/api/d/firmware/${pub.id}`);

    const ruta = new URL(r.firmware.url).pathname;
    const [cd, descarga] = await esc.llamar('GET', ruta, { token: maceta.token });
    assert.equal(cd, 200);
    assert.ok(Buffer.from(descarga.binario).equals(bin), 'el mismo binario que se publicó');
    assert.equal(descarga.mime, 'application/octet-stream');
    assert.equal((await esc.llamar('GET', ruta, { token: tokenApi(randomBytes(16)) }))[0], 401, 'otro token no baja nada');
    assert.equal((await esc.llamar('GET', ruta))[0], 401);
    const { token } = await conRooti(esc);
    assert.equal((await esc.llamar('GET', ruta, { token }))[0], 401, 'ni la sesión de una persona');

    /* Ya actualizado, no se le vuelve a ofrecer; otra placa nunca la ve. */
    maceta.fw = '0.6.0';
    assert.equal((await maceta.sync())[1].firmware, undefined);
    const otra = aparato(esc, { id: 'B1B2C3D4E5F6', placa: 'esp32-devkit' });
    assert.equal((await otra.sync())[1].firmware, undefined);
  });

  test('beta primero: sólo los aparatos del canal beta la reciben', async () => {
    const esc = nuevo();
    await publicar(esc, { version: '0.7.0-beta.1', canal: 'beta' });
    const piloto = aparato(esc, { id: 'C1B2C3D4E5F6' });
    const comun = aparato(esc, { id: 'D1B2C3D4E5F6' });
    await piloto.sync();
    await comun.sync();
    assert.equal((await admin(esc, 'PATCH', '/api/admin/aparatos/c1b2c3d4e5f6', { canal: 'beta' }))[0], 200);
    assert.equal((await admin(esc, 'PATCH', '/api/admin/aparatos/C1B2C3D4E5F6', { canal: 'nocturno' }))[0], 400);
    assert.equal((await piloto.sync())[1].firmware.version, '0.7.0-beta.1');
    assert.equal((await comun.sync())[1].firmware, undefined);
  });

  test('retirar una publicación la saca del sync y de la descarga', async () => {
    const esc = nuevo();
    const [, pub] = await publicar(esc);
    const maceta = aparato(esc);
    assert.ok((await maceta.sync())[1].firmware);
    assert.equal((await admin(esc, 'DELETE', `/api/admin/firmware/${pub.id}`))[0], 204);
    assert.equal((await admin(esc, 'DELETE', `/api/admin/firmware/${pub.id}`))[0], 404);
    assert.equal((await maceta.sync())[1].firmware, undefined);
    assert.equal((await esc.llamar('GET', `/api/d/firmware/${pub.id}`, { token: maceta.token }))[0], 404);
    assert.ok((await admin(esc, 'GET', '/api/admin/firmware'))[1].firmware[0].retirado);
  });

  test('la app ve qué corre su Rooti, si hay una actualización y cómo le fue', async () => {
    const esc = nuevo();
    const { maceta, token, planta } = await conRooti(esc);
    let [, n] = await esc.llamar('GET', `/api/plantas/${planta.id}`, { token });
    assert.deepEqual(n.nodo.actualizacion, { version: '0.5.0', canal: 'estable', disponible: null, estado: null, intento: null });
    await publicar(esc);
    esc.reloj.t += 31000;                                /* el caché de publicaciones dura medio minuto */
    await maceta.sync({ ota: { version: '0.6.0', estado: 'bajando' } });
    [, n] = await esc.llamar('GET', `/api/plantas/${planta.id}`, { token });
    assert.equal(n.nodo.actualizacion.disponible, '0.6.0');
    assert.equal(n.nodo.actualizacion.estado, 'bajando');
    maceta.fw = '0.6.0';
    await maceta.sync({ ota: { version: '0.6.0', estado: 'ok' } });
    [, n] = await esc.llamar('GET', `/api/plantas/${planta.id}`, { token });
    assert.deepEqual(n.nodo.actualizacion, { version: '0.6.0', canal: 'estable', disponible: null, estado: 'ok', intento: '0.6.0' });
    await maceta.sync({ ota: { version: '0.6.0', estado: 'inventado' } });
    [, n] = await esc.llamar('GET', `/api/plantas/${planta.id}`, { token });
    assert.equal(n.nodo.actualizacion.estado, 'ok', 'un estado desconocido se ignora');
  });
});
