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
 *   cuentas         una persona. El email y el nombre van CIFRADOS
 *                   (cripto.mjs); para encontrar una cuenta por email se usa
 *                   un índice ciego. Contraseña con Argon2id (claves.mjs).
 *   sesiones        un teléfono con la sesión abierta (el hash del token)
 *   tokens_cuenta   enlaces de un solo uso: restablecer la contraseña y
 *                   verificar el email (el hash, nunca el token)
 *   dispositivos    cada Rooti: token, estado, código y época, última lectura
 *   plantas         el vínculo de un Rooti con una cuenta: nombre, especie,
 *                   qué Rooti es y la piel que salió del cofre (rareza),
 *                   días sanos, la mascota (felicidad, gotas de rocío), la
 *                   ficha de cuidados y el prompt del chat. Desvincular no la
 *                   borra: la marca.
 *   lecturas        TODAS las lecturas, para siempre, de la planta a la que
 *                   pertenecían cuando se midieron; `escurre` marca las que
 *                   el Rooti tomó justo después de un riego que se escurrió
 *   chat            lo que se habló con cada planta (cifrado)
 *   ia_uso          cada llamada a la IA con sus tokens y su costo: de acá
 *                   salen los límites diarios y el tope de gasto
 *   suscripciones   notificaciones push de cada cuenta
 *   avisos          cuándo se mandó cada tipo de aviso por planta
 *   clima           el último pronóstico pedido para la ciudad de cada
 *                   cuenta (server/clima.mjs), para no pedirlo a cada rato
 *   cuidadores      los enlaces de cuidador de cada planta (el hash del
 *                   token, hasta cuándo valen)
 *   riegos          riegos anotados a mano: hoy, los del cuidador
 *   fotos           el álbum de cada planta: los bytes de cada foto (JPEG,
 *                   hasta 450 KB, hasta 60 por planta), con su fecha
 *   firmware        las versiones publicadas para los aparatos: placa, canal,
 *                   SHA-256, firma y el binario (server/firmware.mjs)
 *   eventos         contadores anónimos por día (cuántos llegan a cada paso
 *                   del alta, cuánto se usa cada pantalla): sin cuenta ni
 *                   planta, sólo el nombre del evento y cuántas veces
 *   meta            versión del esquema y marcas sueltas
 *
 * Cada lectura se guarda con la PLANTA vigente al medirla. Así el historial de
 * una planta es exactamente el suyo: si el aparato cambia de dueño, el nuevo
 * dueño no ve nada del anterior, por construcción y no por un filtro.
 *
 * LA API DE ESTE ARCHIVO HABLA EN CLARO
 *
 * Quien llama pasa y recibe emails y nombres normales; cifrar y descifrar
 * pasa acá adentro, en un solo lugar. Así es imposible olvidarse de cifrar
 * en una ruta nueva.
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { crearCripto } from './cripto.mjs';
import { LEGADO } from './cofre.mjs';

export const VERSION_ESQUEMA = 7;

export const normalizarEmail = (e) => String(e || '').trim().toLowerCase();

