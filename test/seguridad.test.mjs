/* Cifrado, índice ciego, contraseñas y cabeceras: lo que protege los datos
 * de las personas aunque la base se vaya a otro lado.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, scryptSync } from 'node:crypto';

import { crearCripto, cargarSecreto, enmascararEmail } from '../server/cripto.mjs';
import { crearClaves } from '../server/claves.mjs';

const LIVIANO = { memoria: 1024, pasadas: 1, hilos: 1, largo: 32 };

describe('cifrado', () => {
  const c = crearCripto(randomBytes(32));

  test('lo cifrado se descifra igual, y cifrar dos veces da distinto', () => {
    const a = c.cifrar('ana@ejemplo.com');
    const b = c.cifrar('ana@ejemplo.com');
    assert.notEqual(a, b, 'IV al azar: el mismo email no se reconoce en la base');
    assert.match(a, /^v1\./);
    assert.equal(c.descifrar(a), 'ana@ejemplo.com');
    assert.equal(c.descifrar(c.cifrar('ñandú 🌱')), 'ñandú 🌱');
    assert.equal(c.cifrar(null), null);
    assert.equal(c.descifrar(null), null);
  });

  test('un byte cambiado se detecta', () => {
    const a = c.cifrar('texto importante');
    const partes = a.split('.');
    const datos = Buffer.from(partes[3], 'base64url');
    datos[0] ^= 1;
    partes[3] = datos.toString('base64url');
    assert.throws(() => c.descifrar(partes.join('.')));
    assert.throws(() => c.descifrar('v9.a.b.c'), /formato/);
  });

  test('otra clave maestra no descifra ni encuentra', () => {
    const otra = crearCripto(randomBytes(32));
    assert.throws(() => otra.descifrar(c.cifrar('x')));
    assert.notEqual(otra.indice('ana@ejemplo.com'), c.indice('ana@ejemplo.com'));
  });

  test('el índice ciego es estable y no es un hash sin clave', () => {
    assert.equal(c.indice('ana@ejemplo.com'), c.indice('ana@ejemplo.com'));
    assert.match(c.indice('ana@ejemplo.com'), /^[0-9a-f]{64}$/);
    assert.notEqual(c.indice('ana@ejemplo.com'), c.indice('ana@ejemplo.co'));
  });

  test('la clave maestra: del entorno, o un archivo privado en desarrollo', () => {
    assert.throws(() => cargarSecreto({ entorno: 'corta' }), /32 bytes/);
    assert.equal(cargarSecreto({ entorno: randomBytes(32).toString('base64') }).length, 32);
    const dir = mkdtempSync(join(tmpdir(), 'rootlab-secreto-'));
    try {
      const archivo = join(dir, 'secreto.key');
      const avisos = [];
      const a = cargarSecreto({ entorno: '', archivo, avisar: (m) => avisos.push(m) });
      const b = cargarSecreto({ entorno: '', archivo, avisar: (m) => avisos.push(m) });
      assert.deepEqual(a, b, 'la segunda vez lee la misma');
      assert.equal(avisos.length, 1);
      assert.equal(Buffer.from(readFileSync(archivo, 'utf8').trim(), 'base64').length, 32);
      if (process.platform !== 'win32') assert.equal(statSync(archivo).mode & 0o777, 0o600);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('en los logs el email va enmascarado', () => {
    assert.equal(enmascararEmail('ana@gmail.com'), 'a***@gmail.com');
    assert.equal(enmascararEmail('raro'), '***');
  });
});

describe('contraseñas', () => {
  const cripto = crearCripto(randomBytes(32));
  const claves = crearClaves(cripto, LIVIANO);

  test('Argon2id con pimienta y parámetros en el hash', async () => {
    const h = await claves.hash('una clave segura');
    assert.match(h, /^argon2id\$p1\$m=1024,t=1,p=1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
    assert.ok(!h.includes('una clave segura'));
    assert.notEqual(h, await claves.hash('una clave segura'), 'sal distinta cada vez');
    assert.equal(await claves.verificar('una clave segura', h), true);
    assert.equal(await claves.verificar('una clave segur', h), false);
    assert.equal(claves.hayQueRehacer(h), false);
  });

  test('sin la pimienta (otra clave maestra) el hash no sirve', async () => {
    const h = await claves.hash('una clave segura');
    const otra = crearClaves(crearCripto(randomBytes(32)), LIVIANO);
    assert.equal(await otra.verificar('una clave segura', h), false);
  });

  test('los hashes scrypt de antes siguen entrando y piden rehacerse', async () => {
    const sal = randomBytes(16);
    const hs = scryptSync('clave vieja', sal, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
    const viejo = `scrypt$16384$8$1$${sal.toString('base64')}$${hs.toString('base64')}`;
    assert.equal(await claves.verificar('clave vieja', viejo), true);
    assert.equal(await claves.verificar('otra', viejo), false);
    assert.equal(claves.hayQueRehacer(viejo), true);
  });

  test('parámetros más débiles que los actuales piden rehacerse', async () => {
    const debil = await crearClaves(cripto, { ...LIVIANO, memoria: 512 }).hash('x');
    assert.equal(await claves.verificar('x', debil), true);
    assert.equal(claves.hayQueRehacer(debil), true);
  });

  test('basura no verifica y no explota', async () => {
    for (const g of ['', 'nada', 'argon2id$p9$m=1,t=1,p=1$a$b', 'argon2id$p1$raro$a$b', null]) {
      assert.equal(await claves.verificar('x', g), false);
    }
    assert.equal(await claves.verificarFalso('x'), false);
  });

  test('los parámetros por defecto son los de OWASP', async () => {
    const real = crearClaves(cripto);
    assert.match(await real.hash('x'), /^argon2id\$p1\$m=19456,t=2,p=1\$/);
  });
});
