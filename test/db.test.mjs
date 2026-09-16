/* La base de datos en disco: que lo guardado sobreviva a un reinicio, que el
 * respaldo sea una copia usable, que lo personal esté cifrado de verdad y que
 * una base de la versión anterior se migre sin perder nada.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import { abrirBase, VERSION_ESQUEMA } from '../server/db.mjs';
import { crearCripto } from '../server/cripto.mjs';

const conDir = (fn) => {
  const dir = mkdtempSync(join(tmpdir(), 'rootlab-db-'));
  try { return fn(dir); } finally {
    /* En Windows un archivo abierto no se borra: que eso no tape el error real. */
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* queda en tmp */ }
  }
};

test('lo guardado sobrevive a cerrar y volver a abrir', () => conDir((dir) => {
  const archivo = join(dir, 'rootkit.db');
  const cripto = crearCripto(randomBytes(32));
  let db = abrirBase(archivo, { cripto });
  db.cuentaCrear({ id: 'c1', email: 'ana@ejemplo.com', nombre: 'Ana', clave_hash: 'x', tz: 'UTC', creada: 1 });
  db.dispositivoGuardar({ id: 'AABBCCDDEEFF', token_hash: 'h', creado: 1, epoca: 0, planta: 'p1', ultima: { t: 5, suelo: 40 } });
  db.plantaCrear({ id: 'p1', cuenta: 'c1', dispositivo: 'AABBCCDDEEFF', epoca: 0, creada: 2, nombre: 'Rulo', vinculo: { dias_sanos: 3 } });
  db.transaccion(() => {
    for (let i = 0; i < 100; i++) {
      db.lecturaInsertar({ dispositivo: 'AABBCCDDEEFF', planta: 'p1', t: 1000 + i, suelo: 40, animo: 'HAPPY', sev: 'OK' });
    }
  });
  db.cerrar();

  db = abrirBase(archivo, { cripto });
  assert.equal(db.version(), VERSION_ESQUEMA);
  assert.equal(db.cuentaPorEmail('ANA@ejemplo.com').nombre, 'Ana', 'el email no distingue mayúsculas');
  assert.equal(db.planta('p1').nombre, 'Rulo');
  assert.equal(db.planta('p1').vinculo.dias_sanos, 3);
  assert.equal(db.dispositivo('AABBCCDDEEFF').ultima.suelo, 40);
  assert.equal(db.lecturasDePlanta('p1', 0).length, 100);
  assert.deepEqual(db.contar(), { cuentas: 1, dispositivos: 1, plantas: 1, lecturas: 100 });

  const copia = join(dir, 'respaldos', 'copia.db');
  db.respaldar(copia);
  assert.ok(existsSync(copia));
  const r = abrirBase(copia, { cripto });
  assert.equal(r.lecturasDePlanta('p1', 0).length, 100, 'el respaldo es una base completa');
  assert.equal(r.cuenta('c1').email, 'ana@ejemplo.com', 'y con la misma clave se lee');
  r.cerrar();
  db.cerrar();
}));

test('en el archivo no hay emails, nombres ni mensajes en claro', () => conDir((dir) => {
  const archivo = join(dir, 'rootkit.db');
  const cripto = crearCripto(randomBytes(32));
  const db = abrirBase(archivo, { cripto });
  db.cuentaCrear({ id: 'c1', email: 'secreta@ejemplo.com', nombre: 'Josefina', clave_hash: 'x', tz: 'UTC', creada: 1 });
  db.plantaCrear({ id: 'p1', cuenta: 'c1', dispositivo: 'D', epoca: 0, creada: 2, vinculo: {} });
  db.chatAgregar({ planta: 'p1', cuenta: 'c1', t: 3, rol: 'persona', texto: 'mi perro se llama Firulais' });
  assert.equal(db.chatDe('p1')[0].texto, 'mi perro se llama Firulais');
  db.respaldar(join(dir, 'plano.db'));
  db.cerrar();
  const bytes = readFileSync(join(dir, 'plano.db')).toString('latin1');
  for (const s of ['secreta@ejemplo.com', 'secreta', 'Josefina', 'Firulais']) {
    assert.ok(!bytes.includes(s), `"${s}" no aparece en el archivo`);
  }
}));

