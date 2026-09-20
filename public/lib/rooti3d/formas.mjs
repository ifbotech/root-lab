/* formas.mjs — los cinco Rooties en 3D. ARTE COMO DATOS.
 *
 * Cada figura es una tabla: un perfil que gira (el cuerpo) y una lista de
 * piezas encima (hojas, flor, sombrero, brazos, patitas). Rocío cambia un
 * número y cambia el personaje; no hay que tocar código. Los colores no están
 * acá: cada pieza dice qué ROL usa ('cuerpo', 'acento', 'claro'...) y los
 * colores salen de la piel que sorteó el cofre (core/persona.c en el
 * firmware, lib/rooties.mjs en la app).
 *
 * TODO EN MILÍMETROS DE VERDAD
 *
 * Es la figura que se imprime, no un dibujo: el mismo modelo se ve girando en
 * el teléfono, sale en STL (tools/rooties-stl.mjs) y tiene que tener lugar
 * adentro para la 18650 parada y para la pantalla de 1,44". Las tres cosas
 * las comprueba test/rooti3d.test.mjs en cada Rooti:
 *
 *   - ningún voladizo pasa de 45° (FDM sin soportes), base plana y ancha;
 *   - el centro de masa cae bajo y sobre la base: no se vuelca en la tierra;
 *   - la 18650 (75 × 21 × 19) y el módulo del TFT entran con 1,6 mm de pared;
 *   - la cara queda en una zona lo bastante plana para el vidrio del TFT.
 *
 * DE DÓNDE SALEN LAS FORMAS
 *
 * De la escuela de los juguetes de vinilo: un cuerpo simple y gordito, UN
 * rasgo que manda arriba, patitas mínimas y la cara pintada sobre el cuerpo.
 * Cada Rooti sale de una planta de verdad —una semilla germinando, un
 * almohadón de musgo con esporofitos, un cactus barril, un bulbo de cebolla,
 * un hongo con anillo— y de ahí salen su silueta y su rasgo. Qué tomamos de
 * qué y qué cambiamos a propósito está en docs/rooties.md.
 */

import { revolucion, gota, capsula, hoja, elipsoide, transformacion, limites, aplicar } from './geometria.mjs';

/** Lo que tiene que entrar adentro de cualquier Rooti (docs/carcasas.md). */
export const ENVOLVENTE = {
  /* La celda parada, con su portapilas, desde un poco más arriba del piso. */
  bateria: { ancho: 23, alto: 76, fondo: 21, desdeY: 6, z: -6 },
  /* El módulo del TFT, justo detrás de la cara. */
  pantalla: { ancho: 30, alto: 39, fondo: 6, detras: 2.2 },
  pared: 1.6,
};

/* Los roles de color que puede pedir una pieza. */
export const ROLES = ['cuerpo', 'acento', 'claro', 'oscuro', 'rubor', 'ojos'];

