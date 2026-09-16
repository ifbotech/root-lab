/* sincronizar-firmware.mjs — trae del firmware lo que la app necesita.
 *
 *   npm run firmware                      (con ../rootkit al lado)
 *   node tools/sincronizar-firmware.mjs /ruta/a/rootkit
 *
 * Hace tres cosas, y las tres existen para que haya UNA sola fuente de
 * verdad del arte y de los modelos:
 *
 *   1. Copia el renderer compilado a WebAssembly
 *      (rootkit/firmware/build/rootkit_caras.wasm, `make wasm`) a
 *      public/caras/. La app dibuja las caras con él.
 *
 *   2. Con ese mismo módulo, renderiza una imagen por modelo y ánimo en
 *      public/caras/<modelo>-<ANIMO>.png. Son los íconos de las
 *      notificaciones y la primera pintada antes de que cargue el módulo.
 *
 *   3. Regenera la tabla MODELOS de server/catalogo.mjs a partir de
 *      rootkit/firmware/core/persona.c.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOTKIT = resolve(process.argv[2] || join(RAIZ, '..', 'rootkit'));
const WASM = join(ROOTKIT, 'firmware', 'build', 'rootkit_caras.wasm');
const PERSONA = join(ROOTKIT, 'firmware', 'core', 'persona.c');
const CARAS = join(RAIZ, 'public', 'caras');
const LADO = 192;

/* ------------------------------------------------------------------ PNG --- */
const TABLA = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = TABLA[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function trozo(tipo, datos) {
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length);
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo));
  return Buffer.concat([largo, cuerpo, crc]);
}
export function png(rgba, w, h) {
  const filas = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    filas[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const d = y * (w * 3 + 1) + 1 + x * 3;
      filas[d] = rgba[o]; filas[d + 1] = rgba[o + 1]; filas[d + 2] = rgba[o + 2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    trozo('IHDR', ihdr),
    trozo('IDAT', deflateSync(filas, { level: 9 })),
    trozo('IEND', Buffer.alloc(0)),
  ]);
}

/* --------------------------------------------------------------- wasm ----- */
export async function cargarModulo(archivo) {
  const { instance } = await WebAssembly.instantiate(readFileSync(archivo), {});
  const x = instance.exports;
  const texto = (p) => {
    const m = new Uint8Array(x.memory.buffer);
    let f = p;
    while (m[f]) f++;
    return Buffer.from(m.subarray(p, f)).toString('utf8');
  };
  return { x, texto };
}

function renderizar({ x, texto }) {
  mkdirSync(CARAS, { recursive: true });
  x.lienzo(LADO, LADO);
  const rgba = () => new Uint8Array(x.memory.buffer, x.rgba(), LADO * LADO * 4);
  let n = 0;
  for (let p = 0; p < x.personas(); p++) {
    const id = texto(x.persona_id(p));
    for (let m = 0; m < x.animos(); m++) {
      /* El instante 1200 ms: ojos abiertos, sin parpadeo ni gesto. */
      x.cara(p, m, 0, 1200);
      writeFileSync(join(CARAS, `${id}-${texto(x.animo_id(m))}.png`), png(rgba(), LADO, LADO));
      n++;
    }
  }
  x.dormida(1200);
  writeFileSync(join(CARAS, 'incognito.png'), png(rgba(), LADO, LADO));
  return n + 1;
}

/* ------------------------------------------------------------ modelos ----- */
export function modelosDesdePersona(c) {
  const re = /\{\s*"([a-z0-9-]+)",\s*"([^"]*)",\s*"([^"]*)",\s*"([^"]*)",\s*RK_RAR_([A-Z]+),[\s\S]*?RK_RGB\(\s*(\d+),\s*(\d+),\s*(\d+)\)/g;
  const salida = [];
  let m;
  while ((m = re.exec(c))) {
    const hex = [m[6], m[7], m[8]].map((v) => Number(v).toString(16).padStart(2, '0')).join('');
    salida.push({ idx: salida.length, id: m[1], nombre: m[2], carcasa: m[3], lema: m[4], rareza: m[5], fondo: `#${hex}` });
  }
  return salida;
}

function escribirModelos(modelos) {
  const archivo = join(RAIZ, 'server', 'catalogo.mjs');
  const fuente = readFileSync(archivo, 'utf8');
  const a = '/* ---- generado: no editar a mano ---------------------------------------- */';
  const b = '/* ---- fin de lo generado ------------------------------------------------ */';
  const i = fuente.indexOf(a);
  const j = fuente.indexOf(b);
  if (i < 0 || j < 0) throw new Error('no encontré las marcas en catalogo.mjs');
  const q = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  const bloque = `${a}\nexport const MODELOS = [\n${modelos.map((m) =>
    `  { idx: ${m.idx}, id: ${q(m.id)}, nombre: ${q(m.nombre)}, rareza: ${q(m.rareza)}, fondo: ${q(m.fondo)},\n`
    + `    carcasa: ${q(m.carcasa)}, lema: ${q(m.lema)} },`).join('\n')}\n];\n`;
  writeFileSync(archivo, fuente.slice(0, i) + bloque + fuente.slice(j));
}

/* --------------------------------------------------------------- main ----- */
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!existsSync(WASM)) {
    console.error(`No está ${WASM}.\nCompilalo con: cd ${join(ROOTKIT, 'firmware')} && make wasm`);
    process.exit(1);
  }
  copyFileSync(WASM, join(CARAS, 'rootkit_caras.wasm'));
  const n = renderizar(await cargarModulo(WASM));
  const modelos = modelosDesdePersona(readFileSync(PERSONA, 'utf8'));
  if (modelos.length === 0) throw new Error('no pude leer los modelos de persona.c');
  escribirModelos(modelos);
  console.log(`wasm copiado, ${n} caras de ${LADO}x${LADO}, ${modelos.length} modelos`);
}
