/* cuerpo.mjs — el Rooti entero: el cuerpo ilustrado con la cara del firmware
 * en la ventana de su pantalla.
 *
 * La maceta sólo tiene una pantalla de 1,44": ahí va la CARA, y la dibuja el
 * firmware (art/face.c). En el teléfono se ve el personaje completo, como en
 * un libro de cuentos: el cuerpo es una ilustración vectorial y la cara es la
 * misma del WebAssembly (lib/caras.mjs), metida en la ventana biselada donde
 * va el TFT en la carcasa impresa.
 *
 * LAS SILUETAS SON DATOS
 *
 * Cada Rooti es una tabla (SILUETAS): el contorno como puntos, la ventana de
 * la pantalla, los relieves (nervaduras, costillas, manchas), dónde va la
 * corona y el gorrito de dormir. Rocío cambia un número y cambia el
 * personaje; no hay que tocar el dibujo. El contorno se suaviza con
 * Catmull-Rom (un punto con tercer valor 1 es una esquina, sin suavizar) y
 * se cierra con una recta en la base.
 *
 * LAS MISMAS REGLAS QUE LA CARCASA
 *
 * El cuerpo de la app es la carcasa que se imprime, así que cumple las
 * reglas de FDM sin soportes: ningún tramo del contorno (ya suavizado)
 * mira hacia abajo más de 45° respecto de la vertical, la base es plana y
 * el centro de masa queda en la mitad de abajo (la 18650 va parada, abajo).
 * La ventana entra entera en la silueta con su bisel de 45°. Lo verifica
 * test/cuerpo.test.mjs con `voladizoMaximo`, sobre la curva que se dibuja y
 * no sobre los puntos.
 *
 * LA PIEL
 *
 * Los colores salen de los cuatro de la piel (fondo, ojos, piel, rubor) con
 * un rol por Rooti: el Brote, el Musgo y el Bulbo son de color piel; el
 * Pinchito es un cactus (fondo mezclado con los ojos) y su piel es la flor;
 * el Champi tiene el sombrero de color piel y el tallo claro. La rareza
 * suma efectos: la común un aura suave, la rara destellos, la épica lo que
 * digan sus adornos (corona, aura que late, luces que flotan).
 *
 * LA ESCENA
 *
 *   noche     se sienta (se achata un poco), se pone el gorrito de hoja y
 *             suelta Zzz. Si está bien, la cara duerme; si tiene sed, no:
 *             la cara sigue diciendo la verdad.
 *   polvo     motas sobre el cuerpo, en lugares fijos para ese Rooti, que
 *             se sacan de a una con `limpiarEn(x, y)`.
 *   mimo      `acariciar(true)` ronronea con todo el cuerpo.
 *
 * Arriba están las funciones puras (se prueban en Node); abajo, el DOM.
 */

import { mezclar } from './paletas.mjs';
import { pielDe, modeloPorId } from './rooties.mjs';
import { cara, imagenCara } from './caras.mjs';

export const ANCHO = 200;
export const ALTO = 220;
export const BASE_Y = 208;
export const VOLADIZO_MAX = 45;
export const BISEL = 6;           /* ancho del bisel de 45° alrededor del TFT */
export const POLVO_MAX = 12;

/* ------------------------------------------------------------ los datos --- */
/*
 * contorno  puntos [x, y] (o [x, y, 1] para una esquina), de la base
 *           izquierda a la base derecha, en sentido horario visto en
 *           pantalla. El primero y el último tienen y = BASE_Y.
 * dibujo    (opcional) el contorno que se dibuja cuando una parte se anima
 *           aparte (el brazo del Pinchito); el que se imprime es `contorno`
 * brazo     (opcional) { puntos, pivote }: se dibuja detrás y saluda
 * ventana   { x, y, lado }: el centro y el lado del área activa del TFT
 * partes    relieves: { forma: 'trazo' | 'relleno' | 'elipse', color, ... }
 *           con colores por rol: sombra, luz, borde, acento, rubor, ojos,
 *           manchas, tallo
 * corona    { x, y, escala }: la base de la corona de la piel épica
 * gorro     { x, y, giro, escala }: la base del gorrito de dormir
 * roles     de qué sale el color del cuerpo: 'piel' | 'cactus' | 'hongo'
 */