export const FIGURAS = {
  brote: {
    /* La semilla que germina: gordita, ancha abajo, con dos cotiledones
       redondos en V. La V no es un capricho: una hoja horizontal no se
       imprime y una que sube a 60° sí, y encima le da el gesto de brote
       recién salido. El cuerpo se mantiene lleno hasta pasados los 84 mm
       porque ahí adentro termina la celda. */
    cuerpo: {
      perfil: [[25.6, 0], [32.0, 10], [36.8, 22], [39.2, 34], [40.0, 46], [40.0, 60], [38.4, 72], [34.4, 84], [28.0, 95],
        [20.0, 104], [11.2, 111], [4.8, 115], [2.4, 117]],
      profundidad: 0.95,
    },
    cara: { y: 52, ancho: 27, alto: 27 },
    corona: [0, 120],
    pivotes: { copa: [0.0, 108, 0.0], 'brazo-izq': [-33, 56, 4.8], 'brazo-der': [33, 56, 4.8] },
    partes: [
      { id: 'tallo', tipo: 'capsula', color: 'acento', grupo: 'copa', a: [0.0, 108, 0.0], b: [0.0, 130, 1.6], r0: 5.2, r1: 4.0 },
      { id: 'hoja-izq', tipo: 'hoja', color: 'acento', grupo: 'copa', en: [0.0, 122, 1.1], giro: [8, -12, 24], largo: 33.4, ancho: 19.4, grosor: 3 },
      { id: 'hoja-der', tipo: 'hoja', color: 'acento', grupo: 'copa', en: [0.0, 120, 1.1], giro: [8, 12, -24], largo: 30.8, ancho: 17.6, grosor: 3 },
      { id: 'brazo-izq', tipo: 'gota', color: 'cuerpo', grupo: 'brazo-izq', en: [-38.5, 56, 4.8], r: 9.5, esc: [0.72, 1, 0.72] },
      { id: 'brazo-der', tipo: 'gota', color: 'cuerpo', grupo: 'brazo-der', en: [38.5, 56, 4.8], r: 9.5, esc: [0.72, 1, 0.72] },
      { id: 'pata-izq', tipo: 'elipsoide', color: 'cuerpo', en: [-13.6, 0, 22.4], r: [10.8, 9, 9.0], desdeY: 0 },
      { id: 'pata-der', tipo: 'elipsoide', color: 'cuerpo', en: [13.6, 0, 22.4], r: [10.8, 9, 9.0], desdeY: 0 },
    ],
  },

  musgo: {
    /* El almohadón: bajo, ancho y estable, con tres capas de flecos. Cada
       fleco sale hacia afuera a 45° justos y vuelve hacia adentro: así se lee
       como musgo en capas y se imprime igual. Arriba, dos esporofitos —los
       tallitos con cápsula que el musgo saca de verdad—, que son su rasgo. */
    cuerpo: {
      perfil: [[28.8, 0], [36.8, 10], [41.6, 17], [38.4, 26], [43.2, 32], [40.0, 40], [43.2, 45], [40.8, 68], [43.2, 73],
        [39.2, 84], [34.4, 94], [27.2, 103], [17.6, 110], [8.0, 114], [3.2, 116]],
      profundidad: 0.95,
    },
    cara: { y: 54, ancho: 27, alto: 27 },
    corona: [0, 118],
    pivotes: { copa: [0.0, 106, 0.0] },
    partes: [
      { id: 'espora-izq', tipo: 'capsula', color: 'oscuro', grupo: 'copa', a: [-5.6, 108, 0.0], b: [-12.0, 134, 2.4], r0: 2.1, r1: 1.7 },
      { id: 'capsula-izq', tipo: 'gota', color: 'acento', grupo: 'copa', en: [-12.0, 141, 2.4], r: 4.5 },
      { id: 'espora-der', tipo: 'capsula', color: 'oscuro', grupo: 'copa', a: [4.8, 109, -0.8], b: [10.4, 130, 1.6], r0: 2.1, r1: 1.7 },
      { id: 'capsula-der', tipo: 'gota', color: 'acento', grupo: 'copa', en: [10.4, 134.8, 1.6], r: 4.0 },
      { id: 'mata-izq', tipo: 'gota', color: 'claro', en: [-24.8, 82, 20.0], r: 6.8 },
      { id: 'mata-der', tipo: 'gota', color: 'claro', en: [24.0, 86, 20.8], r: 6.1 },
      { id: 'mata-atras', tipo: 'gota', color: 'claro', en: [4.8, 94, -25.6], r: 7.7 },
      { id: 'pata-izq', tipo: 'elipsoide', color: 'cuerpo', en: [-16.8, 0, 24.0], r: [11.6, 8, 9.9], desdeY: 0 },
      { id: 'pata-der', tipo: 'elipsoide', color: 'cuerpo', en: [16.8, 0, 24.0], r: [11.6, 8, 9.9], desdeY: 0 },
    ],
  },

  pinchito: {
    /* El cactus barril: costillas verticales, pinchitos que salen hacia
       arriba (nunca de costado: eso no se imprime), una flor arriba y un
       brazo levantado que saluda desde que lo sacás de la caja. */
    cuerpo: {
      perfil: [[22.4, 0], [28.8, 10], [32.8, 22], [35.2, 34], [36.0, 48], [36.0, 64], [34.4, 80], [30.4, 94], [24.8, 105],
        [16.0, 113], [7.2, 119], [2.4, 122]],
      profundidad: 0.98,
      costillas: { n: 10, amp: 0.05 },
    },
    cara: { y: 56, ancho: 27, alto: 27 },
    corona: [0, 125],
    pivotes: { copa: [0.0, 114, 0.0], 'brazo-der': [22, 60, 0.0] },
    partes: [
      { id: 'brazo', tipo: 'capsula', color: 'cuerpo', grupo: 'brazo-der', a: [22, 58, 0.0], b: [50, 100, 1.6], r0: 8.4, r1: 6.8 },
      { id: 'flor-centro', tipo: 'gota', color: 'rubor', grupo: 'copa', en: [0.0, 124, 0.0], r: 5.6 },
      { id: 'petalo-1', tipo: 'hoja', color: 'acento', grupo: 'copa', en: [0.0, 118, 0.0], giro: [20, 0, 0], largo: 15.8, ancho: 12.3, grosor: 2.6 },
      { id: 'petalo-2', tipo: 'hoja', color: 'acento', grupo: 'copa', en: [0.0, 118, 0.0], giro: [20, 72, 0], largo: 15.8, ancho: 12.3, grosor: 2.6 },
      { id: 'petalo-3', tipo: 'hoja', color: 'acento', grupo: 'copa', en: [0.0, 118, 0.0], giro: [20, 144, 0], largo: 15.8, ancho: 12.3, grosor: 2.6 },
      { id: 'petalo-4', tipo: 'hoja', color: 'acento', grupo: 'copa', en: [0.0, 118, 0.0], giro: [20, 216, 0], largo: 15.8, ancho: 12.3, grosor: 2.6 },
      { id: 'petalo-5', tipo: 'hoja', color: 'acento', grupo: 'copa', en: [0.0, 118, 0.0], giro: [20, 288, 0], largo: 15.8, ancho: 12.3, grosor: 2.6 },
      { id: 'pincho-1', tipo: 'capsula', color: 'claro', a: [-24.0, 70, 9.6], b: [-30.4, 82, 12.0], r0: 1.8, r1: 1.2 },
      { id: 'pincho-2', tipo: 'capsula', color: 'claro', a: [19.2, 44, 17.6], b: [24.0, 56, 21.6], r0: 1.8, r1: 1.2 },
      { id: 'pincho-3', tipo: 'capsula', color: 'claro', a: [-9.6, 26, 24.0], b: [-12.8, 38, 29.6], r0: 1.8, r1: 1.2 },
      { id: 'pincho-4', tipo: 'capsula', color: 'claro', a: [8.0, 84, 19.2], b: [10.4, 96, 22.4], r0: 1.7, r1: 1.2 },
      { id: 'pata-izq', tipo: 'elipsoide', color: 'cuerpo', en: [-12.0, 0, 19.2], r: [9.9, 8, 9.0], desdeY: 0 },
      { id: 'pata-der', tipo: 'elipsoide', color: 'cuerpo', en: [12.0, 0, 19.2], r: [9.9, 8, 9.0], desdeY: 0 },
    ],
  },

  bulbo: {
    /* El bulbo de cebolla: gajos suaves, punta arriba de la que sale un
       brote, y raicitas por patas. Es el más "mágico" de los cinco: todo lo
       que tiene apunta al cielo. */
    cuerpo: {
      perfil: [[24.0, 0], [30.4, 9], [36.0, 20], [39.2, 31], [40.0, 44], [40.0, 58], [38.4, 72], [33.6, 85], [25.6, 97],
        [16.0, 107], [8.0, 113], [2.4, 117]],
      profundidad: 0.97,
      costillas: { n: 8, amp: 0.035 },
    },
    cara: { y: 52, ancho: 27, alto: 27 },
    corona: [0, 120],
    pivotes: { copa: [0.0, 110, 0.0], 'brazo-izq': [-33, 50, 3.2], 'brazo-der': [33, 50, 3.2] },
    partes: [
      { id: 'brote', tipo: 'capsula', color: 'acento', grupo: 'copa', a: [0.0, 111, 0.0], b: [4.8, 137, 3.2], r0: 4.0, r1: 3.1 },
      { id: 'brote-hoja', tipo: 'hoja', color: 'acento', grupo: 'copa', en: [3.5, 129, 2.4], giro: [14, 20, -16], largo: 19.4, ancho: 12.3, grosor: 2.4 },
      /* La gota baja r·√2 desde su centro (el cono de 45°); las raicitas van
         justo a esa altura, para tocar la cama sin hundirse. */
      { id: 'raiz-1', tipo: 'gota', color: 'claro', en: [-20.8, 6.65, 16.0], r: 4.7 },
      { id: 'raiz-2', tipo: 'gota', color: 'claro', en: [20.8, 6.65, 14.4], r: 4.7 },
      { id: 'raiz-3', tipo: 'gota', color: 'claro', en: [0.0, 7.35, 24.8], r: 5.2 },
      { id: 'raiz-4', tipo: 'gota', color: 'claro', en: [-4.8, 6.65, -23.2], r: 4.7 },
      { id: 'brazo-izq', tipo: 'gota', color: 'cuerpo', grupo: 'brazo-izq', en: [-38.5, 50, 3.2], r: 8.8, esc: [0.72, 1, 0.72] },
      { id: 'brazo-der', tipo: 'gota', color: 'cuerpo', grupo: 'brazo-der', en: [38.5, 50, 3.2], r: 8.8, esc: [0.72, 1, 0.72] },
    ],
  },

  champi: {
    /* El honguito: tallo macizo con anillo y un sombrero de campana que le
       hace de visera a la cara. La cara va en el tallo, que es claro; el
       sombrero es el acento, con sus manchas. El sombrero se abre a 45°
       justos: es lo que lo hace imprimible de una pieza, y adentro de él
       termina de subir la celda. */
    cuerpo: {
      perfil: [[27.4, 0], [30.3, 10], [30.9, 24], [30.3, 40], [29.7, 54], [30.3, 66], [31.4, 74]],
      profundidad: 0.95,
    },
    cara: { y: 40, ancho: 27, alto: 27 },
    corona: [0, 140],
    pivotes: { copa: [0.0, 74, 0.0] },
    partes: [
      {
        id: 'sombrero',
        tipo: 'revolucion',
        color: 'acento',
        grupo: 'copa',
        perfil: [[19.4, 66], [27.4, 76], [33.1, 86], [37.7, 96], [40.0, 106], [38.3, 114], [33.1, 121], [21.7, 127], [8.0, 132]],
        profundidad: 0.95,
      },
      {
        id: 'anillo',
        tipo: 'revolucion',
        color: 'claro',
        perfil: [[26.4, 58], [32.8, 66], [27.2, 70]],
        profundidad: 0.95,
      },
      { id: 'mancha-1', tipo: 'gota', color: 'claro', grupo: 'copa', en: [-17.6, 110, 19.2], r: 5.6 },
      { id: 'mancha-2', tipo: 'gota', color: 'claro', grupo: 'copa', en: [13.6, 117, 16.0], r: 4.7 },
      { id: 'mancha-3', tipo: 'gota', color: 'claro', grupo: 'copa', en: [1.6, 122, -17.6], r: 5.2 },
      { id: 'mancha-4', tipo: 'gota', color: 'claro', grupo: 'copa', en: [24.0, 108, -7.2], r: 4.3 },
      { id: 'pata-izq', tipo: 'elipsoide', color: 'cuerpo', en: [-12.0, 0, 18.4], r: [9.9, 7, 8.2], desdeY: 0 },
      { id: 'pata-der', tipo: 'elipsoide', color: 'cuerpo', en: [12.0, 0, 18.4], r: [9.9, 7, 8.2], desdeY: 0 },
    ],
  },
};

