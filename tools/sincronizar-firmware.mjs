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
 *   2. Con ese mismo módulo, renderiza una imagen por Rooti, piel y ánimo
 *      en public/caras/<rooti>-<rareza>-<ANIMO>.png, y cada Rooti dormido en
 *      <rooti>-dormido.png. Son los íconos de las notificaciones y la
 *      primera pintada antes de que cargue el módulo.
 *
 *   3. Regenera public/lib/rooties.mjs —los cinco Rooties con sus tres
 *      pieles— a partir de rootkit/firmware/core/persona.c. De ahí salen las
 *      quince paletas de la app, los cuerpos y el catálogo del servidor.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
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

export const RAREZAS = ['comun', 'raro', 'epico'];

function renderizar({ x, texto }) {
  mkdirSync(CARAS, { recursive: true });
  /* Las imágenes son todas generadas: se borran las viejas (de Rooties que
     ya no existen) antes de escribir las nuevas. */
  for (const f of readdirSync(CARAS)) if (f.endsWith('.png')) unlinkSync(join(CARAS, f));
  x.lienzo(LADO, LADO);
  const rgba = () => new Uint8Array(x.memory.buffer, x.rgba(), LADO * LADO * 4);
  let n = 0;
  for (let p = 0; p < x.personas(); p++) {
    const id = texto(x.persona_id(p));
    RAREZAS.forEach((rareza, r) => {
      for (let m = 0; m < x.animos(); m++) {
        /* El instante 1200 ms: ojos abiertos, sin parpadeo ni gesto. */
        x.cara(p, r, m, 0, 1200);
        writeFileSync(join(CARAS, `${id}-${rareza}-${texto(x.animo_id(m))}.png`), png(rgba(), LADO, LADO));
        n++;
      }
    });
    x.dormida(p, 1200);
    writeFileSync(join(CARAS, `${id}-dormido.png`), png(rgba(), LADO, LADO));
    n++;
  }
  return n;
}

/* ------------------------------------------------------------ modelos ----- */
const ADORNOS = { BRILLOS: 'brillos', AURA: 'aura', CORONA: 'corona', LUCES: 'luces' };

/** Los Rooties de persona.c: sus datos y las tres pieles de cada uno. */
export function modelosDesdePersona(c) {
  const cabeza = /\{\s*"([a-z0-9-]+)",\s*"([^"]*)",\s*"([^"]*)",\s*"([^"]*)",/g;
  const piel = /\{\s*"([^"]*)",\s*RK_HEX\(0x([0-9A-Fa-f]{6})\),\s*RK_HEX\(0x([0-9A-Fa-f]{6})\),\s*RK_HEX\(0x([0-9A-Fa-f]{6})\),\s*RK_HEX\(0x([0-9A-Fa-f]{6})\),\s*([^}]*?)\s*\}/g;
  const salida = [];
  let m;
  while ((m = cabeza.exec(c))) {
    piel.lastIndex = cabeza.lastIndex;
    const pieles = {};
    for (const rareza of RAREZAS) {
      const k = piel.exec(c);
      if (!k) throw new Error(`a ${m[1]} le faltan pieles en persona.c`);
      pieles[rareza] = {
        nombre: k[1],
        fondo: `#${k[2].toLowerCase()}`, ojos: `#${k[3].toLowerCase()}`,
        piel: `#${k[4].toLowerCase()}`, rubor: `#${k[5].toLowerCase()}`,
        adornos: [...k[6].matchAll(/RK_ADORNO_([A-Z]+)/g)].map((a) => ADORNOS[a[1]]).filter(Boolean),
      };
    }
    salida.push({ idx: salida.length, id: m[1], nombre: m[2], carcasa: m[3], lema: m[4], pieles });
    cabeza.lastIndex = piel.lastIndex;
  }
  return salida;
}

function escribirRooties(modelos) {
  const archivo = join(RAIZ, 'public', 'lib', 'rooties.mjs');
  const q = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  const pieles = (m) => RAREZAS.map((r) => {
    const p = m.pieles[r];
    return `      ${r}: { nombre: ${q(p.nombre)}, fondo: ${q(p.fondo)}, ojos: ${q(p.ojos)}, piel: ${q(p.piel)}, rubor: ${q(p.rubor)}, adornos: [${p.adornos.map(q).join(', ')}] },`;
  }).join('\n');
  writeFileSync(archivo, `/* rooties.mjs — los cinco Rooties y sus tres pieles.
 *
 * GENERADO desde rootkit/firmware/core/persona.c por
 * tools/sincronizar-firmware.mjs (npm run firmware). No editar a mano: para
 * cambiar un color o un lema se edita persona.c y se vuelve a generar, así
 * la pantalla de la maceta y la app no se separan nunca.
 *
 * \`idx\` es la posición en la tabla del firmware (la clave del módulo de
 * caras). Cada piel es una rareza del cofre: común, rara o épica.
 */

export const RAREZAS = ['comun', 'raro', 'epico'];

export const MODELOS = [
${modelos.map((m) => `  {
    idx: ${m.idx}, id: ${q(m.id)}, nombre: ${q(m.nombre)}, carcasa: ${q(m.carcasa)},
    lema: ${q(m.lema)},
    pieles: {
${pieles(m)}
    },
  },`).join('\n')}
];

export const modeloPorId = (id) => MODELOS.find((x) => x.id === id) || null;

/** La piel de un Rooti en una rareza (la común si la rareza no existe). */
export const pielDe = (id, rareza) => {
  const m = modeloPorId(id);
  return m ? (m.pieles[rareza] || m.pieles.comun) : null;
};

/** La clave de una piel: "brote-epico". Es también el id de su paleta. */
export const idPiel = (id, rareza) => \`\${id}-\${RAREZAS.includes(rareza) ? rareza : 'comun'}\`;
`);
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
  if (modelos.length === 0) throw new Error('no pude leer los Rooties de persona.c');
  escribirRooties(modelos);
  console.log(`wasm copiado, ${n} caras de ${LADO}x${LADO}, ${modelos.length} Rooties con ${modelos.length * RAREZAS.length} pieles`);
}
