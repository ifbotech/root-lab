/* Los respaldos: cifrados para salir del servidor, y probados de verdad. */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { cifrarRespaldo, descifrarRespaldo, ordenDeEnvio } from '../server/respaldo.mjs';
import { verificar } from '../tools/restaurar.mjs';
import { abrirBase } from '../server/db.mjs';
import { crearCripto } from '../server/cripto.mjs';

const RAIZ = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CLAVE = 'una clave de respaldos bien larga y al azar';

describe('cifrar un respaldo', () => {
  test('ida y vuelta, y cada copia sale distinta', () => {
    const datos = randomBytes(5000);
    const a = cifrarRespaldo(datos, CLAVE);
    const b = cifrarRespaldo(datos, CLAVE);
    assert.ok(!a.equals(b), 'sal e iv nuevos cada vez');
    assert.equal(a.subarray(0, 4).toString(), 'RKR1');
    assert.ok(descifrarRespaldo(a, CLAVE).equals(datos));
    assert.ok(!a.includes(datos.subarray(0, 32)), 'no va nada en claro');
  });

  test('con otra clave, un byte tocado o cualquier otra cosa, no abre y lo dice', () => {
    const a = cifrarRespaldo(Buffer.from('la base'), CLAVE);
    assert.throws(() => descifrarRespaldo(a, 'otra clave distinta pero larga'), /clave no es/);
    const tocado = Buffer.from(a);
    tocado[50] ^= 1;
    assert.throws(() => descifrarRespaldo(tocado, CLAVE), /dañado/);
    assert.throws(() => descifrarRespaldo(Buffer.from('SQLite format 3'), CLAVE), /no es un respaldo/);
    assert.throws(() => cifrarRespaldo(Buffer.from('x'), 'corta'), /al menos 16/);
  });

  test('a dónde se manda: scp o rclone', () => {
    assert.deepEqual(ordenDeEnvio('respaldos@otro.host:/srv/rootlab', '/a/b.enc'), ['scp', ['-q', '-o', 'BatchMode=yes', '/a/b.enc', 'respaldos@otro.host:/srv/rootlab/']]);
    assert.deepEqual(ordenDeEnvio('b2:rootlab-respaldos', '/a/b.enc'), ['rclone', ['copy', '--quiet', '/a/b.enc', 'b2:rootlab-respaldos']]);
    assert.equal(ordenDeEnvio('', '/a/b.enc'), null);
  });
});

describe('respaldar y probar la restauración', () => {
  test('el respaldo diario deja la copia cifrada, y la prueba la abre y cuenta lo que tiene', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rootlab-respaldo-'));
    try {
      const db = abrirBase(join(dir, 'rootkit.db'), { cripto: crearCripto(randomBytes(32)) });
      db.cuentaCrear({ id: 'c1', email: 'ana@ejemplo.com', nombre: 'Ana', clave_hash: 'h', tz: 'UTC', creada: 1 });
      db.cerrar();
      const r = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', 'tools/respaldar.mjs', dir], {
        cwd: RAIZ, encoding: 'utf8', env: { ...process.env, ROOTLAB_RESPALDO_CLAVE: CLAVE, ROOTLAB_RESPALDO_DESTINO: '' },
      });
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.stdout, /1 cuentas/);
      assert.match(r.stdout, /cifrada en/);
      const archivos = readdirSync(join(dir, 'respaldos'));
      const cifrado = archivos.find((f) => f.endsWith('.db.enc'));
      assert.ok(cifrado && archivos.some((f) => f.endsWith('.db')));
      assert.ok(!readFileSync(join(dir, 'respaldos', cifrado)).includes('SQLite format 3'), 'el que sale del servidor no se lee');

      process.env.ROOTLAB_RESPALDO_CLAVE = CLAVE;
      const conteo = verificar(join(dir, 'respaldos', cifrado));
      assert.deepEqual([conteo.cuentas, conteo.plantas, conteo.esquema], [1, 0, 7]);
      process.env.ROOTLAB_RESPALDO_CLAVE = 'otra clave, también larga, pero no es';
      assert.throws(() => verificar(join(dir, 'respaldos', cifrado)), /clave no es/);
      writeFileSync(join(dir, 'respaldos', 'roto.db'), 'esto no es sqlite');
      assert.throws(() => verificar(join(dir, 'respaldos', 'roto.db')));
    } finally {
      delete process.env.ROOTLAB_RESPALDO_CLAVE;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