export const ROOTIES = Object.keys(FIGURAS);

/* ------------------------------------------------------------- construir --- */
const cache = new Map();

function pieza(p, cara) {
  switch (p.tipo) {
    case 'revolucion':
      return revolucion({ perfil: p.perfil, profundidad: p.profundidad ?? 1, costillas: p.costillas || null, cara: p.cara || null });
    case 'gota':
      return gota({ r: p.r, esc: p.esc || [1, 1, 1] });
    case 'capsula':
      return capsula({ a: p.a, b: p.b, r0: p.r0, r1: p.r1 ?? null });
    case 'hoja':
      return hoja({ largo: p.largo, ancho: p.ancho, grosor: p.grosor, curva: p.curva ?? 0.18, abre: p.abre, raiz: p.raiz });
    case 'elipsoide':
      return elipsoide({ r: p.r, desdeY: p.desdeY ?? -1 });
    default:
      throw new Error(`pieza desconocida: ${p.tipo} (${cara})`);
  }
}

/**
 * La figura armada: el cuerpo y sus piezas, cada una con su malla, su matriz
 * y su `dentro(p)` en coordenadas del mundo. Se arma una sola vez por Rooti.
 */
export function construir(id) {
  if (cache.has(id)) return cache.get(id);
  const f = FIGURAS[id] || FIGURAS.brote;
  const partes = [];

  const cuerpo = revolucion({ ...f.cuerpo, cara: f.cara });
  partes.push({
    id: 'cuerpo', color: 'cuerpo', grupo: 'cuerpo', conCara: true,
    malla: cuerpo.malla, matriz: transformacion({}), dentro: cuerpo.dentro, receta: { tipo: 'revolucion', ...f.cuerpo },
  });

  for (const p of f.partes) {
    const g = pieza(p, id);
    /* Las cápsulas y las revoluciones ya vienen en coordenadas del cuerpo. */
    const propia = p.tipo === 'capsula' || p.tipo === 'revolucion';
    const matriz = propia ? transformacion({}) : transformacion({ en: p.en || [0, 0, 0], giro: p.giro || [0, 0, 0] });
    const inv = propia ? null : invertirSimple(p.en || [0, 0, 0], p.giro || [0, 0, 0]);
    partes.push({
      id: p.id,
      color: p.color,
      grupo: p.grupo || 'cuerpo',
      malla: g.malla,
      matriz,
      receta: p,
      dentro: propia ? g.dentro : (q) => g.dentro(inv(q)),
    });
  }

  const lim = partes.reduce((acc, p) => {
    const l = limites(p.malla, p.matriz);
    return {
      lo: acc ? acc.lo.map((v, i) => Math.min(v, l.lo[i])) : l.lo,
      hi: acc ? acc.hi.map((v, i) => Math.max(v, l.hi[i])) : l.hi,
    };
  }, null);

  /* Los grupos son lo que se anima: cada uno gira alrededor de su pivote, que
     es donde la pieza nace del cuerpo. Sin pivote declarado se usa el punto
     más bajo del grupo, que para una copa es exactamente el nacimiento del
     tallo; para un brazo conviene declararlo (el hombro está adentro). */
  const grupos = {};
  for (const parte of partes) {
    const g = (grupos[parte.grupo] ||= { nombre: parte.grupo, partes: [], pivote: null });
    g.partes.push(parte.id);
  }
  for (const [nombre, g] of Object.entries(grupos)) {
    if (f.pivotes && f.pivotes[nombre]) { g.pivote = f.pivotes[nombre].slice(); continue; }
    if (nombre === 'cuerpo') { g.pivote = [0, 0, 0]; continue; }
    const mias = partes.filter((p) => p.grupo === nombre);
    const l = mias.reduce((acc, p) => {
      const q = limites(p.malla, p.matriz);
      return acc ? { lo: acc.lo.map((v, i) => Math.min(v, q.lo[i])), hi: acc.hi.map((v, i) => Math.max(v, q.hi[i])) } : q;
    }, null);
    g.pivote = [(l.lo[0] + l.hi[0]) / 2, l.lo[1], (l.lo[2] + l.hi[2]) / 2];
  }

  const figura = { id, partes, grupos, cara: f.cara, corona: f.corona, limites: lim, alto: lim.hi[1] - lim.lo[1] };
  cache.set(id, figura);
  return figura;
}

