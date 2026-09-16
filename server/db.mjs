/* db.mjs — la base de datos: SQLite.
 *
 * POR QUÉ SQLITE
 *
 * Un solo servidor, un solo proceso escribiendo, lecturas de sensores que
 * llegan de a una cada quince minutos por maceta. Para eso SQLite es una base
 * de datos de verdad —transacciones, índices, integridad referencial— sin un
 * servicio más que instalar, respaldar y vigilar. Con WAL, las lecturas no
 * esperan a las escrituras. Viene dentro de Node (`node:sqlite`), así que no
 * hay dependencias nativas que compilar.
 *
 * Una maceta que reporta cada 15 minutos son 35.000 filas por año: SQLite
 * maneja cientos de millones. El día que haga falta más de un servidor, se
 * pasa a Postgres cambiando este archivo; el resto del servidor sólo ve las
 * funciones de abajo.
 *
 * LAS TABLAS
 *
 *   cuentas         una persona: email, contraseña (scrypt), zona horaria,
 *                   colección de personajes
 *   sesiones        un teléfono con la sesión abierta (se guarda el hash del
 *                   token, nunca el token)
 *   dispositivos    cada ROOTKIT: token, estado, código y época, última lectura
 *   plantas         el vínculo de un ROOTKIT con una cuenta: nombre, especie,
 *                   personaje, días sanos. Desvincular no la borra: la marca.
 *   lecturas        TODAS las lecturas, para siempre, de la planta a la que
 *                   pertenecían cuando se midieron
 *   suscripciones   notificaciones push de cada cuenta
 *   avisos          cuándo se mandó cada tipo de aviso por planta
 *
 * Cada lectura se guarda con la PLANTA vigente al medirla. Así el historial de
 * una planta es exactamente el suyo: si el aparato cambia de dueño, el nuevo
 * dueño no ve nada del anterior, por construcción y no por un filtro.
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const VERSION_ESQUEMA = 1;

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS meta (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cuentas (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE COLLATE NOCASE,
  nombre      TEXT NOT NULL DEFAULT '',
  clave_hash  TEXT NOT NULL,
  tz          TEXT NOT NULL,
  coleccion   TEXT NOT NULL DEFAULT '[]',
  creada      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sesiones (
  token_hash  TEXT PRIMARY KEY,
  cuenta      TEXT NOT NULL REFERENCES cuentas(id) ON DELETE CASCADE,
  creada      INTEGER NOT NULL,
  vista       INTEGER NOT NULL,
  agente      TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS sesiones_cuenta ON sesiones(cuenta);

CREATE TABLE IF NOT EXISTS dispositivos (
  id              TEXT PRIMARY KEY,
  token_hash      TEXT NOT NULL,
  creado          INTEGER NOT NULL,
  visto           INTEGER,
  fw              TEXT, placa TEXT, pantalla TEXT, estado TEXT,
  epoca           INTEGER NOT NULL DEFAULT 0,
  rssi            INTEGER,
  usb             INTEGER NOT NULL DEFAULT 0,
  bat_mv          INTEGER NOT NULL DEFAULT 0,
  persona_fabrica TEXT,
  codigo          TEXT,
  codigo_epoca    INTEGER,
  ultimo_reloj    INTEGER NOT NULL DEFAULT -1,
  arranques       INTEGER NOT NULL DEFAULT 0,
  planta          TEXT,
  animo           TEXT,
  sev             TEXT,
  ultima          TEXT
);
CREATE INDEX IF NOT EXISTS dispositivos_codigo ON dispositivos(codigo);

CREATE TABLE IF NOT EXISTS plantas (
  id           TEXT PRIMARY KEY,
  cuenta       TEXT NOT NULL REFERENCES cuentas(id) ON DELETE CASCADE,
  dispositivo  TEXT NOT NULL,
  epoca        INTEGER NOT NULL,
  creada       INTEGER NOT NULL,
  persona      TEXT,
  revelado     INTEGER NOT NULL DEFAULT 0,
  revelada_en  INTEGER,
  nombre       TEXT NOT NULL DEFAULT '',
  especie      TEXT,
  pantalla     TEXT NOT NULL DEFAULT 'toque',
  brillo       INTEGER NOT NULL DEFAULT 80,
  vinculo      TEXT NOT NULL,
  desvinculada INTEGER
);
CREATE INDEX IF NOT EXISTS plantas_cuenta ON plantas(cuenta);

CREATE TABLE IF NOT EXISTS lecturas (
  id          INTEGER PRIMARY KEY,
  dispositivo TEXT NOT NULL,
  planta      TEXT,
  t           INTEGER NOT NULL,
  suelo       INTEGER, temp INTEGER, hr INTEGER, lux INTEGER,
  tsuelo      INTEGER, bat INTEGER, crudo INTEGER,
  usb         INTEGER NOT NULL DEFAULT 0,
  animo       TEXT NOT NULL,
  sev         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS lecturas_planta_t ON lecturas(planta, t);
CREATE INDEX IF NOT EXISTS lecturas_dispositivo_t ON lecturas(dispositivo, t);

CREATE TABLE IF NOT EXISTS suscripciones (
  endpoint  TEXT PRIMARY KEY,
  cuenta    TEXT NOT NULL REFERENCES cuentas(id) ON DELETE CASCADE,
  p256dh    TEXT NOT NULL,
  auth      TEXT NOT NULL,
  creada    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS suscripciones_cuenta ON suscripciones(cuenta);

CREATE TABLE IF NOT EXISTS avisos (
  planta  TEXT NOT NULL,
  clave   TEXT NOT NULL,
  t       INTEGER NOT NULL,
  PRIMARY KEY (planta, clave)
);
`;

const json = (s, def = null) => {
  if (s === null || s === undefined) return def;
  try { return JSON.parse(s); } catch { return def; }
};
const nulo = (v) => (v === undefined ? null : v);
const bool = (v) => (v ? 1 : 0);

function filaCuenta(f) {
  return f ? { ...f, coleccion: json(f.coleccion, []) } : null;
}

function filaDispositivo(f) {
  return f ? { ...f, usb: Boolean(f.usb), ultima: json(f.ultima) } : null;
}

function filaPlanta(f) {
  return f ? {
    ...f,
    revelado: Boolean(f.revelado),
    especie: json(f.especie),
    vinculo: json(f.vinculo, {}),
  } : null;
}

export function abrirBase(archivo = ':memory:') {
  if (archivo !== ':memory:') mkdirSync(dirname(archivo), { recursive: true });
  const db = new DatabaseSync(archivo);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;');
  db.exec(ESQUEMA);
  db.prepare('INSERT OR IGNORE INTO meta (clave, valor) VALUES (?, ?)').run('esquema', String(VERSION_ESQUEMA));

  const cache = new Map();
  const q = (sql) => {
    let st = cache.get(sql);
    if (!st) {
      st = db.prepare(sql);
      cache.set(sql, st);
    }
    return st;
  };

  const repo = {
    archivo,

    cerrar() { db.close(); },

    /** Corre `fn` en una transacción: todo o nada. */
    transaccion(fn) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const r = fn();
        db.exec('COMMIT');
        return r;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },

    /** Copia consistente de la base, aunque esté en uso. */
    respaldar(destino) {
      mkdirSync(dirname(destino), { recursive: true });
      db.prepare('VACUUM INTO ?').run(destino);
    },

    contar() {
      return {
        cuentas: q('SELECT COUNT(*) n FROM cuentas').get().n,
        dispositivos: q('SELECT COUNT(*) n FROM dispositivos').get().n,
        plantas: q('SELECT COUNT(*) n FROM plantas WHERE desvinculada IS NULL').get().n,
        lecturas: q('SELECT COUNT(*) n FROM lecturas').get().n,
      };
    },

    /* ------------------------------------------------------------ cuentas */
    cuentaCrear(c) {
      q(`INSERT INTO cuentas (id, email, nombre, clave_hash, tz, coleccion, creada)
         VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(c.id, c.email, c.nombre || '', c.clave_hash, c.tz, JSON.stringify(c.coleccion || []), c.creada);
    },
    cuenta(id) { return filaCuenta(q('SELECT * FROM cuentas WHERE id = ?').get(id)); },
    cuentaPorEmail(email) { return filaCuenta(q('SELECT * FROM cuentas WHERE email = ?').get(email)); },
    cuentaActualizar(id, c) {
      const actual = repo.cuenta(id);
      if (!actual) return;
      q('UPDATE cuentas SET nombre = ?, tz = ?, clave_hash = ?, coleccion = ? WHERE id = ?')
        .run(c.nombre ?? actual.nombre, c.tz ?? actual.tz, c.clave_hash ?? actual.clave_hash,
          JSON.stringify(c.coleccion ?? actual.coleccion), id);
    },
    /** Borra la cuenta y todo lo suyo: plantas, lecturas, sesiones, avisos. */
    cuentaBorrar(id) {
      repo.transaccion(() => {
        const plantas = q('SELECT id, dispositivo FROM plantas WHERE cuenta = ?').all(id);
        for (const p of plantas) {
          q('UPDATE dispositivos SET planta = NULL WHERE id = ? AND planta = ?').run(p.dispositivo, p.id);
          q('DELETE FROM lecturas WHERE planta = ?').run(p.id);
          q('DELETE FROM avisos WHERE planta = ?').run(p.id);
        }
        q('DELETE FROM cuentas WHERE id = ?').run(id);   /* cascada: sesiones, plantas, suscripciones */
      });
    },

    /* ----------------------------------------------------------- sesiones */
    sesionCrear(tokenHash, cuenta, t, agente = '') {
      q('INSERT INTO sesiones (token_hash, cuenta, creada, vista, agente) VALUES (?, ?, ?, ?, ?)')
        .run(tokenHash, cuenta, t, t, String(agente).slice(0, 200));
    },
    /** La cuenta de una sesión, o null. Anota el uso como mucho una vez por hora. */
    sesionCuenta(tokenHash, t, vence) {
      const s = q('SELECT * FROM sesiones WHERE token_hash = ?').get(tokenHash);
      if (!s) return null;
      if (vence && t - s.vista > vence) {
        q('DELETE FROM sesiones WHERE token_hash = ?').run(tokenHash);
        return null;
      }
      if (t - s.vista > 3600 * 1000) q('UPDATE sesiones SET vista = ? WHERE token_hash = ?').run(t, tokenHash);
      return repo.cuenta(s.cuenta);
    },
    sesionBorrar(tokenHash) { q('DELETE FROM sesiones WHERE token_hash = ?').run(tokenHash); },
    sesionesBorrarOtras(cuenta, conservar) {
      q('DELETE FROM sesiones WHERE cuenta = ? AND token_hash != ?').run(cuenta, conservar);
    },
    sesionesDe(cuenta) { return q('SELECT COUNT(*) n FROM sesiones WHERE cuenta = ?').get(cuenta).n; },

    /* ------------------------------------------------------- dispositivos */
    dispositivo(id) { return filaDispositivo(q('SELECT * FROM dispositivos WHERE id = ?').get(id)); },
    /** El aparato que muestra hoy este código (el de su época actual). */
    dispositivoPorCodigo(codigo) {
      return filaDispositivo(q('SELECT * FROM dispositivos WHERE codigo = ? AND codigo_epoca = epoca').get(codigo));
    },
    dispositivoGuardar(d) {
      q(`INSERT INTO dispositivos (id, token_hash, creado, visto, fw, placa, pantalla, estado, epoca, rssi, usb,
           bat_mv, persona_fabrica, codigo, codigo_epoca, ultimo_reloj, arranques, planta, animo, sev, ultima)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           token_hash = excluded.token_hash, visto = excluded.visto, fw = excluded.fw, placa = excluded.placa,
           pantalla = excluded.pantalla, estado = excluded.estado, epoca = excluded.epoca, rssi = excluded.rssi,
           usb = excluded.usb, bat_mv = excluded.bat_mv, persona_fabrica = excluded.persona_fabrica,
           codigo = excluded.codigo, codigo_epoca = excluded.codigo_epoca, ultimo_reloj = excluded.ultimo_reloj,
           arranques = excluded.arranques, planta = excluded.planta, animo = excluded.animo, sev = excluded.sev,
           ultima = excluded.ultima`)
        .run(d.id, d.token_hash, d.creado, nulo(d.visto), nulo(d.fw), nulo(d.placa), nulo(d.pantalla),
          nulo(d.estado), d.epoca ?? 0, nulo(d.rssi), bool(d.usb), d.bat_mv ?? 0, nulo(d.persona_fabrica),
          nulo(d.codigo), nulo(d.codigo_epoca), d.ultimo_reloj ?? -1, d.arranques ?? 0, nulo(d.planta),
          nulo(d.animo), nulo(d.sev), d.ultima ? JSON.stringify(d.ultima) : null);
    },

    /* ------------------------------------------------------------ plantas */
    plantaCrear(p) {
      q(`INSERT INTO plantas (id, cuenta, dispositivo, epoca, creada, persona, revelado, nombre, especie,
           pantalla, brillo, vinculo)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(p.id, p.cuenta, p.dispositivo, p.epoca, p.creada, nulo(p.persona), bool(p.revelado),
          p.nombre || '', p.especie ? JSON.stringify(p.especie) : null, p.pantalla || 'toque',
          p.brillo ?? 80, JSON.stringify(p.vinculo || {}));
    },
    /** Una planta vinculada (las desvinculadas no se devuelven). */
    planta(id) {
      return filaPlanta(q('SELECT * FROM plantas WHERE id = ? AND desvinculada IS NULL').get(id));
    },
    plantasDe(cuenta) {
      return q('SELECT * FROM plantas WHERE cuenta = ? AND desvinculada IS NULL ORDER BY creada').all(cuenta).map(filaPlanta);
    },
    plantasActivas() {
      return q('SELECT * FROM plantas WHERE desvinculada IS NULL').all().map(filaPlanta);
    },
    plantaGuardar(p) {
      q(`UPDATE plantas SET persona = ?, revelado = ?, revelada_en = ?, nombre = ?, especie = ?, pantalla = ?,
           brillo = ?, vinculo = ? WHERE id = ?`)
        .run(nulo(p.persona), bool(p.revelado), nulo(p.revelada_en), p.nombre || '',
          p.especie ? JSON.stringify(p.especie) : null, p.pantalla || 'toque', p.brillo ?? 80,
          JSON.stringify(p.vinculo || {}), p.id);
    },
    /** Desvincula sin borrar: la planta y sus lecturas quedan guardadas. */
    plantaDesvincular(id, t) {
      repo.transaccion(() => {
        const p = q('SELECT dispositivo FROM plantas WHERE id = ?').get(id);
        q('UPDATE plantas SET desvinculada = ? WHERE id = ? AND desvinculada IS NULL').run(t, id);
        if (p) q('UPDATE dispositivos SET planta = NULL WHERE id = ? AND planta = ?').run(p.dispositivo, id);
        q('DELETE FROM avisos WHERE planta = ?').run(id);
      });
    },
    plantasDesvinculadasDe(cuenta) {
      return q('SELECT COUNT(*) n FROM plantas WHERE cuenta = ? AND desvinculada IS NOT NULL').get(cuenta).n;
    },

    /* ----------------------------------------------------------- lecturas */
    lecturaInsertar(l) {
      q(`INSERT INTO lecturas (dispositivo, planta, t, suelo, temp, hr, lux, tsuelo, bat, crudo, usb, animo, sev)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(l.dispositivo, nulo(l.planta), l.t, nulo(l.suelo), nulo(l.temp), nulo(l.hr), nulo(l.lux),
          nulo(l.tsuelo), nulo(l.bat), nulo(l.crudo), bool(l.usb), l.animo, l.sev);
    },
    lecturasDePlanta(planta, desde) {
      return q('SELECT t, suelo, temp, hr, lux, tsuelo, animo, sev FROM lecturas WHERE planta = ? AND t >= ? ORDER BY t')
        .all(planta, desde);
    },
    contarLecturas(dispositivo) {
      return q('SELECT COUNT(*) n FROM lecturas WHERE dispositivo = ?').get(dispositivo).n;
    },

    /* ------------------------------------------------------ suscripciones */
    suscripciones(cuenta) {
      return q('SELECT endpoint, p256dh, auth FROM suscripciones WHERE cuenta = ?').all(cuenta)
        .map((s) => ({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }));
    },
    suscripcionGuardar(cuenta, s, t) {
      q(`INSERT INTO suscripciones (endpoint, cuenta, p256dh, auth, creada) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(endpoint) DO UPDATE SET cuenta = excluded.cuenta, p256dh = excluded.p256dh, auth = excluded.auth`)
        .run(s.endpoint, cuenta, s.keys.p256dh, s.keys.auth, t);
      /* Un teléfono que se registra muchas veces no acumula: quedan las 10 últimas. */
      q(`DELETE FROM suscripciones WHERE cuenta = ? AND endpoint NOT IN
           (SELECT endpoint FROM suscripciones WHERE cuenta = ? ORDER BY creada DESC LIMIT 10)`).run(cuenta, cuenta);
    },
    suscripcionBorrar(endpoint, cuenta = null) {
      if (cuenta) q('DELETE FROM suscripciones WHERE endpoint = ? AND cuenta = ?').run(endpoint, cuenta);
      else q('DELETE FROM suscripciones WHERE endpoint = ?').run(endpoint);
    },

    /* ------------------------------------------------------------- avisos */
    avisosEnviados(planta) {
      return Object.fromEntries(q('SELECT clave, t FROM avisos WHERE planta = ?').all(planta).map((a) => [a.clave, a.t]));
    },
    avisoRegistrar(planta, clave, t) {
      q('INSERT INTO avisos (planta, clave, t) VALUES (?, ?, ?) ON CONFLICT(planta, clave) DO UPDATE SET t = excluded.t')
        .run(planta, clave, t);
    },
    avisosOlvidar(planta, prefijo) {
      q('DELETE FROM avisos WHERE planta = ? AND clave LIKE ?').run(planta, `${prefijo}%`);
    },
  };
  return repo;
}
