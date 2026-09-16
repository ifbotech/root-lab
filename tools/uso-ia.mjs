/* uso-ia.mjs — cuánto se gastó en IA y en qué.
 *
 *   node tools/uso-ia.mjs [carpeta de datos] [días hacia atrás]
 *
 * En el VPS:
 *   sudo -u rootlab /opt/root-lab-node/bin/node /opt/root-lab/tools/uso-ia.mjs /var/lib/root-lab 30
 *
 * Lee la tabla ia_uso (cada llamada con sus tokens y su costo) y muestra el
 * total, por tipo (reconocer, diagnosticar, chat), por día y las cuentas que
 * más gastaron (por id: los emails están cifrados y acá no hacen falta). No
 * necesita la clave maestra.
 */
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const DATOS = resolve(process.argv[2] || process.env.ROOTLAB_DATOS || 'data');
const DIAS = Number(process.argv[3]) || 30;
const archivo = join(DATOS, 'rootkit.db');
if (!existsSync(archivo)) {
  console.error(`no está ${archivo}`);
  process.exit(1);
}

const db = new DatabaseSync(archivo, { readOnly: true });
const desde = Date.now() - DIAS * 24 * 3600 * 1000;
const usd = (micro) => `US$ ${(micro / 1e6).toFixed(4)}`;
const q = (sql) => db.prepare(sql).all(desde);

const [total] = q(`SELECT COUNT(*) llamadas, COALESCE(SUM(costo_micro), 0) costo, COALESCE(SUM(tokens_in), 0) entrada,
  COALESCE(SUM(tokens_out), 0) salida FROM ia_uso WHERE t >= ?`);
console.log(`\n  IA de ROOTLAB, últimos ${DIAS} días\n`);
console.log(`  ${total.llamadas} llamadas, ${usd(total.costo)} (${total.entrada} tokens de entrada, ${total.salida} de salida)\n`);

console.log('  por tipo');
for (const f of q(`SELECT tipo, fuente, COUNT(*) n, COALESCE(SUM(costo_micro), 0) costo FROM ia_uso WHERE t >= ?
  GROUP BY tipo, fuente ORDER BY costo DESC`)) {
  console.log(`    ${f.tipo.padEnd(13)} ${f.fuente.padEnd(9)} ${String(f.n).padStart(6)}  ${usd(f.costo)}`);
}

console.log('\n  por día');
for (const f of q(`SELECT dia, COUNT(*) n, COALESCE(SUM(costo_micro), 0) costo FROM ia_uso WHERE t >= ?
  GROUP BY dia ORDER BY dia`)) {
  console.log(`    ${f.dia}  ${String(f.n).padStart(6)}  ${usd(f.costo)}`);
}

console.log('\n  las cuentas que más gastaron');
for (const f of q(`SELECT COALESCE(cuenta, '(borrada)') cuenta, COUNT(*) n, COALESCE(SUM(costo_micro), 0) costo FROM ia_uso
  WHERE t >= ? GROUP BY cuenta ORDER BY costo DESC LIMIT 10`)) {
  console.log(`    ${f.cuenta.padEnd(16)} ${String(f.n).padStart(6)}  ${usd(f.costo)}`);
}
console.log('');
db.close();
