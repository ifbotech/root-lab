/* La caja fuerte: que un respaldo se pueda abrir SIN el servidor.
 *
 * Es la prueba que le da sentido a los respaldos. Hasta que existió la caja,
 * las dos claves que hacen falta para leer una copia —la que la descifra y la
 * maestra que descifra lo personal de adentro— vivían sólo en
 * /etc/root-lab.env: si el VPS se perdía, quedaban los respaldos y ninguna
 * forma de abrirlos.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

import { cifrarRespaldo, descifrarRespaldo } from '../server/respaldo.mjs';
import { abrirBase } from '../server/db.mjs';
import { crearCripto } from '../server/cripto.mjs';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const CAJA = join(RAIZ, 'tools', 'caja-fuerte.mjs');
const FRASE = 'una frase larga que sólo sé yo';

const correr = (args, frase = FRASE) => execFileSync(process.execPath, [CAJA, ...args], {
  encoding: 'utf8',
  env: { ...process.env, ROOTLAB_CAJA_FRASE: frase },
});

describe('sellar y abrir', () => {
  test('lleva las claves del servidor y las devuelve tal cual', () => {
    const dir = mkdtempSync(join(tmpdir(), 'caja-'));
    try {
      const secretos = {
        ROOTLAB_SECRETO: randomBytes(32).toString('base64'),
        ROOTLAB_RESPALDO_CLAVE: randomBytes(32).toString('base64'),
        ROOTLAB_ADMIN_CLAVE: randomBytes(24).toString('base64'),
        ROOTLAB_SMTP_CLAVE: 'la-del-relay',
      };
      const env = join(dir, 'root-lab.env');
      writeFileSync(env, `# un comentario\n${Object.entries(secretos).map(([k, v]) => `${k}=${v}`).join('\n')}\nPORT=8090\n`);
      const vapid = join(dir, 'vapid.json');
      writeFileSync(vapid, JSON.stringify({ publicKey: 'pub', privateKey: 'priv' }));

      const caja = join(dir, 'caja.rkc');
      correr(['sellar', '--env', env, '--vapid', vapid, '--salida', caja]);
      assert.ok(existsSync(caja));

      /* Lo que quedó en el disco no se parece a ninguna clave. */
      const bytes = readFileSync(caja);
      assert.equal(bytes.subarray(0, 4).toString(), 'RKR1');
      for (const v of Object.values(secretos)) {
        assert.ok(!bytes.includes(Buffer.from(v)), 'ninguna clave queda en claro');
      }

      const salida = correr(['abrir', caja]);
      for (const [k, v] of Object.entries(secretos)) {
        assert.ok(salida.includes(`${k}=${v}`), `${k} vuelve entera`);
      }
      assert.match(salida, /priv/, 'y el VAPID también');

      const lista = correr(['listar', caja]);
      assert.match(lista, /ROOTLAB_SECRETO/);
      assert.ok(!lista.includes(secretos.ROOTLAB_SECRETO), 'listar no muestra los valores');

      const sola = correr(['abrir', caja, '--clave', 'ROOTLAB_SECRETO']).trim();
      assert.equal(sola.split('\n').at(-1), secretos.ROOTLAB_SECRETO);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('sin la frase no se abre', () => {
    const dir = mkdtempSync(join(tmpdir(), 'caja-'));
    try {
      const env = join(dir, 'e');
      writeFileSync(env, 'ROOTLAB_SECRETO=abc\nROOTLAB_RESPALDO_CLAVE=def\n');
      const caja = join(dir, 'caja.rkc');
      correr(['sellar', '--env', env, '--vapid', '/noexiste', '--salida', caja]);
      assert.throws(() => correr(['listar', caja], 'otra frase larga distinta'), /descifrar|clave no es/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('una frase corta no se acepta, y sin las imprescindibles tampoco sella', () => {
    const dir = mkdtempSync(join(tmpdir(), 'caja-'));
    try {
      const env = join(dir, 'e');
      writeFileSync(env, 'ROOTLAB_SECRETO=abc\nROOTLAB_RESPALDO_CLAVE=def\n');
      assert.throws(() => correr(['sellar', '--env', env, '--salida', join(dir, 'c.rkc')], 'corta'), /16 caracteres/);

      writeFileSync(env, 'PORT=8090\n');
      assert.throws(() => correr(['sellar', '--env', env, '--salida', join(dir, 'c.rkc')]), /ROOTLAB_SECRETO/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('la clave privada del firmware NO entra en la caja', () => {
    /* Su valor es justamente no estar donde está el servidor. Si algún día
       alguien la agrega "para no perderla", esta prueba lo frena. */
    const fuente = readFileSync(CAJA, 'utf8');
    assert.ok(!/firmware\.key['"`]\s*[,)\]]/.test(fuente.replace(/\/\*[\s\S]*?\*\//g, '')),
      'la caja no lee firmware.key');
    assert.match(fuente, /firmware\.key/, 'pero sí explica por qué no va');
  });
});

describe('el respaldo se abre sin el servidor', () => {
  test('con la caja y nada más se recupera una base', () => {
    /* El camino completo del día en que el VPS no está: se tiene el .db.enc y
       la caja. De la caja salen las dos claves, y con eso la base se lee. */
    const dir = mkdtempSync(join(tmpdir(), 'caja-'));
    try {
      const maestra = randomBytes(32);
      const claveRespaldo = randomBytes(32).toString('base64');

      /* Una base como la de producción: lo personal, cifrado con la maestra. */
      const db = abrirBase(join(dir, 'rootkit.db'), { cripto: crearCripto(maestra) });
      db.cuentaCrear({
        id: 'c1', email: 'rocio@ejemplo.com', nombre: 'Rocío', clave_hash: 'x',
        tz: 'America/Argentina/Buenos_Aires', creada: Date.now(),
      });
      db.cerrar();
      const bytes = readFileSync(join(dir, 'rootkit.db'));
      assert.ok(!bytes.includes(Buffer.from('rocio@ejemplo.com')), 'el email no está en claro en la base');

      /* El respaldo que sale del servidor. */
      const respaldo = join(dir, 'rootkit.db.enc');
      writeFileSync(respaldo, cifrarRespaldo(bytes, claveRespaldo));

      /* La caja, con las dos claves. */
      const env = join(dir, 'root-lab.env');
      writeFileSync(env, `ROOTLAB_SECRETO=${maestra.toString('base64')}\nROOTLAB_RESPALDO_CLAVE=${claveRespaldo}\n`);
      const caja = join(dir, 'caja.rkc');
      correr(['sellar', '--env', env, '--vapid', '/noexiste', '--salida', caja]);

      /* Y ahora, el día después: se borra todo menos el respaldo y la caja. */
      rmSync(env);
      rmSync(join(dir, 'rootkit.db'));

      const deLaCaja = (k) => correr(['abrir', caja, '--clave', k]).trim().split('\n').at(-1);
      const recuperada = descifrarRespaldo(readFileSync(respaldo), deLaCaja('ROOTLAB_RESPALDO_CLAVE'));
      writeFileSync(join(dir, 'restaurada.db'), recuperada);

      const cripto = crearCripto(Buffer.from(deLaCaja('ROOTLAB_SECRETO'), 'base64'));
      const abierta = abrirBase(join(dir, 'restaurada.db'), { cripto });
      assert.equal(abierta.cuenta('c1').email, 'rocio@ejemplo.com', 'la cuenta vuelve entera');
      assert.equal(abierta.cuenta('c1').nombre, 'Rocío');
      abierta.cerrar();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