export const SILUETAS = {
  brote: {
    roles: 'piel',
    contorno: [[44, 208], [34, 192], [30, 166], [36, 136], [52, 108], [74, 90], [90, 84], [86, 66], [74, 44], [64, 24],
      [82, 34], [96, 56], [100, 70], [104, 56], [118, 34], [136, 24], [126, 44], [114, 66], [110, 84], [126, 90],
      [148, 108], [164, 136], [170, 166], [166, 192], [156, 208]],
    ventana: { x: 100, y: 152, lado: 68 },
    partes: [
      { forma: 'trazo', color: 'sombra', ancho: 2.5, puntos: [[99, 72], [86, 50], [72, 32]] },
      { forma: 'trazo', color: 'sombra', ancho: 2.5, puntos: [[101, 72], [114, 50], [128, 32]] },
      { forma: 'elipse', color: 'luz', cx: 64, cy: 118, rx: 11, ry: 6, giro: -35 },
      { forma: 'relleno', color: 'sombra', puntos: [[34, 164], [46, 152], [58, 160], [50, 176]] },
      { forma: 'relleno', color: 'sombra', puntos: [[166, 164], [154, 152], [142, 160], [150, 176]] },
      { forma: 'elipse', color: 'sombra', cx: 72, cy: 203, rx: 14, ry: 5 },
      { forma: 'elipse', color: 'sombra', cx: 128, cy: 203, rx: 14, ry: 5 },
    ],
    corona: { x: 100, y: 84, escala: 0.8 },
    gorro: { x: 100, y: 90, giro: -14, escala: 0.8 },
  },
  musgo: {
    roles: 'piel',
    contorno: [[26, 208], [18, 194], [16, 172], [24, 148], [42, 122], [68, 102], [100, 94], [132, 102], [158, 122],
      [176, 148], [184, 172], [182, 194], [174, 208]],
    ventana: { x: 100, y: 156, lado: 66 },
    partes: [
      { forma: 'trazo', color: 'sombra', ancho: 2.5, puntos: [[38, 156], [45, 148], [52, 156]] },
      { forma: 'trazo', color: 'sombra', ancho: 2.5, puntos: [[148, 150], [155, 142], [162, 150]] },
      { forma: 'trazo', color: 'sombra', ancho: 2.5, puntos: [[66, 118], [73, 110], [80, 118]] },
      { forma: 'trazo', color: 'sombra', ancho: 2.5, puntos: [[120, 116], [127, 108], [134, 116]] },
      { forma: 'trazo', color: 'sombra', ancho: 2.5, puntos: [[26, 186], [33, 178], [40, 186]] },
      { forma: 'elipse', color: 'luz', cx: 76, cy: 108, rx: 12, ry: 5, giro: -18 },
      { forma: 'elipse', color: 'rubor', cx: 100, cy: 104, rx: 5, ry: 4 },
      { forma: 'elipse', color: 'luz', cx: 44, cy: 190, rx: 11, ry: 8, borde: true },
      { forma: 'elipse', color: 'luz', cx: 156, cy: 190, rx: 11, ry: 8, borde: true },
    ],
    corona: { x: 100, y: 97, escala: 1 },
    gorro: { x: 100, y: 100, giro: -16, escala: 1 },
  },
  pinchito: {
    roles: 'cactus',
    contorno: [[62, 208], [54, 186], [50, 150], [50, 110], [54, 80], [46, 64], [42, 48], [54, 42], [64, 50], [76, 34],
      [100, 22], [122, 30], [138, 50], [146, 76], [158, 62], [172, 48], [186, 56], [186, 70], [176, 86], [154, 118],
      [152, 152], [146, 186], [138, 208]],
    dibujo: [[62, 208], [54, 186], [50, 150], [50, 110], [54, 80], [46, 64], [42, 48], [54, 42], [64, 50], [76, 34],
      [100, 22], [122, 30], [138, 50], [148, 80], [154, 118], [152, 152], [146, 186], [138, 208]],
    brazo: {
      puntos: [[136, 112], [146, 76], [158, 62], [172, 48], [186, 56], [186, 70], [176, 86], [154, 120]],
      pivote: [148, 104],
    },
    ventana: { x: 100, y: 114, lado: 64 },
    partes: [
      { forma: 'trazo', color: 'sombra', ancho: 2.5, puntos: [[70, 158], [66, 182], [70, 204]] },
      { forma: 'trazo', color: 'sombra', ancho: 2.5, puntos: [[100, 156], [100, 205]] },
      { forma: 'trazo', color: 'sombra', ancho: 2.5, puntos: [[130, 158], [134, 182], [130, 204]] },
      { forma: 'trazo', color: 'luz', ancho: 2, puntos: [[84, 168], [86, 174], [88, 168]] },
      { forma: 'trazo', color: 'luz', ancho: 2, puntos: [[112, 186], [114, 192], [116, 186]] },
      { forma: 'trazo', color: 'luz', ancho: 2, puntos: [[60, 128], [62, 134], [64, 128]] },
      { forma: 'flor', color: 'acento', centro: 'rubor', cx: 100, cy: 38, r: 7 },
    ],
    corona: { x: 100, y: 26, escala: 0.8 },
    gorro: { x: 96, y: 30, giro: -12, escala: 0.9 },
  },
  bulbo: {
    roles: 'piel',
    contorno: [[40, 208], [30, 188], [28, 160], [40, 128], [60, 104], [78, 86], [88, 64], [94, 40], [100, 18],
      [106, 40], [112, 64], [122, 86], [140, 104], [160, 128], [172, 160], [170, 188], [160, 208]],
    ventana: { x: 100, y: 156, lado: 66 },
    partes: [
      { forma: 'trazo', color: 'sombra', ancho: 2, puntos: [[100, 30], [104, 42], [98, 52], [92, 44], [99, 38]] },
      { forma: 'relleno', color: 'acento', puntos: [[70, 110], [80, 94], [92, 108], [82, 118]] },
      { forma: 'relleno', color: 'acento', puntos: [[108, 108], [120, 94], [130, 110], [118, 118]] },
      { forma: 'relleno', color: 'acento', puntos: [[90, 110], [100, 90], [110, 110], [100, 118]] },
      { forma: 'trazo', color: 'sombra', ancho: 2.5, puntos: [[50, 124], [40, 160], [48, 196]] },
      { forma: 'trazo', color: 'sombra', ancho: 2.5, puntos: [[150, 124], [160, 160], [152, 196]] },
      { forma: 'elipse', color: 'luz', cx: 88, cy: 58, rx: 4, ry: 12, giro: 12 },
    ],
    corona: { x: 100, y: 24, escala: 0.7 },
    gorro: { x: 100, y: 34, giro: -10, escala: 0.8 },
  },
  champi: {
    roles: 'hongo',
    contorno: [[50, 208], [46, 180], [48, 140], [52, 112, 1], [30, 88, 1], [28, 76, 1], [56, 40], [100, 12], [144, 40],
      [172, 76, 1], [170, 88, 1], [148, 112, 1], [152, 140], [154, 180], [150, 208]],
    ventana: { x: 100, y: 160, lado: 62 },
    partes: [
      { forma: 'sombrero', color: 'piel', puntos: [[52, 112, 1], [30, 88, 1], [28, 76, 1], [56, 40], [100, 12], [144, 40], [172, 76, 1], [170, 88, 1], [148, 112, 1]] },
      { forma: 'trazo', color: 'sombra', ancho: 3, puntos: [[36, 90], [100, 104], [164, 90]] },
      { forma: 'elipse', color: 'manchas', cx: 64, cy: 62, rx: 10, ry: 8, giro: -20 },
      { forma: 'elipse', color: 'manchas', cx: 102, cy: 36, rx: 12, ry: 9 },
      { forma: 'elipse', color: 'manchas', cx: 140, cy: 62, rx: 9, ry: 7, giro: 20 },
      { forma: 'elipse', color: 'manchas', cx: 86, cy: 80, rx: 6, ry: 5 },
      { forma: 'elipse', color: 'manchas', cx: 122, cy: 84, rx: 7, ry: 5 },
    ],
    corona: { x: 100, y: 16, escala: 0.9 },
    gorro: { x: 100, y: 20, giro: -12, escala: 1 },
  },
};

