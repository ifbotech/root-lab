/* La base de datos en disco: que lo guardado sobreviva a un reinicio y que
 * el respaldo sea una copia usable.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { abrirBase } from '../server/db.mjs';

test('lo guardado sobrevive a cerrar y volver a abrir', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rootlab-db-'));
  const archivo = join(dir, 'rootkit.db');
  try {
    let db = abrirBase(archivo);
    db.cuentaCrear({ id: 'c1', email: 'ana@ejemplo.com', nombre: 'Ana', clave_hash: 'x', tz: 'UTC', creada: 1 });
    db.dispositivoGuardar({ id: 'AABBCCDDEEFF', token_hash: 'h', creado: 1, epoca: 0, planta: 'p1', ultima: { t: 5, suelo: 40 } });
    db.plantaCrear({ id: 'p1', cuenta: 'c1', dispositivo: 'AABBCCDDEEFF', epoca: 0, creada: 2, nombre: 'Rulo', vinculo: { dias_sanos: 3 } });
    db.transaccion(() => {
      for (let i = 0; i < 100; i++) {
        db.lecturaInsertar({ dispositivo: 'AABBCCDDEEFF', planta: 'p1', t: 1000 + i, suelo: 40, animo: 'HAPPY', sev: 'OK' });
      }
    });
    db.cerrar();

    db = abrirBase(archivo);
    assert.equal(db.cuentaPorEmail('ANA@ejemplo.com').nombre, 'Ana', 'el email no distingue mayúsculas');
    assert.equal(db.planta('p1').nombre, 'Rulo');
    assert.equal(db.planta('p1').vinculo.dias_sanos, 3);
    assert.equal(db.dispositivo('AABBCCDDEEFF').ultima.suelo, 40);
    assert.equal(db.lecturasDePlanta('p1', 0).length, 100);
    assert.deepEqual(db.contar(), { cuentas: 1, dispositivos: 1, plantas: 1, lecturas: 100 });

    const copia = join(dir, 'respaldos', 'copia.db');
    db.respaldar(copia);
    assert.ok(existsSync(copia));
    const r = abrirBase(copia);
    assert.equal(r.lecturasDePlanta('p1', 0).length, 100, 'el respaldo es una base completa');
    r.cerrar();
    db.cerrar();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('una transacción que falla no deja nada a medias', () => {
  const db = abrirBase();
  db.cuentaCrear({ id: 'c1', email: 'b@ejemplo.com', clave_hash: 'x', tz: 'UTC', creada: 1 });
  assert.throws(() => db.transaccion(() => {
    db.lecturaInsertar({ dispositivo: 'D', planta: 'p', t: 1, animo: 'HAPPY', sev: 'OK' });
    db.cuentaCrear({ id: 'c2', email: 'b@ejemplo.com', clave_hash: 'x', tz: 'UTC', creada: 1 });
  }));
  assert.equal(db.contarLecturas('D'), 0);
  db.cerrar();
});

test('borrar una cuenta se lleva sesiones, plantas y suscripciones', () => {
  const db = abrirBase();
  db.cuentaCrear({ id: 'c1', email: 'c@ejemplo.com', clave_hash: 'x', tz: 'UTC', creada: 1 });
  db.sesionCrear('s1', 'c1', 1);
  db.suscripcionGuardar('c1', { endpoint: 'https://push/1', keys: { p256dh: 'k', auth: 'a' } }, 1);
  db.dispositivoGuardar({ id: 'AABBCCDDEEFF', token_hash: 'h', creado: 1, planta: 'p1' });
  db.plantaCrear({ id: 'p1', cuenta: 'c1', dispositivo: 'AABBCCDDEEFF', epoca: 0, creada: 2, vinculo: {} });
  db.cuentaBorrar('c1');
  assert.equal(db.sesionCuenta('s1', 2), null);
  assert.equal(db.planta('p1'), null);
  assert.deepEqual(db.suscripciones('c1'), []);
  assert.equal(db.dispositivo('AABBCCDDEEFF').planta, null, 'la maceta queda libre');
  db.cerrar();
});
