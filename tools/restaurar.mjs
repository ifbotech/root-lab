/* restaurar.mjs — probar que un respaldo sirve, y restaurarlo.
 *
 *   node tools/restaurar.mjs --verificar [archivo] [--datos carpeta] [--avisar]
 *       Toma el respaldo más nuevo de <datos>/respaldos (o el que se le pase),
 *       lo descifra si es .db.enc (ROOTLAB_RESPALDO_CLAVE), lo abre en una
 *       carpeta temporal, corre `PRAGMA integrity_check`, cuenta lo que tiene
 *       y borra la copia temporal. Con --avisar manda el resultado por email a
 *       ROOTLAB_ADMIN_EMAIL. Sale con código 1 si algo falló.
 *       En el VPS lo corre un timer todos los meses: un respaldo que nunca se
 *       probó no es un respaldo.
 *
 *   node tools/restaurar.mjs --a <destino.db> [archivo]
 *       Deja el respaldo (descifrado) en <destino.db>. Restaurar producción:
 *       parar el servicio, copiar sobre /var/lib/root-lab/rootkit.db y
 *       arrancar (docs/operacion.md). NO pisa un archivo que ya existe.
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { descifrarRespaldo } from '../server/respaldo.mjs';

const args = process.argv.slice(2);
const bandera = (n) => args.includes(n);
const valor = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const sueltos = args.filter((a, i) => !a.startsWith('--') && !['--datos', '--a'].includes(args[i - 1]));
const DATOS = resolve(valor('--datos') || process.env.ROOTLAB_DATOS || 'data');

function masNuevo() {
  const dir = join(DATOS, 'respaldos');
  if (!existsSync(dir)) return null;
  const candidatos = readdirSync(dir).filter((f) => /^rootkit-.*\.db(\.enc)?$/.test(f))
    .map((f) => ({ f: join(dir, f), t: statSync(join(dir, f)).mtimeMs }))
    /* A igual fecha, se prueba el cifrado: es el que sale del servidor. */
    .sort((a, b) => b.t - a.t || (a.f.endsWith('.enc') ? -1 : 1));
  return candidatos[0]?.f || null;
}

function abrir(archivo) {
  const bytes = readFileSync(archivo);
  return archivo.endsWith('.enc') ? descifrarRespaldo(bytes, process.env.ROOTLAB_RESPALDO_CLAVE || '') : bytes;
}

/** Abre el respaldo en una carpeta temporal y dice qué tiene. Exportada para los tests. */
export function verificar(archivo) {
  const tmp = mkdtempSync(join(tmpdir(), 'rootlab-restaurar-'));
  try {
    const copia = join(tmp, 'prueba.db');
    writeFileSync(copia, abrir(archivo));
    const db = new DatabaseSync(copia, { readOnly: true });
    try {
      const integridad = db.prepare('PRAGMA integrity_check').get();
      if (Object.values(integridad)[0] !== 'ok') throw new Error(`la base no pasa integrity_check: ${Object.values(integridad)[0]}`);
      const n = (tabla) => db.prepare(`SELECT COUNT(*) n FROM ${tabla}`).get().n;
      return {
        cuentas: n('cuentas'), plantas: n('plantas'), lecturas: n('lecturas'), dispositivos: n('dispositivos'),
        esquema: Number(db.prepare("SELECT valor FROM meta WHERE clave = 'esquema'").get()?.valor || 0),
      };
    } finally {
      db.close();
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

async function avisar(informe) {
  const para = process.env.ROOTLAB_ADMIN_EMAIL || '';
  if (!para) return;
  const { configCorreoDesdeEntorno, crearCorreo } = await import('../server/correo.mjs');
  const { informeRespaldo } = await import('../server/plantillas-correo.mjs');
  const correo = crearCorreo(configCorreoDesdeEntorno(process.env, DATOS));
  correo.enviar({ tipo: 'informe-respaldo', para, ...informeRespaldo(informe) });
  await Promise.race([correo.esperar(), new Promise((ok) => setTimeout(ok, 20000))]);
  correo.cerrar();
}

const esPrincipal = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (esPrincipal) {
  const archivo = sueltos[0] ? resolve(sueltos[0]) : masNuevo();
  if (!archivo || !existsSync(archivo)) {
    console.error(`no hay ningún respaldo en ${join(DATOS, 'respaldos')}`);
    if (bandera('--avisar')) await avisar({ ok: false, detalle: 'No hay ningún respaldo para probar.' });
    process.exit(1);
  }
  if (bandera('--verificar')) {
    try {
      const conteo = verificar(archivo);
      const edadH = Math.round((Date.now() - statSync(archivo).mtimeMs) / 3600000);
      console.log(`${basename(archivo)} se restaura bien: ${conteo.cuentas} cuentas, ${conteo.plantas} plantas, ${conteo.lecturas} lecturas, esquema ${conteo.esquema} (hecho hace ${edadH} h)`);
      /* Un respaldo de hace más de dos días es una falla del respaldo diario. */
      const viejo = edadH > 48;
      if (bandera('--avisar')) await avisar({ ok: !viejo, archivo: basename(archivo), conteo, detalle: viejo ? `OJO: el respaldo más nuevo tiene ${edadH} horas. El respaldo diario no está corriendo.` : '' });
      process.exitCode = viejo ? 1 : 0;
    } catch (e) {
      console.error(`${basename(archivo)} NO se pudo restaurar: ${e.message}`);
      if (bandera('--avisar')) await avisar({ ok: false, archivo: basename(archivo), detalle: e.message });
      process.exitCode = 1;
    }
  } else if (valor('--a')) {
    const destino = resolve(valor('--a'));
    if (existsSync(destino)) {
      console.error(`${destino} ya existe: no lo piso. Movelo antes.`);
      process.exit(1);
    }
    writeFileSync(destino, abrir(archivo), { mode: 0o640 });
    console.log(`${basename(archivo)} -> ${destino}`);
  } else {
    console.error('uso: restaurar.mjs --verificar [archivo] [--avisar]  |  restaurar.mjs --a <destino.db> [archivo]');
    process.exit(1);
  }
}