export const ROOTIES = Object.keys(SILUETAS);

/* ------------------------------------------------------------ la curva --- */
const K = 1 / 6;

/**
 * Los tramos Bézier de una lista de puntos por Catmull-Rom. Abierta, los
 * extremos se repiten (la curva empieza y termina en ellos); cerrada, da la
 * vuelta. Un punto con tercer valor 1 es una esquina: sus tangentes son 0.
 */
export function beziers(puntos, { cerrado = false } = {}) {
  const n = puntos.length;
  const at = (i) => (cerrado ? puntos[((i % n) + n) % n] : puntos[Math.max(0, Math.min(n - 1, i))]);
  const tramos = [];
  const cuantos = cerrado ? n : n - 1;
  for (let i = 0; i < cuantos; i++) {
    const p0 = at(i - 1); const p1 = at(i); const p2 = at(i + 1); const p3 = at(i + 2);
    const k1 = p1[2] ? 0 : K;
    const k2 = p2[2] ? 0 : K;
    tramos.push([
      [p1[0], p1[1]],
      [p1[0] + (p2[0] - p0[0]) * k1, p1[1] + (p2[1] - p0[1]) * k1],
      [p2[0] - (p3[0] - p1[0]) * k2, p2[1] - (p3[1] - p1[1]) * k2],
      [p2[0], p2[1]],
    ]);
  }
  return tramos;
}

const f1 = (v) => Math.round(v * 10) / 10;