test('sin la clave maestra la base no se puede leer', () => conDir((dir) => {
  const archivo = join(dir, 'rootkit.db');
  const db = abrirBase(archivo, { cripto: crearCripto(randomBytes(32)) });
  db.cuentaCrear({ id: 'c1', email: 'ana@ejemplo.com', clave_hash: 'x', tz: 'UTC', creada: 1 });
  db.cerrar();
  const ajena = abrirBase(archivo, { cripto: crearCripto(randomBytes(32)) });
  assert.equal(ajena.cuentaPorEmail('ana@ejemplo.com'), null, 'el índice ciego no coincide con otra clave');
  assert.throws(() => ajena.cuenta('c1'), 'y el email no se descifra');
  ajena.cerrar();
  assert.throws(() => abrirBase(archivo), /cripto/, 'una base en disco exige la clave');
}));

test('una transacción que falla no deja nada a medias', () => {
  const db = abrirBase();
  db.cuentaCrear({ id: 'c1', email: 'b@ejemplo.com', clave_hash: 'x', tz: 'UTC', creada: 1 });
  assert.throws(() => db.transaccion(() => {
    db.lecturaInsertar({ dispositivo: 'D', planta: 'p', t: 1, animo: 'HAPPY', sev: 'OK' });
    db.cuentaCrear({ id: 'c2', email: 'B@ejemplo.com', clave_hash: 'x', tz: 'UTC', creada: 1 });
  }));
  assert.equal(db.contarLecturas('D'), 0);
  db.cerrar();
});

test('borrar una cuenta se lleva sesiones, tokens, plantas, chat y suscripciones', () => {
  const db = abrirBase();
  db.cuentaCrear({ id: 'c1', email: 'c@ejemplo.com', clave_hash: 'x', tz: 'UTC', creada: 1 });
  db.sesionCrear('s1', 'c1', 1);
  db.tokenCuentaCrear('t1', 'c1', 'restablecer', 1, 10);
  db.suscripcionGuardar('c1', { endpoint: 'https://push/1', keys: { p256dh: 'k', auth: 'a' } }, 1);
  db.dispositivoGuardar({ id: 'AABBCCDDEEFF', token_hash: 'h', creado: 1, planta: 'p1' });
  db.plantaCrear({ id: 'p1', cuenta: 'c1', dispositivo: 'AABBCCDDEEFF', epoca: 0, creada: 2, vinculo: {} });
  db.chatAgregar({ planta: 'p1', cuenta: 'c1', t: 3, rol: 'persona', texto: 'hola' });
  db.iaUsoRegistrar({ t: 3, dia: '2026-09-16', cuenta: 'c1', planta: 'p1', tipo: 'chat', fuente: 'claude', costo_micro: 500 });
  db.cuentaBorrar('c1');
  assert.equal(db.sesionCuenta('s1', 2), null);
  assert.equal(db.tokenCuentaUsar('t1', 'restablecer', 2), null);
  assert.equal(db.planta('p1'), null);
  assert.deepEqual(db.chatDe('p1'), []);
  assert.deepEqual(db.suscripciones('c1'), []);
  assert.equal(db.dispositivo('AABBCCDDEEFF').planta, null, 'la maceta queda libre');
  assert.equal(db.iaGastoDesde(0), 500, 'el gasto queda, sin dueño: las cuentas del tope cierran');
  db.cerrar();
});

test('un token de cuenta sirve una vez, vence, y uno nuevo anula al anterior', () => {
  const db = abrirBase();
  db.cuentaCrear({ id: 'c1', email: 'd@ejemplo.com', clave_hash: 'x', tz: 'UTC', creada: 1 });
  db.tokenCuentaCrear('viejo', 'c1', 'restablecer', 1, 100);
  db.tokenCuentaCrear('nuevo', 'c1', 'restablecer', 2, 100);
  assert.equal(db.tokenCuentaUsar('viejo', 'restablecer', 3), null, 'el anterior dejó de valer');
  assert.equal(db.tokenCuentaVigente('nuevo', 'restablecer', 3), true);
  assert.equal(db.tokenCuentaUsar('nuevo', 'verificar', 3), null, 'un token no sirve para otro tipo');
  assert.equal(db.tokenCuentaUsar('nuevo', 'restablecer', 3), 'c1');
  assert.equal(db.tokenCuentaUsar('nuevo', 'restablecer', 4), null, 'y no sirve dos veces');
  db.tokenCuentaCrear('tarde', 'c1', 'verificar', 1, 10);
  assert.equal(db.tokenCuentaUsar('tarde', 'verificar', 11), null, 'vencido');
  db.cerrar();
});

