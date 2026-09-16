/* respaldar.mjs — copia diaria de la base de datos.
 *
 *   node tools/respaldar.mjs [carpeta de datos] [días a conservar]
 *
 * Hace una copia consistente con `VACUUM INTO` aunque el servidor esté
 * escribiendo, junto con las claves VAPID, en <datos>/respaldos/, y borra las
 * copias más viejas que N días (14 por defecto). En el VPS lo corre el timer
 * root-lab-respaldo todos los días (deploy/instalar.sh).
 *
 * No necesita ROOTLAB_SECRETO: copia la base tal cual, con los emails, los
 * nombres y el chat CIFRADOS. Por eso un respaldo solo no expone a nadie, y
 * por eso mismo para restaurarlo hace falta la clave maestra (guardala aparte,
 * ver docs/seguridad.md).
 */
import { copyFileSync, existsSync, readdirSync, rmSync, statSync, mkdirSync, chmodSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

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

const limite = Date.now() - DIAS * 24 * 3600 * 1000;
let borradas = 0;
for (const f of readdirSync(DESTINO)) {
  const ruta = join(DESTINO, f);
  if (statSync(ruta).mtimeMs < limite) {
    rmSync(ruta);
    borradas += 1;
  }
}

console.log(`respaldo ${copia}: ${conteo.cuentas} cuentas, ${conteo.plantas} plantas, ${conteo.lecturas} lecturas; ${borradas} copias viejas borradas`);