/** El atributo `d` de SVG. `cerrado` da la vuelta suave; `base` cierra con una recta. */
export function trazado(puntos, { cerrado = false, base = false } = {}) {
  const tramos = beziers(puntos, { cerrado });
  if (!tramos.length) return '';
  let d = `M${f1(tramos[0][0][0])},${f1(tramos[0][0][1])}`;
  for (const [, c1, c2, p] of tramos) d += ` C${f1(c1[0])},${f1(c1[1])} ${f1(c2[0])},${f1(c2[1])} ${f1(p[0])},${f1(p[1])}`;
  return cerrado || base ? `${d} Z` : d;
}

/** La curva hecha polígono: `pasos` puntos por tramo. */
export function muestrear(puntos, { cerrado = false, pasos = 16 } = {}) {
  const pts = [];
  for (const [a, b, c, d] of beziers(puntos, { cerrado })) {
    for (let k = 0; k < pasos; k++) {
      const t = k / pasos; const u = 1 - t;
      pts.push([
        u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0],
        u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1],
      ]);
    }
  }
  if (!cerrado && puntos.length) pts.push([puntos[puntos.length - 1][0], puntos[puntos.length - 1][1]]);
  return pts;
}

/** Área con signo (fórmula del cordón). En pantalla (y hacia abajo), positiva es horaria. */
export function areaConSigno(poligono) {
  let a = 0;
  for (let i = 0; i < poligono.length; i++) {
    const [x1, y1] = poligono[i];
    const [x2, y2] = poligono[(i + 1) % poligono.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

/**
 * El voladizo máximo de un polígono cerrado, en grados respecto de la
 * vertical: cuánto se inclina el tramo que más mira hacia abajo. Un tramo
 * que mira hacia arriba o de costado no es voladizo. Se ignora la base
 * (los tramos apoyados en y = base), que es la cara que va en la cama.
 * Devuelve { grados, donde }.
 */
export function voladizoMaximo(poligono, base = BASE_Y) {
  const signo = areaConSigno(poligono) > 0 ? 1 : -1;
  let grados = 0;
  let donde = null;
  for (let i = 0; i < poligono.length; i++) {
    const [x1, y1] = poligono[i];
    const [x2, y2] = poligono[(i + 1) % poligono.length];
    const dx = x2 - x1; const dy = y2 - y1;
    if (Math.hypot(dx, dy) < 1e-6) continue;
    if (y1 >= base - 0.5 && y2 >= base - 0.5) continue;
    /* La normal hacia afuera; si su componente y es positiva (hacia abajo
       en pantalla), el tramo es un voladizo. */
    const ny = signo > 0 ? -dx : dx;
    if (ny <= 1e-9) continue;
    const a = (Math.atan2(Math.abs(dx), Math.abs(dy)) * 180) / Math.PI;
    if (a > grados) { grados = a; donde = [f1(x1), f1(y1)]; }
  }
  return { grados: f1(grados), donde };
}

/** Si un punto está dentro de un polígono (par-impar). */
export function dentro([x, y], poligono) {
  let adentro = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const [xi, yi] = poligono[i];
    const [xj, yj] = poligono[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) adentro = !adentro;
  }
  return adentro;
}

/** El centro de masa de un polígono lleno (de la silueta extruida). */
export function centroide(poligono) {
  const a = areaConSigno(poligono);
  let cx = 0; let cy = 0;
  for (let i = 0; i < poligono.length; i++) {
    const [x1, y1] = poligono[i];
    const [x2, y2] = poligono[(i + 1) % poligono.length];
    const c = x1 * y2 - x2 * y1;
    cx += (x1 + x2) * c;
    cy += (y1 + y2) * c;
  }
  return [cx / (6 * a), cy / (6 * a)];
}

/** La silueta de un Rooti como polígono (la curva que se imprime). */
export const poligonoDe = (id) => muestrear((SILUETAS[id] || SILUETAS.brote).contorno);

/** El rectángulo del bisel: la ventana del TFT más el chaflán de 45°. */
export function biselDe(id) {
  const v = (SILUETAS[id] || SILUETAS.brote).ventana;
  const m = v.lado / 2 + BISEL;
  return { x0: v.x - m, y0: v.y - m, x1: v.x + m, y1: v.y + m };
}

/* ---------------------------------------------------------- los colores --- */
/** Los colores del cuerpo de un Rooti con una piel. */
export function coloresDe(id, piel) {
  const p = piel || pielDe(id, 'comun');
  const s = SILUETAS[id] || SILUETAS.brote;
  const cuerpo = s.roles === 'cactus' ? mezclar(p.fondo, p.ojos, 0.38)
    : s.roles === 'hongo' ? mezclar(p.fondo, '#ffffff', 0.5)
      : p.piel;
  return {
    cuerpo,
    sombra: mezclar(cuerpo, p.ojos, 0.24),
    luz: mezclar(cuerpo, '#ffffff', 0.5),
    borde: mezclar(cuerpo, p.ojos, 0.62),
    acento: s.roles === 'cactus' ? p.piel : mezclar(p.piel, p.rubor, 0.45),
    piel: p.piel,
    rubor: p.rubor,
    ojos: p.ojos,
    fondo: p.fondo,
    manchas: mezclar(p.fondo, '#ffffff', 0.7),
    tallo: mezclar(p.fondo, '#ffffff', 0.5),
    sombraSuelo: mezclar(p.ojos, '#000000', 0.4),
  };
}

/* ------------------------------------------------------------- el polvo --- */
function azar(semilla) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const semillaDe = (s) => [...String(s)].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);

/**
 * Dónde caen las motas de polvo: siempre en los mismos lugares para el mismo
 * Rooti (así no saltan al repintar), dentro de la silueta, fuera de la
 * ventana y sin encimarse.
 */
export function posicionesPolvo(id, cantidad = POLVO_MAX, semilla = id) {
  const pol = poligonoDe(id);
  const b = biselDe(id);
  const al = azar(semillaDe(semilla));
  const motas = [];
  for (let intento = 0; motas.length < Math.min(cantidad, POLVO_MAX) && intento < 4000; intento++) {
    const x = 20 + al() * 160;
    const y = 16 + al() * 186;
    if (!dentro([x, y], pol)) continue;
    if (x > b.x0 - 4 && x < b.x1 + 4 && y > b.y0 - 4 && y < b.y1 + 4) continue;
    const r = 4 + al() * 3;
    /* Lejos del borde: la mota está SOBRE el cuerpo. */
    if (pol.some(([px, py]) => Math.hypot(px - x, py - y) < r + 3)) continue;
    if (motas.some((m) => Math.hypot(m.x - x, m.y - y) < m.r + r + 6)) continue;
    motas.push({ x: f1(x), y: f1(y), r: f1(r) });
  }
  return motas;
}

/* -------------------------------------------------------------- el DOM --- */
const NS = 'http://www.w3.org/2000/svg';

function s(tag, attrs = {}, ...hijos) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    el.setAttribute(k, String(v));
  }
  for (const c of hijos.flat(Infinity)) if (c) el.append(c);
  return el;
}