test('una base v1 (email en claro) se migra a v2 sin perder nada', () => conDir((dir) => {
  const archivo = join(dir, 'rootkit.db');
  const v1 = new DatabaseSync(archivo);
  v1.exec(`
    CREATE TABLE meta (clave TEXT PRIMARY KEY, valor TEXT NOT NULL);
    INSERT INTO meta VALUES ('esquema', '1');
    CREATE TABLE cuentas (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE, nombre TEXT NOT NULL DEFAULT '',
      clave_hash TEXT NOT NULL, tz TEXT NOT NULL, coleccion TEXT NOT NULL DEFAULT '[]', creada INTEGER NOT NULL);
    CREATE TABLE sesiones (token_hash TEXT PRIMARY KEY, cuenta TEXT NOT NULL REFERENCES cuentas(id) ON DELETE CASCADE,
      creada INTEGER NOT NULL, vista INTEGER NOT NULL, agente TEXT NOT NULL DEFAULT '');
    CREATE TABLE plantas (id TEXT PRIMARY KEY, cuenta TEXT NOT NULL REFERENCES cuentas(id) ON DELETE CASCADE,
      dispositivo TEXT NOT NULL, epoca INTEGER NOT NULL, creada INTEGER NOT NULL, persona TEXT,
      revelado INTEGER NOT NULL DEFAULT 0, revelada_en INTEGER, nombre TEXT NOT NULL DEFAULT '', especie TEXT,
      pantalla TEXT NOT NULL DEFAULT 'toque', brillo INTEGER NOT NULL DEFAULT 80, vinculo TEXT NOT NULL, desvinculada INTEGER);
    INSERT INTO cuentas VALUES ('c1', 'Vieja@Ejemplo.com', 'Vera', 'scrypt$16384$8$1$sal$hash', 'UTC', '["kawaii"]', 1);
    INSERT INTO sesiones VALUES ('s1', 'c1', 1, 1, '');
    INSERT INTO plantas (id, cuenta, dispositivo, epoca, creada, nombre, vinculo) VALUES ('p1', 'c1', 'D', 0, 2, 'Rulo', '{}');
  `);
  v1.close();

  const cripto = crearCripto(randomBytes(32));
  const db = abrirBase(archivo, { cripto });
  assert.equal(db.version(), VERSION_ESQUEMA, 'llega hasta la versión actual');
  const c = db.cuentaPorEmail('vieja@ejemplo.com');
  assert.equal(c.id, 'c1');
  assert.equal(c.email, 'vieja@ejemplo.com');
  assert.equal(c.nombre, 'Vera');
  assert.deepEqual(c.coleccion, ['kawaii']);
  assert.equal(c.clave_hash, 'scrypt$16384$8$1$sal$hash', 'el hash viejo se conserva: se rehace al entrar');
  assert.equal(c.plan, 'gratis');
  assert.equal(db.sesionCuenta('s1', 2).id, 'c1', 'las sesiones siguen');
  assert.equal(db.planta('p1').nombre, 'Rulo');
  db.chatAgregar({ planta: 'p1', cuenta: 'c1', t: 3, rol: 'persona', texto: 'hola' });
  db.cuentaBorrar('c1');
  assert.equal(db.planta('p1'), null, 'las claves foráneas siguen andando después de reconstruir la tabla');
  db.cerrar();
  const otraVez = abrirBase(archivo, { cripto });
  assert.equal(otraVez.version(), VERSION_ESQUEMA, 'abrirla de nuevo no vuelve a migrar');
  otraVez.cerrar();
}));

test('una base v2 recibe la columna de escurrimiento sin perder lecturas', () => conDir((dir) => {
  const archivo = join(dir, 'rootkit.db');
  const cripto = crearCripto(randomBytes(32));
  let db = abrirBase(archivo, { cripto });
  db.lecturaInsertar({ dispositivo: 'D', planta: 'p1', t: 1, suelo: 40, animo: 'HAPPY', sev: 'OK' });
  db.cerrar();
  /* Se la deja como la dejaba la versión 2: sin la columna y con su número. */
  const cruda = new DatabaseSync(archivo);
  cruda.exec("ALTER TABLE lecturas DROP COLUMN escurre; UPDATE meta SET valor = '2' WHERE clave = 'esquema'");
  cruda.close();
  db = abrirBase(archivo, { cripto });
  assert.equal(db.version(), VERSION_ESQUEMA);
  db.lecturaInsertar({ dispositivo: 'D', planta: 'p1', t: 2, suelo: 18, animo: 'THIRSTY', sev: 'URGENT', escurre: true });
  const l = db.lecturasDePlanta('p1', 0);
  assert.equal(l.length, 2);
  assert.deepEqual(l.map((x) => x.escurre), [false, true]);
  db.cerrar();
}));

