/* respaldar.mjs — copia diaria de la base de datos, y una copia cifrada afuera.
 *
 *   node tools/respaldar.mjs [carpeta de datos] [días a conservar]
 *
 * Hace una copia consistente con `VACUUM INTO` aunque el servidor esté
 * escribiendo, junto con las claves VAPID, en <datos>/respaldos/, y borra las
 * copias más viejas que N días (14 por defecto). En el VPS lo corre el timer
 * root-lab-respaldo todos los días (deploy/instalar.sh).
 *
 * FUERA DEL SERVIDOR
 *
 * Un respaldo en el mismo disco que la base protege de un error, no de
 * perder el servidor. Con ROOTLAB_RESPALDO_CLAVE, cada copia se cifra entera
 * (server/respaldo.mjs) como rootkit-<fecha>.db.enc; con
 * ROOTLAB_RESPALDO_DESTINO además se manda afuera: un remoto de rclone
 * ("b2:rootlab-respaldos") o un destino de scp ("usuario@host:/ruta"). La
 * prueba de que sirve la hace tools/restaurar.mjs --verificar, todos los
 * meses.
 *
 * La copia local no necesita ROOTLAB_SECRETO: es la base tal cual, con los
 * emails, los nombres y el chat CIFRADOS. Para restaurarla hace falta la
 * clave maestra, y para abrir un .db.enc, además, la de respaldos: las dos
 * se guardan aparte del servidor (docs/seguridad.md).
 */
import { copyFileSync, existsSync, readdirSync, rmSync, statSync, mkdirSync, chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { cifrarRespaldo, ordenDeEnvio } from '../server/respaldo.mjs';

const DATOS = resolve(process.argv[2] || process.env.ROOTLAB_DATOS || 'data');
const DIAS = Number(process.argv[3]) || 14;
const DESTINO = join(DATOS, 'respaldos');
const fecha = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);

const archivo = join(DATOS, 'rootkit.db');
if (!existsSync(archivo)) {
  console.error(`no está ${archivo}`);
  process.exit(1);
}

mkdirSync(DESTINO, { recursive: true, mode: 0o750 });
const db = new DatabaseSync(archivo);
db.exec('PRAGMA busy_timeout = 10000');
const copia = join(DESTINO, `rootkit-${fecha}.db`);
db.prepare('VACUUM INTO ?').run(copia);
const n = (tabla) => db.prepare(`SELECT COUNT(*) n FROM ${tabla}`).get().n;
const conteo = { cuentas: n('cuentas'), plantas: n('plantas'), lecturas: n('lecturas') };
db.close();
try { chmodSync(copia, 0o640); } catch { /* Windows */ }

if (existsSync(join(DATOS, 'vapid.json'))) {
  copyFileSync(join(DATOS, 'vapid.json'), join(DESTINO, `vapid-${fecha}.json`));
}

/* La copia cifrada, y afuera. Un fallo acá no invalida el respaldo local,
   pero el proceso termina con error para que systemd (y quien mire) lo vea. */
let afuera = 'sin ROOTLAB_RESPALDO_CLAVE: sólo copia local';
let fallo = false;
const clave = process.env.ROOTLAB_RESPALDO_CLAVE || '';
if (clave) {
  try {
    const cifrada = `${copia}.enc`;
    writeFileSync(cifrada, cifrarRespaldo(readFileSync(copia), clave), { mode: 0o640 });
    afuera = `cifrada en ${cifrada}`;
    const orden = ordenDeEnvio(process.env.ROOTLAB_RESPALDO_DESTINO, cifrada);
    if (orden) {
      const r = spawnSync(orden[0], orden[1], { encoding: 'utf8', timeout: 10 * 60 * 1000 });
      if (r.error || r.status !== 0) {
        fallo = true;
        afuera += `; NO se pudo mandar a ${process.env.ROOTLAB_RESPALDO_DESTINO}: ${r.error?.message || r.stderr?.trim() || `código ${r.status}`}`;
      } else {
        afuera += ` y enviada a ${process.env.ROOTLAB_RESPALDO_DESTINO}`;
      }
    } else {
      afuera += ' (sin ROOTLAB_RESPALDO_DESTINO: no salió del servidor)';
    }
  } catch (e) {
    fallo = true;
    afuera = `no se pudo cifrar: ${e.message}`;
  }
}

const limite = Date.now() - DIAS * 24 * 3600 * 1000;
let borradas = 0;
for (const f of readdirSync(DESTINO)) {
  const ruta = join(DESTINO, f);
  if (statSync(ruta).mtimeMs < limite) {
    rmSync(ruta);
    borradas += 1;
  }
}

console.log(`respaldo ${copia}: ${conteo.cuentas} cuentas, ${conteo.plantas} plantas, ${conteo.lecturas} lecturas; ${borradas} copias viejas borradas; ${afuera}`);
process.exitCode = fallo ? 1 : 0;
