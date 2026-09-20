/* rooties-stl.mjs — saca los cinco Rooties en STL, como REFERENCIA de forma.
 *
 * OJO: esto NO son las carcasas.
 *
 * Los personajes de la app se esculpen para verse bien, no para salir de una
 * impresora: tienen patas separadas, brazos en alto y sombreros voladores, y
 * varias de esas cosas necesitarían soporte. Las carcasas se diseñan aparte,
 * en el CAD del hardware, y son otro objeto: tienen que alojar la 18650, el
 * módulo del TFT y la electrónica.
 *
 * Para qué sirve entonces: para tener la forma del personaje en la mano
 * cuando se modela la carcasa, y para imprimir una figura decorativa si se
 * quiere (con soportes).
 *
 *   node tools/rooties-stl.mjs [carpeta]
 *
 * Por defecto escribe en ../rootkit/carcasas/, que es el repo del hardware.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ROOTIES, construir } from '../public/lib/rooti3d/formas.mjs';
import { volumen } from '../public/lib/rooti3d/esculpir.mjs';
import { MODELOS } from '../public/lib/rooties.mjs';

/** La malla en STL binario. */
export function stlBinario(malla, titulo = '') {
  const n = malla.idx.length / 3;
  const buf = new ArrayBuffer(84 + n * 50);
  const v = new DataView(buf);
  new Uint8Array(buf, 0, 80).set(new TextEncoder().encode(`ROOTKIT ${titulo}`.slice(0, 79)));
  v.setUint32(80, n, true);
  let o = 84;
  const p = malla.pos;
  for (let i = 0; i < malla.idx.length; i += 3) {
    const a = malla.idx[i] * 3; const b = malla.idx[i + 1] * 3; const c = malla.idx[i + 2] * 3;
    const ux = p[b] - p[a]; const uy = p[b + 1] - p[a + 1]; const uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a]; const vy = p[c + 1] - p[a + 1]; const vz = p[c + 2] - p[a + 2];
    const nx = uy * vz - uz * vy; const ny = uz * vx - ux * vz; const nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    v.setFloat32(o, nx / l, true); v.setFloat32(o + 4, ny / l, true); v.setFloat32(o + 8, nz / l, true);
    o += 12;
    for (const k of [a, b, c]) {
      v.setFloat32(o, p[k], true); v.setFloat32(o + 4, p[k + 1], true); v.setFloat32(o + 8, p[k + 2], true);
      o += 12;
    }
    v.setUint16(o, 0, true);
    o += 2;
  }
  return new Uint8Array(buf);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('rooties-stl.mjs')) {
  const aqui = path.dirname(fileURLToPath(import.meta.url));
  const destino = path.resolve(aqui, '..', process.argv[2] || '../rootkit/carcasas');
  await mkdir(destino, { recursive: true });

  const filas = [];
  for (const id of ROOTIES) {
    /* Con paso fino: acá no importa que tarde, y el STL se ve mejor. */
    const figura = construir(id, { paso: 1.6 });
    const modelo = MODELOS.find((m) => m.id === id);
    const stl = stlBinario(figura.malla, modelo?.nombre || id);
    await writeFile(path.join(destino, `${id}.stl`), stl);
    const l = figura.limites;
    const tam = [l.hi[0] - l.lo[0], l.hi[1] - l.lo[1], l.hi[2] - l.lo[2]].map((n) => Math.round(n * 10) / 10);
    filas.push({ id, nombre: modelo?.nombre || id, tam, tri: figura.malla.triangulos, vol: volumen(figura.malla) });
    console.log(`${id.padEnd(9)} ${tam.join(' × ').padEnd(22)} ${String(figura.malla.triangulos).padStart(6)} tri  ${String(Math.round(stl.length / 1024)).padStart(4)} KB`);
  }

  const md = `# Los Rooties en STL — referencia de forma

<!-- GENERADO por root-lab/tools/rooties-stl.mjs (npm run carcasas). Para
     cambiar una figura se edita root-lab/public/lib/rooti3d/formas.mjs. -->

**Esto no son las carcasas.** Son los cinco personajes tal como se ven en
ROOTLAB, exportados para tenerlos a mano mientras se modela el aparato.

El personaje y la carcasa son dos objetos distintos, a propósito:

* el **personaje** se esculpe para verse bien: tiene patitas separadas, brazos
  levantados y sombreros que vuelan. Varias de esas cosas no salen de una
  impresora sin soporte, y está bien que así sea;
* la **carcasa** tiene que alojar la celda 18650 parada, el módulo del TFT de
  1,44" y la electrónica, apoyarse sin volcarse y salir de la impresora. Se
  diseña aparte, en el CAD del hardware, tomando de acá la silueta y el
  carácter.

## Los cinco

| Rooti | Archivo | Tamaño (mm) | Triángulos |
| --- | --- | --- | --- |
${filas.map((f) => `| ${f.nombre} | \`${f.id}.stl\` | ${f.tam.join(' × ')} | ${f.tri} |`).join('\n')}

Las mallas son cerradas y con las normales hacia afuera (volumen con signo
positivo), así que un laminador las acepta sin reparaciones. Si querés
imprimir la figura como adorno, va con soportes y a 0,15 mm de capa.
`;
  await writeFile(path.join(destino, 'README.md'), md);
  console.log(`\n${filas.length} figuras y un README en ${destino}`);
}