test('una base v3 recibe la ciudad, el clima, los cuidadores y los riegos', () => conDir((dir) => {
  const archivo = join(dir, 'rootkit.db');
  const cripto = crearCripto(randomBytes(32));
  let db = abrirBase(archivo, { cripto });
  db.cuentaCrear({ id: 'c1', email: 'e@ejemplo.com', clave_hash: 'x', tz: 'UTC', creada: 1 });
  db.cerrar();
  const cruda = new DatabaseSync(archivo);
  cruda.exec(`ALTER TABLE cuentas DROP COLUMN ubicacion; DROP TABLE clima; DROP TABLE cuidadores; DROP TABLE riegos;
    UPDATE meta SET valor = '3' WHERE clave = 'esquema'`);
  cruda.close();
  db = abrirBase(archivo, { cripto });
  assert.equal(db.version(), VERSION_ESQUEMA);
  assert.equal(db.cuenta('c1').ubicacion, null);
  db.cuentaActualizar('c1', { ubicacion: { nombre: 'Rosario', pais: 'Argentina', lat: -32.95, lon: -60.64 } });
  assert.equal(db.cuenta('c1').ubicacion.nombre, 'Rosario');
  assert.deepEqual(db.cuentasConUbicacion().map((c) => c.id), ['c1']);
  /* La ciudad va cifrada, como el email. */
  const fila = new DatabaseSync(archivo).prepare('SELECT ubicacion FROM cuentas').get();
  assert.match(fila.ubicacion, /^v1\./);
  assert.doesNotMatch(fila.ubicacion, /Rosario/);
  db.climaGuardar('c1', 10, { horas: [{ t: 1, temp_dc: 250, hr: 50 }] });
  assert.equal(db.climaLeer('c1').datos.horas.length, 1);
  db.cuidadorCrear({ token_hash: 'h', planta: 'p1', cuenta: 'c1', nombre: 'Ana', creado: 5, vence: 100 });
  assert.equal(db.cuidadorPorHash('h', 50).nombre, 'Ana');
  assert.equal(db.cuidadorPorHash('h', 100), null, 'vencido');
  db.riegoRegistrar({ planta: 'p1', t: 7, origen: 'cuidador', quien: 'Ana' });
  assert.equal(db.ultimoRiego('p1').quien, 'Ana');
  db.cuentaActualizar('c1', { ubicacion: null });
  assert.equal(db.cuenta('c1').ubicacion, null);
  /* v5: el álbum. */
  const id = db.fotoGuardar({ planta: 'p1', cuenta: 'c1', t: 9, mime: 'image/jpeg', bytes: Buffer.from('fotofoto'), origen: 'album' });
  assert.ok(Number.isInteger(id));
  assert.equal(db.contarFotos('p1'), 1);
  assert.equal(db.fotosDe('p1')[0].peso, 8);
  assert.equal(Buffer.from(db.foto(id, 'p1').bytes).toString(), 'fotofoto');
  assert.equal(db.foto(id, 'otra'), null, 'la foto es de su planta');
  db.fotoBorrar(id, 'p1');
  assert.equal(db.contarFotos('p1'), 0);
  db.cerrar();
}));

test('el uso de IA se suma por período y se cuenta por cuenta y por Rooti', () => {
  const db = abrirBase();
  db.cuentaCrear({ id: 'c1', email: 'e@ejemplo.com', clave_hash: 'x', tz: 'UTC', creada: 1 });
  db.iaUsoRegistrar({ t: 100, dia: '2026-09-16', cuenta: 'c1', planta: 'p1', tipo: 'chat', fuente: 'claude', costo_micro: 1000 });
  db.iaUsoRegistrar({ t: 200, dia: '2026-09-16', cuenta: 'c1', planta: 'p1', tipo: 'chat', fuente: 'simulada', costo_micro: 0 });
  db.iaUsoRegistrar({ t: 300, dia: '2026-09-17', cuenta: 'c1', planta: 'p2', tipo: 'identificar', fuente: 'claude', costo_micro: 30000 });
  assert.equal(db.iaGastoDesde(0), 31000);
  assert.equal(db.iaGastoDesde(250), 30000);
  assert.equal(db.iaUsosCuenta('c1', 'chat', '2026-09-16'), 2);
  assert.equal(db.iaUsosPlanta('p2', 'identificar', '2026-09-17'), 1);
  assert.equal(db.iaResumen(0).total.llamadas, 3);
  db.cerrar();
});