/* replaceChildren convierte en texto los null y los arrays: acá se aplanan
   y se descartan antes. */
const poner = (el, ...hijos) => el.replaceChildren(...hijos.flat(Infinity).filter(Boolean));

let secuencia = 0;

const CORONA = 'M-16,0 L-19,-17 L-9,-9 L0,-22 L9,-9 L19,-17 L16,0 Z';
const DESTELLO = 'M0,-7 C1,-2 2,-1 7,0 C2,1 1,2 0,7 C-1,2 -2,1 -7,0 C-2,-1 -1,-2 0,-7 Z';

/* Los destellos y las luces, alrededor del cuerpo. */
const DESTELLOS = [[26, 58], [176, 40], [186, 150], [14, 132], [168, 200], [34, 206]];
const LUCES = [[20, 170], [182, 118], [40, 40], [160, 20], [100, 4], [190, 190], [10, 96]];

function parte(pt, col) {
  const color = col[pt.color] || col.sombra;
  switch (pt.forma) {
    case 'trazo':
      return s('path', { d: trazado(pt.puntos), fill: 'none', stroke: color, 'stroke-width': pt.ancho || 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    case 'relleno':
      return s('path', { d: trazado(pt.puntos, { cerrado: true }), fill: color });
    case 'sombrero':
      return s('path', { d: trazado(pt.puntos, { base: true }), fill: color, stroke: col.borde, 'stroke-width': 3, 'stroke-linejoin': 'round' });
    case 'elipse':
      return s('ellipse', {
        cx: pt.cx, cy: pt.cy, rx: pt.rx, ry: pt.ry, fill: color,
        transform: pt.giro ? `rotate(${pt.giro} ${pt.cx} ${pt.cy})` : null,
        stroke: pt.borde ? col.borde : null, 'stroke-width': pt.borde ? 2.5 : null,
      });
    case 'flor': {
      const g = s('g', { class: 'cuerpo-flor' });
      for (let i = 0; i < 5; i++) {
        const a = (i * 2 * Math.PI) / 5 - Math.PI / 2;
        g.append(s('circle', { cx: f1(pt.cx + Math.cos(a) * pt.r), cy: f1(pt.cy + Math.sin(a) * pt.r), r: pt.r * 0.8, fill: color, stroke: col.borde, 'stroke-width': 1.5 }));
      }
      g.append(s('circle', { cx: pt.cx, cy: pt.cy, r: pt.r * 0.6, fill: col[pt.centro] || col.rubor }));
      return g;
    }
    default:
      return null;
  }
}

function gorro(g, col) {
  const hoja = mezclar('#7cb342', col.piel, 0.25);
  return s('g', { class: 'cuerpo-gorro', transform: `translate(${g.x} ${g.y}) rotate(${g.giro}) scale(${g.escala})` },
    s('path', { d: 'M-30,0 C-30,-24 -12,-36 6,-40 C22,-44 34,-54 42,-66 C44,-44 38,-18 30,0 Z', fill: hoja, stroke: mezclar(hoja, '#000000', 0.35), 'stroke-width': 2.5, 'stroke-linejoin': 'round' }),
    s('path', { d: 'M-8,-6 C0,-22 18,-34 38,-60', fill: 'none', stroke: mezclar(hoja, '#000000', 0.25), 'stroke-width': 2, 'stroke-linecap': 'round' }),
    s('rect', { x: -33, y: -6, width: 66, height: 10, rx: 5, fill: col.luz, stroke: col.borde, 'stroke-width': 2 }),
    s('circle', { cx: 42, cy: -66, r: 6, fill: '#e3f2fd', stroke: '#90caf9', 'stroke-width': 1.5 }));
}

/**
 * El Rooti entero, listo para poner en la página.
 *
 *   persona, rareza, animo, etapa, lux, clave   como en lib/caras.mjs
 *   lado      ancho en píxeles CSS (el alto es lado × 1,1)
 *   noche     true: sentado, con gorrito y Zzz
 *   polvo     cuántas motas tiene encima (0 a 12)
 *   estatico  true: la cara es la imagen fija (listas largas, colección)
 *   dormido   true: todavía no se abrió el cofre (cara gris, sin efectos)
 *   despertar true: la cara abre los ojos (la animación del firmware) y
 *             llama `alDespertar` al terminar
 *
 * Devuelve el elemento con `actualizar({...})`, `acariciar(si)`,
 * `limpiarEn(x, y)` (px CSS relativos al elemento; devuelve cuántas motas
 * quedan, o -1 si no tocó ninguna) y `lienzo` (la cara).
 */
export function cuerpo({
  persona = 'brote', rareza = 'comun', animo = 'HAPPY', etapa = 0, lado = 200, noche = false, polvo = 0,
  estatico = false, dormido = false, despertar = false, alDespertar = null, clave = '', lux = null, fps = 20, etiqueta = '',
} = {}) {
  const id = SILUETAS[persona] ? persona : 'brote';
  const sil = SILUETAS[id];
  const uid = `rc${++secuencia}`;
  const estado = { persona: id, rareza, animo, noche, polvo, dormido, motas: [] };

  const raiz = document.createElement('div');
  raiz.className = 'cuerpo';
  raiz.style.width = `${lado}px`;
  raiz.style.height = `${Math.round((lado * ALTO) / ANCHO)}px`;
  raiz.setAttribute('role', 'img');

  const atras = s('svg', { class: 'cuerpo-atras', viewBox: `0 0 ${ANCHO} ${ALTO}`, 'aria-hidden': 'true' });
  const pose = document.createElement('div');
  pose.className = 'cuerpo-pose';
  const dibujo = s('svg', { class: 'cuerpo-svg', viewBox: `0 0 ${ANCHO} ${ALTO}`, 'aria-hidden': 'true' });
  const ventana = document.createElement('div');
  ventana.className = 'cuerpo-ventana';
  const v = sil.ventana;
  ventana.style.left = `${((v.x - v.lado / 2) * 100) / ANCHO}%`;
  ventana.style.top = `${((v.y - v.lado / 2) * 100) / ALTO}%`;
  ventana.style.width = `${(v.lado * 100) / ANCHO}%`;
  ventana.style.height = `${(v.lado * 100) / ALTO}%`;
  const encima = s('svg', { class: 'cuerpo-encima', viewBox: `0 0 ${ANCHO} ${ALTO}`, 'aria-hidden': 'true' });
  const adelante = s('svg', { class: 'cuerpo-adelante', viewBox: `0 0 ${ANCHO} ${ALTO}`, 'aria-hidden': 'true' });
  pose.append(dibujo, ventana, encima);
  raiz.append(atras, pose, adelante);

  const ladoCara = Math.max(32, Math.round((lado * v.lado) / ANCHO));
  const animoVisible = () => (estado.noche && ['HAPPY', 'SLEEPING'].includes(estado.animo) ? 'SLEEPING' : estado.animo);
  let lienzo;
  if (estatico) {
    lienzo = document.createElement('img');
    lienzo.className = 'cara';
    lienzo.alt = '';
    lienzo.decoding = 'async';
    lienzo.loading = 'lazy';
  } else {
    lienzo = cara({
      persona: id, rareza, animo: animoVisible(), etapa, lado: ladoCara, fps, clave, lux,
      modo: dormido ? 'dormida' : despertar ? 'despertar' : 'cara', etiqueta: etiqueta || '', alTerminar: alDespertar,
    });
  }
  ventana.append(lienzo);

  function pintar() {
    const piel = estado.dormido
      ? { fondo: '#eceff1', ojos: '#546e7a', piel: '#cfd8dc', rubor: '#b0bec5', adornos: [] }
      : pielDe(id, estado.rareza) || pielDe(id, 'comun');
    const col = coloresDe(id, piel);
    const adornos = estado.dormido ? [] : piel.adornos || [];
    raiz.className = `cuerpo cuerpo-${id} rareza-${estado.dormido ? 'dormido' : estado.rareza}${estado.noche ? ' noche' : ''}${raiz.classList.contains('mimo') ? ' mimo' : ''}`;
    raiz.style.setProperty('--cuerpo-fondo', col.fondo);
    raiz.style.setProperty('--cuerpo-ojos', col.ojos);
    raiz.style.setProperty('--cuerpo-rubor', col.rubor);
    const nombre = modeloPorId(id)?.nombre || 'Rooti';
    if (!etiqueta) raiz.setAttribute('aria-label', estado.dormido ? `${nombre}, dormido` : `${nombre}, piel ${piel.nombre}${estado.noche ? ', durmiendo' : ''}`);
    else raiz.setAttribute('aria-label', etiqueta);

    /* Atrás: el aura de la rareza y la sombra en el piso. */
    poner(atras,
      s('defs', {},
        s('radialGradient', { id: `${uid}-aura` },
          s('stop', { offset: '0%', 'stop-color': adornos.includes('aura') ? col.rubor : col.piel, 'stop-opacity': adornos.includes('aura') ? 0.75 : 0.45 }),
          s('stop', { offset: '100%', 'stop-color': col.piel, 'stop-opacity': 0 }))),
      estado.dormido ? null : s('ellipse', { class: `cuerpo-aura${adornos.includes('aura') ? ' late' : ''}`, cx: 100, cy: 124, rx: adornos.includes('aura') ? 100 : 88, ry: adornos.includes('aura') ? 108 : 96, fill: `url(#${uid}-aura)` }),
      s('ellipse', { class: 'cuerpo-piso', cx: 100, cy: 210, rx: 70, ry: 7, fill: col.sombraSuelo, 'fill-opacity': 0.18 }));

    /* El cuerpo. */
    const bisel = biselDe(id);
    poner(dibujo,
      s('defs', {},
        s('linearGradient', { id: `${uid}-bisel`, x1: 0, y1: 0, x2: 0, y2: 1 },
          s('stop', { offset: '0%', 'stop-color': col.borde }),
          s('stop', { offset: '100%', 'stop-color': col.luz }))),
      sil.brazo ? s('g', { class: 'cuerpo-brazo', style: `transform-origin:${sil.brazo.pivote[0]}px ${sil.brazo.pivote[1]}px` },
        s('path', { d: trazado(sil.brazo.puntos, { base: true }), fill: col.cuerpo, stroke: col.borde, 'stroke-width': 3, 'stroke-linejoin': 'round' })) : null,
      s('path', { class: 'cuerpo-silueta', d: trazado(sil.dibujo || sil.contorno, { base: true }), fill: col.cuerpo, stroke: col.borde, 'stroke-width': 3, 'stroke-linejoin': 'round' }),
      sil.partes.map((pt) => parte(pt, col)),
      s('rect', { x: bisel.x0, y: bisel.y0, width: bisel.x1 - bisel.x0, height: bisel.y1 - bisel.y0, rx: 11, fill: `url(#${uid}-bisel)`, stroke: col.borde, 'stroke-width': 2 }),
      s('rect', { x: v.x - v.lado / 2 - 1, y: v.y - v.lado / 2 - 1, width: v.lado + 2, height: v.lado + 2, rx: 5, fill: col.fondo }));

    /* Encima del cuerpo: corona, gorrito y polvo. */
    const motas = estado.motas;
    poner(encima,
      adornos.includes('corona') && !estado.noche
        ? s('g', { class: 'cuerpo-corona', transform: `translate(${sil.corona.x} ${sil.corona.y}) scale(${sil.corona.escala})` },
          s('path', { d: CORONA, fill: '#ffd54f', stroke: '#c79100', 'stroke-width': 2.5, 'stroke-linejoin': 'round' }),
          s('circle', { cx: 0, cy: -8, r: 3, fill: col.rubor }),
          s('circle', { cx: -10, cy: -4, r: 2, fill: '#fff8e1' }),
          s('circle', { cx: 10, cy: -4, r: 2, fill: '#fff8e1' }))
        : null,
      estado.noche ? gorro(sil.gorro, col) : null,
      s('g', { class: 'cuerpo-polvo' }, motas.map((m, i) => s('g', { class: 'mota', 'data-i': i, style: `animation-delay:${-(i * 0.37).toFixed(2)}s` },
        s('circle', { cx: m.x, cy: m.y, r: m.r, fill: '#8d7b68', 'fill-opacity': 0.55 }),
        s('circle', { cx: m.x - m.r * 0.3, cy: m.y - m.r * 0.3, r: m.r * 0.35, fill: '#d7ccc8', 'fill-opacity': 0.8 })))));

    /* Adelante: destellos, luces y Zzz, que no se sientan con el cuerpo. */
    const brillo = mezclar(col.rubor, '#ffffff', 0.35);
    poner(adelante,
      adornos.includes('brillos') ? DESTELLOS.map(([x, y], i) => s('path', { class: 'chispa', d: DESTELLO, fill: adornos.includes('corona') ? '#ffd54f' : brillo, transform: `translate(${x} ${y}) scale(${0.8 + (i % 3) * 0.25})`, style: `animation-delay:${(i * 0.45).toFixed(2)}s` })) : null,
      adornos.includes('luces') ? LUCES.map(([x, y], i) => s('circle', { class: 'luz-flota', cx: x, cy: y, r: 3 + (i % 2), fill: col.rubor, style: `animation-delay:${(i * 0.6).toFixed(1)}s` })) : null,
      estado.noche ? s('g', { class: 'cuerpo-zzz', fill: col.ojos },
        /* Arriba del gorrito, pero nunca fuera del lienzo (el Pinchito es alto). */
        ['z', 'z', 'Z'].map((z, i) => s('text', { x: sil.gorro.x + 34 + i * 12, y: Math.max(sil.gorro.y, 58) - 18 - i * 14, 'font-size': 12 + i * 5, style: `animation-delay:${(i * 0.7).toFixed(1)}s` }, document.createTextNode(z)))) : null);

    if (estatico) {
      lienzo.src = imagenCara({ persona: id, rareza: estado.rareza, animo: animoVisible(), modo: estado.dormido ? 'dormida' : 'cara' });
    }
  }

  function ponerPolvo(n) {
    estado.polvo = Math.max(0, Math.min(POLVO_MAX, Math.floor(n) || 0));
    estado.motas = posicionesPolvo(id, estado.polvo, clave || id);
  }

  ponerPolvo(polvo);
  pintar();

  raiz.lienzo = lienzo;
  raiz.estado = estado;
  raiz.actualizar = (cambios = {}) => {
    const antes = { ...estado };
    if (cambios.polvo !== undefined && cambios.polvo !== estado.polvo) ponerPolvo(cambios.polvo);
    for (const k of ['rareza', 'animo', 'noche', 'dormido']) if (cambios[k] !== undefined) estado[k] = cambios[k];
    if (!estatico && lienzo.actualizar) {
      const c = {};
      if (cambios.lux !== undefined) c.lux = cambios.lux;
      if (cambios.mirada !== undefined) c.mirada = cambios.mirada;
      if (estado.rareza !== antes.rareza) c.rareza = estado.rareza;
      if (animoVisible() !== lienzo._cara.animo && !estado.dormido) c.animo = animoVisible();
      if (estado.dormido !== antes.dormido) Object.assign(c, { modo: estado.dormido ? 'dormida' : 'cara', persona: id, animo: animoVisible() });
      if (Object.keys(c).length) lienzo.actualizar(c);
    }
    pintar();
  };
  raiz.acariciar = (si) => {
    raiz.classList.toggle('mimo', Boolean(si));
    lienzo.acariciar?.(si);
  };
  raiz.limpiarEn = (x, y, radio = 18) => {
    const r = raiz.getBoundingClientRect();
    const vx = (x * ANCHO) / (r.width || 1);
    const vy = (y * ALTO) / (r.height || 1);
    const antes = estado.motas.length;
    estado.motas = estado.motas.filter((m) => Math.hypot(m.x - vx, m.y - vy) > m.r + radio);
    if (estado.motas.length === antes) return -1;
    estado.polvo = estado.motas.length;
    pintar();
    return estado.motas.length;
  };
  return raiz;
}