const TABLAS_COMUNES = `
CREATE TABLE IF NOT EXISTS meta (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
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
  ultima          TEXT,
  canal           TEXT NOT NULL DEFAULT 'estable',
  ota             TEXT,
  lote            TEXT,
  origen          TEXT NOT NULL DEFAULT 'tofu',
  deshabilitado   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS dispositivos_codigo ON dispositivos(codigo);

CREATE TABLE IF NOT EXISTS lecturas (
  id          INTEGER PRIMARY KEY,
  dispositivo TEXT NOT NULL,
  planta      TEXT,
  t           INTEGER NOT NULL,
  suelo       INTEGER, temp INTEGER, hr INTEGER, lux INTEGER,
  tsuelo      INTEGER, bat INTEGER, crudo INTEGER,
  usb         INTEGER NOT NULL DEFAULT 0,
  animo       TEXT NOT NULL,
  sev         TEXT NOT NULL,
  escurre     INTEGER NOT NULL DEFAULT 0
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

const CUENTAS_V2 = `
CREATE TABLE IF NOT EXISTS cuentas (
  id               TEXT PRIMARY KEY,
  email_indice     TEXT NOT NULL UNIQUE,
  email_cifrado    TEXT NOT NULL,
  nombre_cifrado   TEXT,
  clave_hash       TEXT NOT NULL,
  tz               TEXT NOT NULL,
  coleccion        TEXT NOT NULL DEFAULT '[]',
  paleta           TEXT,
  plan             TEXT NOT NULL DEFAULT 'gratis',
  email_verificado INTEGER,
  creada           INTEGER NOT NULL,
  ubicacion        TEXT
);
`;

const PLANTAS_V2 = `
CREATE TABLE IF NOT EXISTS plantas (
  id             TEXT PRIMARY KEY,
  cuenta         TEXT NOT NULL REFERENCES cuentas(id) ON DELETE CASCADE,
  dispositivo    TEXT NOT NULL,
  epoca          INTEGER NOT NULL,
  creada         INTEGER NOT NULL,
  persona        TEXT,
  revelado       INTEGER NOT NULL DEFAULT 0,
  revelada_en    INTEGER,
  nombre         TEXT NOT NULL DEFAULT '',
  especie        TEXT,
  pantalla       TEXT NOT NULL DEFAULT 'toque',
  brillo         INTEGER NOT NULL DEFAULT 80,
  vinculo        TEXT NOT NULL,
  desvinculada   INTEGER,
  ficha          TEXT,
  prompt         TEXT,
  identificacion TEXT,
  rareza         TEXT NOT NULL DEFAULT 'comun',
  mascota        TEXT,
  calibracion    TEXT,
  maceta         TEXT,
  calibrando     INTEGER
);
CREATE INDEX IF NOT EXISTS plantas_cuenta ON plantas(cuenta);
`;

const NUEVAS_V2 = `
CREATE TABLE IF NOT EXISTS tokens_cuenta (
  token_hash  TEXT PRIMARY KEY,
  cuenta      TEXT NOT NULL REFERENCES cuentas(id) ON DELETE CASCADE,
  tipo        TEXT NOT NULL,
  creado      INTEGER NOT NULL,
  vence       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS tokens_cuenta_cuenta ON tokens_cuenta(cuenta, tipo);

CREATE TABLE IF NOT EXISTS chat (
  id         INTEGER PRIMARY KEY,
  planta     TEXT NOT NULL,
  cuenta     TEXT NOT NULL REFERENCES cuentas(id) ON DELETE CASCADE,
  t          INTEGER NOT NULL,
  rol        TEXT NOT NULL,
  contenido  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS chat_planta_t ON chat(planta, t);

CREATE TABLE IF NOT EXISTS ia_uso (
  id          INTEGER PRIMARY KEY,
  t           INTEGER NOT NULL,
  dia         TEXT NOT NULL,
  cuenta      TEXT REFERENCES cuentas(id) ON DELETE SET NULL,
  planta      TEXT,
  tipo        TEXT NOT NULL,
  fuente      TEXT NOT NULL,
  modelo      TEXT,
  tokens_in   INTEGER NOT NULL DEFAULT 0,
  tokens_out  INTEGER NOT NULL DEFAULT 0,
  costo_micro INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ia_uso_t ON ia_uso(t);
CREATE INDEX IF NOT EXISTS ia_uso_cuenta ON ia_uso(cuenta, tipo, dia);
CREATE INDEX IF NOT EXISTS ia_uso_planta ON ia_uso(planta, tipo, dia);
`;

const NUEVAS_V4 = `
CREATE TABLE IF NOT EXISTS clima (
  cuenta    TEXT PRIMARY KEY REFERENCES cuentas(id) ON DELETE CASCADE,
  obtenido  INTEGER NOT NULL,
  datos     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cuidadores (
  token_hash  TEXT PRIMARY KEY,
  planta      TEXT NOT NULL,
  cuenta      TEXT NOT NULL REFERENCES cuentas(id) ON DELETE CASCADE,
  nombre      TEXT NOT NULL DEFAULT '',
  creado      INTEGER NOT NULL,
  vence       INTEGER NOT NULL,
  usos        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS cuidadores_planta ON cuidadores(planta);

CREATE TABLE IF NOT EXISTS riegos (
  id      INTEGER PRIMARY KEY,
  planta  TEXT NOT NULL,
  t       INTEGER NOT NULL,
  origen  TEXT NOT NULL,
  quien   TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS riegos_planta_t ON riegos(planta, t);
`;

const NUEVAS_V5 = `
CREATE TABLE IF NOT EXISTS fotos (
  id      INTEGER PRIMARY KEY,
  planta  TEXT NOT NULL,
  cuenta  TEXT NOT NULL REFERENCES cuentas(id) ON DELETE CASCADE,
  t       INTEGER NOT NULL,
  mime    TEXT NOT NULL,
  bytes   BLOB NOT NULL,
  ancho   INTEGER,
  alto    INTEGER,
  nota    TEXT NOT NULL DEFAULT '',
  origen  TEXT NOT NULL DEFAULT 'album'
);
CREATE INDEX IF NOT EXISTS fotos_planta_t ON fotos(planta, t);
`;

const NUEVAS_V7 = `
CREATE TABLE IF NOT EXISTS firmware (
  id         INTEGER PRIMARY KEY,
  version    TEXT NOT NULL,
  placa      TEXT NOT NULL,
  canal      TEXT NOT NULL,
  sha256     TEXT NOT NULL,
  firma      TEXT NOT NULL,
  tamano     INTEGER NOT NULL,
  notas      TEXT NOT NULL DEFAULT '',
  publicado  INTEGER NOT NULL,
  retirado   INTEGER,
  contenido  BLOB NOT NULL
);
CREATE INDEX IF NOT EXISTS firmware_placa_canal ON firmware(placa, canal, publicado);

CREATE TABLE IF NOT EXISTS eventos (
  dia     TEXT NOT NULL,
  evento  TEXT NOT NULL,
  n       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (dia, evento)
);
`;

const json = (s, def = null) => {
  if (s === null || s === undefined) return def;
  try { return JSON.parse(s); } catch { return def; }
};
const nulo = (v) => (v === undefined ? null : v);
const bool = (v) => (v ? 1 : 0);

function filaDispositivo(f) {
  return f ? {
    ...f, usb: Boolean(f.usb), ultima: json(f.ultima), ota: json(f.ota),
    canal: f.canal || 'estable', origen: f.origen || 'tofu', deshabilitado: Boolean(f.deshabilitado),
  } : null;
}

function filaPlanta(f) {
  return f ? {
    ...f,
    revelado: Boolean(f.revelado),
    especie: json(f.especie),
    vinculo: json(f.vinculo, {}),
    ficha: json(f.ficha),
    identificacion: json(f.identificacion),
    rareza: f.rareza || 'comun',
    mascota: json(f.mascota),
    calibracion: json(f.calibracion),
    maceta: json(f.maceta),
    calibrando: f.calibrando || null,
  } : null;
}

/**
 * Abre (o crea) la base. `cripto` cifra emails, nombres y chat; en memoria,
 * si no se pasa, se usa una clave al azar (tests).
 */
export function abrirBase(archivo = ':memory:', { cripto = null } = {}) {
  if (!cripto) {
    if (archivo !== ':memory:') throw new Error('abrirBase necesita cripto para una base en disco');
    cripto = crearCripto(randomBytes(32));
  }
  if (archivo !== ':memory:') mkdirSync(dirname(archivo), { recursive: true });
  const db = new DatabaseSync(archivo);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;');
  migrar(db, cripto);

  const cache = new Map();
  const q = (sql) => {
    let st = cache.get(sql);
    if (!st) {
      st = db.prepare(sql);
      cache.set(sql, st);
    }
    return st;
  };

  const filaCuenta = (f) => (f ? {
    id: f.id,
    email: cripto.descifrar(f.email_cifrado),
    nombre: f.nombre_cifrado ? cripto.descifrar(f.nombre_cifrado) : '',
    clave_hash: f.clave_hash,
    tz: f.tz,
    coleccion: json(f.coleccion, []),
    paleta: f.paleta,
    plan: f.plan,
    email_verificado: f.email_verificado,
    creada: f.creada,
    /* La ciudad para el pronóstico (server/clima.mjs), cifrada como el resto
       de lo personal: { nombre, pais, region, lat, lon }. */
    ubicacion: f.ubicacion ? json(cripto.descifrar(f.ubicacion)) : null,
  } : null);

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

    version() { return Number(q("SELECT valor FROM meta WHERE clave = 'esquema'").get()?.valor || 0); },

    contar() {
      return {
        cuentas: q('SELECT COUNT(*) n FROM cuentas').get().n,
        dispositivos: q('SELECT COUNT(*) n FROM dispositivos').get().n,
        plantas: q('SELECT COUNT(*) n FROM plantas WHERE desvinculada IS NULL').get().n,
        lecturas: q('SELECT COUNT(*) n FROM lecturas').get().n,
      };
    },

    metaLeer(clave) { return q('SELECT valor FROM meta WHERE clave = ?').get(clave)?.valor ?? null; },
    metaEscribir(clave, valor) {
      q('INSERT INTO meta (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor')
        .run(clave, String(valor));
    },

    /* ------------------------------------------------------------ cuentas */
    cuentaCrear(c) {
      const email = normalizarEmail(c.email);
      q(`INSERT INTO cuentas (id, email_indice, email_cifrado, nombre_cifrado, clave_hash, tz, coleccion, paleta, plan,
           email_verificado, creada)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(c.id, cripto.indice(email), cripto.cifrar(email), c.nombre ? cripto.cifrar(c.nombre) : null,
          c.clave_hash, c.tz, JSON.stringify(c.coleccion || []), nulo(c.paleta), c.plan || 'gratis',
          nulo(c.email_verificado), c.creada);
    },
    cuenta(id) { return filaCuenta(q('SELECT * FROM cuentas WHERE id = ?').get(id)); },
    cuentaPorEmail(email) {
      return filaCuenta(q('SELECT * FROM cuentas WHERE email_indice = ?').get(cripto.indice(normalizarEmail(email))));
    },
    cuentaActualizar(id, c) {
      const a = repo.cuenta(id);
      if (!a) return;
      const nombre = c.nombre ?? a.nombre;
      const ubicacion = c.ubicacion !== undefined ? c.ubicacion : a.ubicacion;
      q(`UPDATE cuentas SET nombre_cifrado = ?, tz = ?, clave_hash = ?, coleccion = ?, paleta = ?, plan = ?,
           email_verificado = ?, ubicacion = ? WHERE id = ?`)
        .run(nombre ? cripto.cifrar(nombre) : null, c.tz ?? a.tz, c.clave_hash ?? a.clave_hash,
          JSON.stringify(c.coleccion ?? a.coleccion), c.paleta !== undefined ? c.paleta : a.paleta,
          c.plan ?? a.plan, c.email_verificado !== undefined ? c.email_verificado : a.email_verificado,
          ubicacion ? cripto.cifrar(JSON.stringify(ubicacion)) : null, id);
    },
    /** Las cuentas que dijeron dónde están sus plantas (para el pronóstico). */
    cuentasConUbicacion() {
      return q('SELECT * FROM cuentas WHERE ubicacion IS NOT NULL').all().map(filaCuenta);
    },
    /** Borra la cuenta y todo lo suyo: plantas, lecturas, chat, sesiones, avisos. */
    cuentaBorrar(id) {
      repo.transaccion(() => {
        const plantas = q('SELECT id, dispositivo FROM plantas WHERE cuenta = ?').all(id);
        for (const p of plantas) {
          q('UPDATE dispositivos SET planta = NULL WHERE id = ? AND planta = ?').run(p.dispositivo, p.id);
          q('DELETE FROM lecturas WHERE planta = ?').run(p.id);
          q('DELETE FROM avisos WHERE planta = ?').run(p.id);
          q('DELETE FROM riegos WHERE planta = ?').run(p.id);
        }
        /* cascada: sesiones, tokens, plantas, chat, suscripciones, clima,
           cuidadores; el uso de IA queda sin dueño, para que las cuentas del
           gasto cierren. */
        q('DELETE FROM cuentas WHERE id = ?').run(id);
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
    sesionesBorrarTodas(cuenta) { q('DELETE FROM sesiones WHERE cuenta = ?').run(cuenta); },
    sesionesDe(cuenta) { return q('SELECT COUNT(*) n FROM sesiones WHERE cuenta = ?').get(cuenta).n; },

    /* ------------------------------------------------------ tokens de cuenta */
    /** Un enlace nuevo invalida los anteriores del mismo tipo. */
    tokenCuentaCrear(tokenHash, cuenta, tipo, t, vence) {
      repo.transaccion(() => {
        q('DELETE FROM tokens_cuenta WHERE cuenta = ? AND tipo = ?').run(cuenta, tipo);
        q('INSERT INTO tokens_cuenta (token_hash, cuenta, tipo, creado, vence) VALUES (?, ?, ?, ?, ?)')
          .run(tokenHash, cuenta, tipo, t, vence);
      });
    },
    /** Consume el token: devuelve la cuenta si era válido, y deja de valer. */
    tokenCuentaUsar(tokenHash, tipo, t) {
      return repo.transaccion(() => {
        const f = q('SELECT * FROM tokens_cuenta WHERE token_hash = ? AND tipo = ?').get(tokenHash, tipo);
        if (!f) return null;
        q('DELETE FROM tokens_cuenta WHERE token_hash = ?').run(tokenHash);
        return f.vence >= t ? f.cuenta : null;
      });
    },
    tokenCuentaVigente(tokenHash, tipo, t) {
      const f = q('SELECT vence FROM tokens_cuenta WHERE token_hash = ? AND tipo = ?').get(tokenHash, tipo);
      return Boolean(f && f.vence >= t);
    },
    tokensCuentaBorrar(cuenta, tipo) { q('DELETE FROM tokens_cuenta WHERE cuenta = ? AND tipo = ?').run(cuenta, tipo); },

    /* ------------------------------------------------------- dispositivos */
    dispositivo(id) { return filaDispositivo(q('SELECT * FROM dispositivos WHERE id = ?').get(id)); },
    /** El aparato dueño de este token (para bajar su firmware). */
    dispositivoPorToken(tokenHash) { return filaDispositivo(q('SELECT * FROM dispositivos WHERE token_hash = ?').get(tokenHash)); },
    /** El aparato que muestra hoy este código (el de su época actual). */
    dispositivoPorCodigo(codigo) {
      return filaDispositivo(q('SELECT * FROM dispositivos WHERE codigo = ? AND codigo_epoca = epoca').get(codigo));
    },
    dispositivoGuardar(d) {
      q(`INSERT INTO dispositivos (id, token_hash, creado, visto, fw, placa, pantalla, estado, epoca, rssi, usb,
           bat_mv, persona_fabrica, codigo, codigo_epoca, ultimo_reloj, arranques, planta, animo, sev, ultima,
           canal, ota, lote, origen, deshabilitado)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           token_hash = excluded.token_hash, visto = excluded.visto, fw = excluded.fw, placa = excluded.placa,
           pantalla = excluded.pantalla, estado = excluded.estado, epoca = excluded.epoca, rssi = excluded.rssi,
           usb = excluded.usb, bat_mv = excluded.bat_mv, persona_fabrica = excluded.persona_fabrica,
           codigo = excluded.codigo, codigo_epoca = excluded.codigo_epoca, ultimo_reloj = excluded.ultimo_reloj,
           arranques = excluded.arranques, planta = excluded.planta, animo = excluded.animo, sev = excluded.sev,
           ultima = excluded.ultima, canal = excluded.canal, ota = excluded.ota, lote = excluded.lote,
           origen = excluded.origen, deshabilitado = excluded.deshabilitado`)
        .run(d.id, d.token_hash, d.creado, nulo(d.visto), nulo(d.fw), nulo(d.placa), nulo(d.pantalla),
          nulo(d.estado), d.epoca ?? 0, nulo(d.rssi), bool(d.usb), d.bat_mv ?? 0, nulo(d.persona_fabrica),
          nulo(d.codigo), nulo(d.codigo_epoca), d.ultimo_reloj ?? -1, d.arranques ?? 0, nulo(d.planta),
          nulo(d.animo), nulo(d.sev), d.ultima ? JSON.stringify(d.ultima) : null,
          d.canal || 'estable', d.ota ? JSON.stringify(d.ota) : null, nulo(d.lote), d.origen || 'tofu',
          bool(d.deshabilitado));
    },
    /** Todos los aparatos, para la administración (sin el hash del token). */
    dispositivos() {
      return q(`SELECT id, creado, visto, fw, placa, pantalla, estado, persona_fabrica, planta, canal, ota, lote, origen,
                  deshabilitado, bat_mv, usb, rssi FROM dispositivos ORDER BY creado DESC`).all().map(filaDispositivo);
    },
    /** Los emuladores que nadie usa hace rato (no son de nadie y nadie los vio). */
    dispositivosBorrarOciosos(origen, antesDe) {
      return Number(q('DELETE FROM dispositivos WHERE origen = ? AND planta IS NULL AND COALESCE(visto, creado) < ?')
        .run(origen, antesDe).changes);
    },

    /* ------------------------------------------------------------ plantas */
    plantaCrear(p) {
      q(`INSERT INTO plantas (id, cuenta, dispositivo, epoca, creada, persona, revelado, nombre, especie,
           pantalla, brillo, vinculo, rareza, mascota)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(p.id, p.cuenta, p.dispositivo, p.epoca, p.creada, nulo(p.persona), bool(p.revelado),
          p.nombre || '', p.especie ? JSON.stringify(p.especie) : null, p.pantalla || 'toque',
          p.brillo ?? 80, JSON.stringify(p.vinculo || {}), p.rareza || 'comun',
          p.mascota ? JSON.stringify(p.mascota) : null);
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
           brillo = ?, vinculo = ?, ficha = ?, prompt = ?, identificacion = ?, rareza = ?, mascota = ?,
           calibracion = ?, maceta = ?, calibrando = ? WHERE id = ?`)
        .run(nulo(p.persona), bool(p.revelado), nulo(p.revelada_en), p.nombre || '',
          p.especie ? JSON.stringify(p.especie) : null, p.pantalla || 'toque', p.brillo ?? 80,
          JSON.stringify(p.vinculo || {}), p.ficha ? JSON.stringify(p.ficha) : null, nulo(p.prompt),
          p.identificacion ? JSON.stringify(p.identificacion) : null, p.rareza || 'comun',
          p.mascota ? JSON.stringify(p.mascota) : null, p.calibracion ? JSON.stringify(p.calibracion) : null,
          p.maceta ? JSON.stringify(p.maceta) : null, nulo(p.calibrando), p.id);
    },
    /** Desvincula sin borrar: la planta y sus lecturas quedan guardadas. */
    plantaDesvincular(id, t) {
      repo.transaccion(() => {
        const p = q('SELECT dispositivo FROM plantas WHERE id = ?').get(id);
        q('UPDATE plantas SET desvinculada = ? WHERE id = ? AND desvinculada IS NULL').run(t, id);
        if (p) q('UPDATE dispositivos SET planta = NULL WHERE id = ? AND planta = ?').run(p.dispositivo, id);
        q('DELETE FROM avisos WHERE planta = ?').run(id);
        q('DELETE FROM cuidadores WHERE planta = ?').run(id);
      });
    },
    plantasDesvinculadasDe(cuenta) {
      return q('SELECT COUNT(*) n FROM plantas WHERE cuenta = ? AND desvinculada IS NOT NULL').get(cuenta).n;
    },

    /* ----------------------------------------------------------- lecturas */
    lecturaInsertar(l) {
      q(`INSERT INTO lecturas (dispositivo, planta, t, suelo, temp, hr, lux, tsuelo, bat, crudo, usb, animo, sev, escurre)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(l.dispositivo, nulo(l.planta), l.t, nulo(l.suelo), nulo(l.temp), nulo(l.hr), nulo(l.lux),
          nulo(l.tsuelo), nulo(l.bat), nulo(l.crudo), bool(l.usb), l.animo, l.sev, bool(l.escurre));
    },
    lecturasDePlanta(planta, desde) {
      return q('SELECT t, suelo, temp, hr, lux, tsuelo, animo, sev, escurre FROM lecturas WHERE planta = ? AND t >= ? ORDER BY t')
        .all(planta, desde).map((l) => ({ ...l, escurre: Boolean(l.escurre) }));
    },
    contarLecturas(dispositivo) {
      return q('SELECT COUNT(*) n FROM lecturas WHERE dispositivo = ?').get(dispositivo).n;
    },

    /* --------------------------------------------------------------- chat */
    chatAgregar({ planta, cuenta, t, rol, texto }) {
      q('INSERT INTO chat (planta, cuenta, t, rol, contenido) VALUES (?, ?, ?, ?, ?)')
        .run(planta, cuenta, t, rol, cripto.cifrar(texto));
    },
    /** Los últimos `limite` mensajes de la planta, del más viejo al más nuevo. */
    chatDe(planta, limite = 50) {
      return q('SELECT t, rol, contenido FROM chat WHERE planta = ? ORDER BY t DESC, id DESC LIMIT ?')
        .all(planta, limite).reverse()
        .map((m) => ({ t: m.t, rol: m.rol, texto: cripto.descifrar(m.contenido) }));
    },

    /* ------------------------------------------------------------- ia_uso */
    iaUsoRegistrar(u) {
      q(`INSERT INTO ia_uso (t, dia, cuenta, planta, tipo, fuente, modelo, tokens_in, tokens_out, costo_micro)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(u.t, u.dia, nulo(u.cuenta), nulo(u.planta), u.tipo, u.fuente, nulo(u.modelo),
          u.tokens_in || 0, u.tokens_out || 0, Math.round(u.costo_micro || 0));
    },
    /** Micro-dólares gastados desde `t` (sólo llamadas reales). */
    iaGastoDesde(t) {
      return q('SELECT COALESCE(SUM(costo_micro), 0) n FROM ia_uso WHERE t >= ?').get(t).n;
    },
    iaUsosCuenta(cuenta, tipo, dia) {
      return q('SELECT COUNT(*) n FROM ia_uso WHERE cuenta = ? AND tipo = ? AND dia = ?').get(cuenta, tipo, dia).n;
    },
    iaUsosPlanta(planta, tipo, dia) {
      return q('SELECT COUNT(*) n FROM ia_uso WHERE planta = ? AND tipo = ? AND dia = ?').get(planta, tipo, dia).n;
    },
    /** Resumen para tools/uso-ia.mjs. */
    iaResumen(desde) {
      return {
        total: q(`SELECT COUNT(*) llamadas, COALESCE(SUM(costo_micro), 0) costo_micro,
                  COALESCE(SUM(tokens_in), 0) tokens_in, COALESCE(SUM(tokens_out), 0) tokens_out
                  FROM ia_uso WHERE t >= ?`).get(desde),
        porTipo: q(`SELECT tipo, fuente, COUNT(*) llamadas, COALESCE(SUM(costo_micro), 0) costo_micro
                    FROM ia_uso WHERE t >= ? GROUP BY tipo, fuente ORDER BY costo_micro DESC`).all(desde),
        porDia: q(`SELECT dia, COUNT(*) llamadas, COALESCE(SUM(costo_micro), 0) costo_micro
                   FROM ia_uso WHERE t >= ? GROUP BY dia ORDER BY dia`).all(desde),
        cuentas: q(`SELECT cuenta, COUNT(*) llamadas, COALESCE(SUM(costo_micro), 0) costo_micro
                    FROM ia_uso WHERE t >= ? GROUP BY cuenta ORDER BY costo_micro DESC LIMIT 10`).all(desde),
      };
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

    /* -------------------------------------------------------------- clima */
    climaLeer(cuenta) {
      const f = q('SELECT obtenido, datos FROM clima WHERE cuenta = ?').get(cuenta);
      return f ? { obtenido: f.obtenido, datos: json(f.datos) } : null;
    },
    climaGuardar(cuenta, obtenido, datos) {
      q(`INSERT INTO clima (cuenta, obtenido, datos) VALUES (?, ?, ?)
         ON CONFLICT(cuenta) DO UPDATE SET obtenido = excluded.obtenido, datos = excluded.datos`)
        .run(cuenta, obtenido, JSON.stringify(datos));
    },
    climaBorrar(cuenta) { q('DELETE FROM clima WHERE cuenta = ?').run(cuenta); },

    /* --------------------------------------------------------- cuidadores */
    cuidadorCrear(c) {
      q('INSERT INTO cuidadores (token_hash, planta, cuenta, nombre, creado, vence) VALUES (?, ?, ?, ?, ?, ?)')
        .run(c.token_hash, c.planta, c.cuenta, c.nombre || '', c.creado, c.vence);
    },
    /** Un enlace vigente, o null. */
    cuidadorPorHash(tokenHash, t) {
      return q('SELECT * FROM cuidadores WHERE token_hash = ? AND vence > ?').get(tokenHash, t) || null;
    },
    cuidadoresDe(planta, t) {
      return q('SELECT * FROM cuidadores WHERE planta = ? AND vence > ? ORDER BY creado').all(planta, t);
    },
    cuidadoresBorrar(planta) { q('DELETE FROM cuidadores WHERE planta = ?').run(planta); },
    cuidadorUso(tokenHash) { q('UPDATE cuidadores SET usos = usos + 1 WHERE token_hash = ?').run(tokenHash); },

    /* ------------------------------------------------------------- riegos */
    riegoRegistrar(r) {
      q('INSERT INTO riegos (planta, t, origen, quien) VALUES (?, ?, ?, ?)').run(r.planta, r.t, r.origen, r.quien || '');
    },
    ultimoRiego(planta) {
      return q('SELECT t, origen, quien FROM riegos WHERE planta = ? ORDER BY t DESC LIMIT 1').get(planta) || null;
    },
    riegosDe(planta, desde) {
      return q('SELECT t, origen, quien FROM riegos WHERE planta = ? AND t >= ? ORDER BY t DESC LIMIT 20').all(planta, desde);
    },

    /* ----------------------------------------------------------- firmware */
    firmwarePublicar(f) {
      const r = q(`INSERT INTO firmware (version, placa, canal, sha256, firma, tamano, notas, publicado, contenido)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(f.version, f.placa, f.canal, f.sha256, f.firma, f.tamano, f.notas || '', f.publicado, f.contenido);
      return Number(r.lastInsertRowid);
    },
    /** Lo publicado, sin los binarios, de lo más nuevo a lo más viejo. */
    firmwareLista() {
      return q('SELECT id, version, placa, canal, sha256, firma, tamano, notas, publicado, retirado FROM firmware ORDER BY publicado DESC, id DESC').all();
    },
    firmwareContenido(id) { return q('SELECT contenido FROM firmware WHERE id = ? AND retirado IS NULL').get(id)?.contenido || null; },
    firmwareRetirar(id, t) { return Number(q('UPDATE firmware SET retirado = ? WHERE id = ? AND retirado IS NULL').run(t, id).changes); },

    /* ------------------------------------------------------------ eventos */
    eventoContar(dia, evento, n = 1) {
      q('INSERT INTO eventos (dia, evento, n) VALUES (?, ?, ?) ON CONFLICT(dia, evento) DO UPDATE SET n = n + excluded.n').run(dia, evento, n);
    },
    eventosDesde(dia) { return q('SELECT dia, evento, n FROM eventos WHERE dia >= ? ORDER BY dia, evento').all(dia); },

    /* -------------------------------------------------------------- fotos */
    fotoGuardar(f) {
      const r = q(`INSERT INTO fotos (planta, cuenta, t, mime, bytes, ancho, alto, nota, origen) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(f.planta, f.cuenta, f.t, f.mime, f.bytes, nulo(f.ancho), nulo(f.alto), f.nota || '', f.origen || 'album');
      return Number(r.lastInsertRowid);
    },
    /** Las fotos de una planta, sin los bytes, de la más nueva a la más vieja. */
    fotosDe(planta) {
      return q('SELECT id, t, mime, ancho, alto, nota, origen, length(bytes) AS peso FROM fotos WHERE planta = ? ORDER BY t DESC, id DESC').all(planta);
    },
    foto(id, planta) { return q('SELECT * FROM fotos WHERE id = ? AND planta = ?').get(id, planta) || null; },
    fotoBorrar(id, planta) { q('DELETE FROM fotos WHERE id = ? AND planta = ?').run(id, planta); },
    contarFotos(planta) { return q('SELECT COUNT(*) n FROM fotos WHERE planta = ?').get(planta).n; },
  };
  return repo;
}

/* ------------------------------------------------------------ migraciones */
function versionDe(db) {
  const hayMeta = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'meta'").get();
  if (!hayMeta) return 0;
  return Number(db.prepare("SELECT valor FROM meta WHERE clave = 'esquema'").get()?.valor || 0);
}

function migrar(db, cripto) {
  const hayCuentas = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'cuentas'").get();
  if (!hayCuentas) {
    /* Base nueva: el esquema actual de una. */
    db.exec(`BEGIN; ${CUENTAS_V2} ${TABLAS_COMUNES} ${PLANTAS_V2} ${NUEVAS_V2} ${NUEVAS_V4} ${NUEVAS_V5} ${NUEVAS_V7} COMMIT;`);
    db.prepare("INSERT OR REPLACE INTO meta (clave, valor) VALUES ('esquema', ?)").run(String(VERSION_ESQUEMA));
    return;
  }
  const v = versionDe(db);
  if (v > VERSION_ESQUEMA) throw new Error(`la base es de una versión más nueva (${v}) que este servidor (${VERSION_ESQUEMA})`);
  if (v < 2) migrarV1aV2(db, cripto);
  /* Idempotente: una base vieja o incompleta recibe las tablas que le falten. */
  db.exec(`${TABLAS_COMUNES} ${NUEVAS_V2} ${NUEVAS_V4} ${NUEVAS_V5} ${NUEVAS_V7}`);
  if (v < 3) migrarV2aV3(db);
  if (v < 4) migrarV3aV4(db);
  if (v < 5) db.prepare("INSERT OR REPLACE INTO meta (clave, valor) VALUES ('esquema', '5')").run();   /* v5: la tabla fotos, creada arriba */
  if (v < 6) migrarV5aV6(db);
  if (v < 7) migrarV6aV7(db);
}

/* v6 -> v7: actualizaciones por aire, fábrica, calibración y métricas.
 *
 * Los aparatos ganan canal (estable/beta), el estado de su última
 * actualización, el lote y el origen (fabrica, tofu o emulador) y se pueden
 * deshabilitar. Las plantas, la calibración del sensor de tierra, la maceta
 * y la ventana de calibración. Las tablas nuevas (firmware, eventos) ya se
 * crearon arriba. Los aparatos que se presentaron como "emulador" quedan
 * marcados como tales. */
function migrarV6aV7(db) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const columnas = (tabla) => db.prepare(`PRAGMA table_info(${tabla})`).all().map((c) => c.name);
    const dis = columnas('dispositivos');
    if (!dis.includes('canal')) db.exec("ALTER TABLE dispositivos ADD COLUMN canal TEXT NOT NULL DEFAULT 'estable'");
    if (!dis.includes('ota')) db.exec('ALTER TABLE dispositivos ADD COLUMN ota TEXT');
    if (!dis.includes('lote')) db.exec('ALTER TABLE dispositivos ADD COLUMN lote TEXT');
    if (!dis.includes('origen')) db.exec("ALTER TABLE dispositivos ADD COLUMN origen TEXT NOT NULL DEFAULT 'tofu'");
    if (!dis.includes('deshabilitado')) db.exec('ALTER TABLE dispositivos ADD COLUMN deshabilitado INTEGER NOT NULL DEFAULT 0');
    const pla = columnas('plantas');
    if (!pla.includes('calibracion')) db.exec('ALTER TABLE plantas ADD COLUMN calibracion TEXT');
    if (!pla.includes('maceta')) db.exec('ALTER TABLE plantas ADD COLUMN maceta TEXT');
    if (!pla.includes('calibrando')) db.exec('ALTER TABLE plantas ADD COLUMN calibrando INTEGER');
    db.prepare("UPDATE dispositivos SET origen = 'emulador' WHERE placa = 'emulador'").run();
    db.prepare("INSERT OR REPLACE INTO meta (clave, valor) VALUES ('esquema', '7')").run();
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

/* v5 -> v6: los cinco Rooties botánicos y la piel del cofre.
 *
 * Cada planta guarda la rareza que salió del cofre y el estado de su
 * mascota. Los Rooties de la primera tanda pasan al más parecido de los
 * nuevos (server/cofre.mjs, LEGADO) en las plantas, los aparatos y las
 * colecciones, que ahora son de pieles ("brote-epico") y no de Rooties. Las
 * paletas de Chico Malo y Chica Chill pasan a la piel común de su Rooti. */
function migrarV5aV6(db) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const cols = db.prepare('PRAGMA table_info(plantas)').all().map((c) => c.name);
    if (!cols.includes('rareza')) db.exec("ALTER TABLE plantas ADD COLUMN rareza TEXT NOT NULL DEFAULT 'comun'");
    if (!cols.includes('mascota')) db.exec('ALTER TABLE plantas ADD COLUMN mascota TEXT');
    for (const [viejo, nuevo] of Object.entries(LEGADO)) {
      db.prepare('UPDATE plantas SET persona = ?, rareza = ? WHERE persona = ?').run(nuevo.persona, nuevo.rareza, viejo);
      db.prepare('UPDATE dispositivos SET persona_fabrica = ? WHERE persona_fabrica = ?').run(nuevo.persona, viejo);
    }
    const PALETA = { 'chico-malo': 'pinchito-comun', 'chica-chill': 'musgo-comun' };
    const actualizar = db.prepare('UPDATE cuentas SET coleccion = ?, paleta = ? WHERE id = ?');
    for (const c of db.prepare('SELECT id, coleccion, paleta FROM cuentas').all()) {
      let lista = [];
      try { lista = JSON.parse(c.coleccion || '[]'); } catch { lista = []; }
      const pieles = [...new Set(lista.map((id) => (LEGADO[id] ? `${LEGADO[id].persona}-${LEGADO[id].rareza}` : id))
        .filter((id) => /^[a-z]+-(comun|raro|epico)$/.test(id)))];
      actualizar.run(JSON.stringify(pieles), PALETA[c.paleta] || c.paleta, c.id);
    }
    db.prepare("INSERT OR REPLACE INTO meta (clave, valor) VALUES ('esquema', '6')").run();
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

/* v3 -> v4: la ciudad de cada cuenta (para el pronóstico), y las tablas de
 * clima, cuidadores y riegos (ya creadas arriba, son IF NOT EXISTS). */
function migrarV3aV4(db) {
  const columnas = db.prepare('PRAGMA table_info(cuentas)').all().map((c) => c.name);
  if (!columnas.includes('ubicacion')) db.exec('ALTER TABLE cuentas ADD COLUMN ubicacion TEXT');
  db.prepare("INSERT OR REPLACE INTO meta (clave, valor) VALUES ('esquema', '4')").run();
}

/* v2 -> v3: cada lectura sabe si vino de un riego que se escurrió. */
function migrarV2aV3(db) {
  const columnas = db.prepare('PRAGMA table_info(lecturas)').all().map((c) => c.name);
  if (!columnas.includes('escurre')) db.exec('ALTER TABLE lecturas ADD COLUMN escurre INTEGER NOT NULL DEFAULT 0');
  db.prepare("INSERT OR REPLACE INTO meta (clave, valor) VALUES ('esquema', '3')").run();
}

/**
 * v1 -> v2: el email y el nombre pasan a guardarse cifrados, con índice
 * ciego; se agregan plan, paleta y verificación del email, la ficha y el
 * prompt de cada planta, y las tablas de tokens, chat y uso de IA.
 *
 * SQLite no cambia restricciones de una columna existente, así que la tabla
 * de cuentas se reconstruye (la receta de 12 pasos de sqlite.org): claves
 * foráneas apagadas, tabla nueva, copia, reemplazo, verificación.
 */
function migrarV1aV2(db, cripto) {
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(CUENTAS_V2.replace('IF NOT EXISTS cuentas', 'cuentas_v2'));
    const insertar = db.prepare(`INSERT INTO cuentas_v2 (id, email_indice, email_cifrado, nombre_cifrado, clave_hash, tz,
      coleccion, plan, creada) VALUES (?, ?, ?, ?, ?, ?, ?, 'gratis', ?)`);
    for (const c of db.prepare('SELECT * FROM cuentas').all()) {
      const email = normalizarEmail(c.email);
      insertar.run(c.id, cripto.indice(email), cripto.cifrar(email), c.nombre ? cripto.cifrar(c.nombre) : null,
        c.clave_hash, c.tz, c.coleccion || '[]', c.creada);
    }
    db.exec('DROP TABLE cuentas');
    db.exec('ALTER TABLE cuentas_v2 RENAME TO cuentas');
    const columnas = db.prepare('PRAGMA table_info(plantas)').all().map((c) => c.name);
    for (const col of ['ficha', 'prompt', 'identificacion']) {
      if (!columnas.includes(col)) db.exec(`ALTER TABLE plantas ADD COLUMN ${col} TEXT`);
    }
    db.exec(NUEVAS_V2);
    db.prepare("INSERT OR REPLACE INTO meta (clave, valor) VALUES ('esquema', '2')").run();
    const rotas = db.prepare('PRAGMA foreign_key_check').all();
    if (rotas.length) throw new Error(`la migración dejó ${rotas.length} referencias rotas`);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
}
