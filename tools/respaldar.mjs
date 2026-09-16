/* respaldar.mjs — copia diaria de la base de datos.
 *
 *   node tools/respaldar.mjs [carpeta de datos] [días a conservar]
 *
 * Hace una copia consistente con `VACUUM INTO` aunque el servidor esté
 * escribiendo, junto con las claves VAPID, en <datos>/respaldos/, y borra las
 * copias más viejas que N días (14 por defecto). En el VPS lo corre el timer
 * root-lab-respaldo todos los días (deploy/instalar.sh).
 *
 * Para sacar las copias del servidor, ver docs/despliegue.md.
 */
import { copyFileSync, existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { abrirBase } from '../server/db.mjs';

const DATOS = resolve(process.argv[2] || process.env.ROOTLAB_DATOS || 'data');
const DIAS = Number(process.argv[3]) || 14;
const DESTINO = join(DATOS, 'respaldos');
const fecha = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);

const archivo = join(DATOS, 'rootkit.db');
if (!existsSync(archivo)) {
  console.error(`no está ${archivo}`);
  process.exit(1);
}

const db = abrirBase(archivo);
const copia = join(DESTINO, `rootkit-${fecha}.db`);
db.respaldar(copia);
const conteo = db.contar();
db.cerrar();

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