/* La inversa de traslación+rotación ZXY, que es lo único que usan las piezas
   con transformación propia. */
function invertirSimple(en, giro) {
  const m = transformacion({ en, giro });
  const inv = invertirMatriz(m);
  return (p) => aplicar(inv, p);
}

function invertirMatriz(m) {
  /* Rígida: la transpuesta de la rotación y la traslación al revés. */
  const r = [m[0], m[4], m[8], m[1], m[5], m[9], m[2], m[6], m[10]];
  const t = [m[12], m[13], m[14]];
  const inv = new Float32Array(16);
  inv[0] = r[0]; inv[4] = r[1]; inv[8] = r[2];
  inv[1] = r[3]; inv[5] = r[4]; inv[9] = r[5];
  inv[2] = r[6]; inv[6] = r[7]; inv[10] = r[8];
  inv[12] = -(r[0] * t[0] + r[1] * t[1] + r[2] * t[2]);
  inv[13] = -(r[3] * t[0] + r[4] * t[1] + r[5] * t[2]);
  inv[14] = -(r[6] * t[0] + r[7] * t[1] + r[8] * t[2]);
  inv[15] = 1;
  return inv;
}

/** Si un punto del mundo está adentro de la figura (de cualquier pieza). */
export const dentroDe = (figura, p) => figura.partes.some((x) => x.dentro(p));
