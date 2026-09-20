/* formas.mjs — los cinco Rooties, esculpidos. ARTE COMO DATOS.
 *
 * Cada criatura es una lista de bultos que se funden entre sí (esculpir.mjs).
 * No hay una sola línea de código por personaje: hay números. Rocío mueve un
 * bulto, le cambia el radio o le sube el cuello, y es otro bicho.
 *
 * CÓMO ESTÁ ARMADO UN ROOTI
 *
 * La receta de un cuerpo se lee de abajo hacia arriba, como se lo dibujaría:
 *
 *   ancas      el bulto de abajo, el más ancho: es lo que lo hace parecer
 *              pesado y bien plantado, y lo que le da la pose de juguete;
 *   torso      el bulto de arriba, donde va la cara. La fusión de los dos
 *              hace el cogote solo, sin modelarlo;
 *   patitas    dos bultos achatados apoyados en el piso, un poco adelante:
 *              si van justo abajo, el bicho parece un huevo;
 *   bracitos   dos cápsulas cortas que SALEN del torso. La fusión les hace el
 *              hombro;
 *   la copa    lo que lleva arriba y lo identifica: hojas, flor, esporas,
 *              sombrero, brote;
 *   manchas    bultos metidos adentro del cuerpo, que no cambian la forma
 *              pero sí el color: la panza clara, las pintas del sombrero.
 *
 * LOS CAMPOS DE UNA PIEZA
 *
 *   tipo       esfera | elipsoide | capsula | caja | toro | hoja
 *   rol        de qué color se pinta: cuerpo, acento, claro, oscuro
 *   hueso      qué parte la mueve: cuerpo, copa, brazo-izq, brazo-der
 *   fundir     cuántos milímetros de menisco con lo que ya había. Un número
 *              grande derrite la pieza en el cuerpo; uno chico la deja
 *              asomar como un bulto aparte
 *
 * NO SE IMPRIME NADA DE ESTO
 *
 * Es el personaje de la app. Las carcasas se diseñan aparte, y por eso acá los
 * bichos pueden tener patas separadas, brazos en alto y sombreros voladores.
 */

import { superficie, limitesDe, campo } from './esculpir.mjs';

/** De qué color se pinta cada pieza. El rubor se usa sólo en la cara. */
export const ROLES = ['cuerpo', 'acento', 'claro', 'oscuro'];

/** Qué parte del bicho mueve cada pieza. */
export const HUESOS = ['cuerpo', 'copa', 'brazo-izq', 'brazo-der'];

/* Atajos para no repetir: una pata y un bracito se declaran igual siempre. */
const pata = (x, z, [rx, ry, rz] = [13, 7.5, 15]) => ({
  tipo: 'elipsoide', en: [x, ry * 0.92, z], r: [rx, ry, rz], rol: 'cuerpo', fundir: 5,
});
const bracito = (lado, desde, hasta, ra, rb) => ({
  tipo: 'capsula', a: desde, b: hasta, ra, rb, rol: 'cuerpo',
  hueso: lado < 0 ? 'brazo-izq' : 'brazo-der', fundir: 7,
});

export const FIGURAS = {
  brote: {
    /* LA SEMILLA QUE GERMINA. Un bichito con forma de pera al revés: ancas
       anchas, torso más chico y dos cotiledones enormes que le hacen de pelo.
       Es el más "bebé" de los cinco, así que cabeza grande y brazos cortitos. */
    cara: { y: 72, ancho: 36, alto: 36 },
    corona: [0, 104],
    piso: 0,
    piezas: [
      { tipo: 'elipsoide', en: [0, 32, -1], r: [33, 29, 29], rol: 'cuerpo' },
      { tipo: 'elipsoide', en: [0, 68, 2], r: [29, 29, 26], rol: 'cuerpo', fundir: 20 },
      /* La panza clara: no cambia la forma, sólo el color. */
      { tipo: 'elipsoide', en: [0, 30, 17], r: [20, 13, 15], rol: 'claro', fundir: 10 },
      pata(-17, 12, [13, 7.5, 16]),
      pata(17, 12, [13, 7.5, 16]),
      bracito(-1, [-24, 56, 4], [-36, 44, 9], 7.5, 6),
      bracito(1, [24, 56, 4], [36, 44, 9], 7.5, 6),
      /* El tallito y los dos cotiledones, que es lo que se ve de lejos. */
      { tipo: 'capsula', a: [0, 88, 0], b: [0, 103, 2], ra: 5, rb: 4, rol: 'acento', hueso: 'copa', fundir: 6 },
      { tipo: 'hoja', a: [-1, 99, 1], b: [-21, 130, 5], ancho: 28, grosor: 6, curva: 0.1, rol: 'acento', hueso: 'copa', fundir: 4 },
      { tipo: 'hoja', a: [1, 100, 1], b: [22, 127, 2], ancho: 26, grosor: 6, curva: 0.12, rol: 'acento', hueso: 'copa', fundir: 4 },
    ],
  },

  musgo: {
    /* EL ALMOHADON. Bajo, ancho y con tres monticulos bien marcados: es una
       mata de musgo, y una mata tiene bultos. Si se funden de mas queda un
       sillon. No tiene cuello: la cara va en el frente del monton. Los dos
       esporofitos -los tallitos con capsula que el musgo saca- son su firma. */
    cara: { y: 47, ancho: 34, alto: 34 },
    corona: [0, 96],
    piso: 0,
    piezas: [
      { tipo: 'elipsoide', en: [0, 26, 0], r: [38, 24, 32], rol: 'cuerpo' },
      { tipo: 'esfera', en: [-20, 44, -6], r: 18, rol: 'cuerpo', fundir: 7 },
      { tipo: 'esfera', en: [14, 48, 2], r: 15, rol: 'cuerpo', fundir: 7 },
      { tipo: 'esfera', en: [3, 40, -22], r: 15, rol: 'cuerpo', fundir: 7 },
      { tipo: 'esfera', en: [-6, 52, 6], r: 13, rol: 'cuerpo', fundir: 9 },
      /* Los claros del musgo: manchas de color sobre los monticulos. */
      { tipo: 'esfera', en: [-26, 52, -8], r: 10, rol: 'claro', fundir: 6 },
      { tipo: 'esfera', en: [20, 56, 0], r: 8, rol: 'claro', fundir: 6 },
      { tipo: 'elipsoide', en: [0, 12, 26], r: [20, 9, 10], rol: 'claro', fundir: 8 },
      pata(-20, 20, [12, 6.5, 13]),
      pata(20, 20, [12, 6.5, 13]),
      bracito(-1, [-30, 26, 8], [-40, 16, 12], 7, 5.5),
      bracito(1, [30, 26, 8], [40, 16, 12], 7, 5.5),
      { tipo: 'capsula', a: [-9, 50, -2], b: [-16, 86, 2], ra: 2.6, rb: 2, rol: 'oscuro', hueso: 'copa', fundir: 2 },
      { tipo: 'elipsoide', en: [-16, 91, 2], r: [6, 8, 6], rol: 'acento', hueso: 'copa', fundir: 2 },
      { tipo: 'capsula', a: [6, 52, -3], b: [12, 80, 1], ra: 2.4, rb: 1.9, rol: 'oscuro', hueso: 'copa', fundir: 2 },
      { tipo: 'elipsoide', en: [12, 84.5, 1], r: [5, 7, 5], rol: 'acento', hueso: 'copa', fundir: 2 },
    ],
  },

  pinchito: {
    /* EL CACTUS. Un barril: ancho en la panza y mas angosto arriba y abajo.
       Es el unico que levanta el brazo, y saluda desde que lo sacas de la
       caja. Las costillas son lomos suaves, no zanjas: probamos restarlas y el
       cuerpo se partia en tentaculos. */
    cara: { y: 60, ancho: 34, alto: 34 },
    corona: [0, 104],
    piso: 0,
    piezas: [
      { tipo: 'elipsoide', en: [0, 52, 0], r: [31, 40, 28], rol: 'cuerpo' },
      { tipo: 'elipsoide', en: [0, 24, 0], r: [28, 20, 26], rol: 'cuerpo', fundir: 16 },
      { tipo: 'elipsoide', en: [0, 28, 21], r: [16, 11, 11], rol: 'claro', fundir: 10 },
      pata(-16, 16, [12, 6.5, 13]),
      pata(16, 16, [12, 6.5, 13]),
      /* El brazo que saluda: dos capsulas, y el codo lo hace la fusion. */
      { tipo: 'capsula', a: [22, 58, 0], b: [38, 64, 0], ra: 9.5, rb: 8.5, rol: 'cuerpo', hueso: 'brazo-der', fundir: 8 },
      { tipo: 'capsula', a: [38, 64, 0], b: [41, 88, 1], ra: 8.5, rb: 7.5, rol: 'cuerpo', hueso: 'brazo-der', fundir: 8 },
      { tipo: 'capsula', a: [-22, 48, 0], b: [-38, 40, 3], ra: 8.5, rb: 7, rol: 'cuerpo', hueso: 'brazo-izq', fundir: 8 },
      /* La flor, corrida: centrada pareceria un sombrero. */
      { tipo: 'esfera', en: [2, 92, 2], r: 8, rol: 'oscuro', hueso: 'copa', fundir: 4 },
      { tipo: 'hoja', a: [2, 90, 2], b: [-12, 103, 2], ancho: 14, grosor: 5, curva: 0.05, rol: 'acento', hueso: 'copa', fundir: 2 },
      { tipo: 'hoja', a: [2, 90, 2], b: [15, 102, 4], ancho: 14, grosor: 5, curva: 0.05, rol: 'acento', hueso: 'copa', fundir: 2 },
      { tipo: 'hoja', a: [2, 90, 2], b: [3, 106, -9], ancho: 14, grosor: 5, curva: 0.05, rol: 'acento', hueso: 'copa', fundir: 2 },
      { tipo: 'hoja', a: [2, 90, 2], b: [0, 103, 13], ancho: 14, grosor: 5, curva: 0.05, rol: 'acento', hueso: 'copa', fundir: 2 },
      /* Cuatro pinchitos, casi sin fundir: tienen que verse como pinchos. */
      { tipo: 'capsula', a: [-26, 60, 10], b: [-33, 70, 13], ra: 2.4, rb: 1, rol: 'claro', fundir: 2 },
      { tipo: 'capsula', a: [21, 38, 18], b: [26, 48, 23], ra: 2.4, rb: 1, rol: 'claro', fundir: 2 },
      { tipo: 'capsula', a: [-10, 30, 25], b: [-13, 40, 31], ra: 2.4, rb: 1, rol: 'claro', fundir: 2 },
      { tipo: 'capsula', a: [9, 72, 19], b: [12, 82, 23], ra: 2.2, rb: 1, rol: 'claro', fundir: 2 },
    ],
    /* Las costillas: ocho lomos suaves alrededor de la panza. */
    extras: Array.from({ length: 8 }, (_, i) => {
      const a = (i / 8) * Math.PI * 2 + 0.4;
      return {
        tipo: 'capsula',
        a: [Math.sin(a) * 27, 26, Math.cos(a) * 25],
        b: [Math.sin(a) * 24, 82, Math.cos(a) * 22],
        ra: 4, rb: 3, rol: 'cuerpo', fundir: 7,
      };
    }),
  },

  bulbo: {
    /* EL BULBO. Una gota gorda que termina en punta, parada sobre sus propias
       raices, con un brote saliendole de la cabeza. Es el mas "magico": todo
       lo que tiene apunta al cielo. Las raices van poco fundidas, para que se
       lean como raices y no como una pollera. */
    cara: { y: 48, ancho: 34, alto: 34 },
    corona: [0, 100],
    piso: 0,
    piezas: [
      { tipo: 'elipsoide', en: [0, 44, 0], r: [33, 36, 30], rol: 'cuerpo' },
      { tipo: 'capsula', a: [0, 68, 0], b: [0, 92, 1], ra: 17, rb: 3, rol: 'cuerpo', fundir: 14 },
      { tipo: 'elipsoide', en: [0, 26, 22], r: [18, 12, 12], rol: 'claro', fundir: 10 },
      /* Las raices, que tambien son las patas: tocan el piso. */
      { tipo: 'capsula', a: [-13, 24, 5], b: [-24, 0, 13], ra: 7, rb: 5, rol: 'claro', fundir: 4 },
      { tipo: 'capsula', a: [13, 24, 3], b: [25, 0, 10], ra: 7, rb: 5, rol: 'claro', fundir: 4 },
      { tipo: 'capsula', a: [0, 22, -8], b: [3, 0, -20], ra: 7, rb: 5, rol: 'claro', fundir: 4 },
      { tipo: 'capsula', a: [-3, 20, 12], b: [-5, 0, 22], ra: 6.5, rb: 5, rol: 'claro', fundir: 4 },
      bracito(-1, [-26, 48, 4], [-38, 36, 9], 7.5, 6),
      bracito(1, [26, 48, 4], [38, 36, 9], 7.5, 6),
      { tipo: 'capsula', a: [0, 86, 0], b: [5, 108, 3], ra: 4, rb: 3, rol: 'acento', hueso: 'copa', fundir: 5 },
      { tipo: 'hoja', a: [4, 102, 2], b: [20, 116, 6], ancho: 16, grosor: 5, curva: 0.12, rol: 'acento', hueso: 'copa', fundir: 2 },
    ],
  },

  champi: {
    /* EL HONGO. Tallo corto y gordo, sombrero grande de campana que le hace de
       visera, y su anillo. La cara va en el tallo, que es el color claro; el
       sombrero es el acento y lleva las pintas. El sombrero es lo que más pesa
       visualmente, así que el tallo es bien ancho: fino parecería que se lo
       lleva el viento. */
    cara: { y: 42, ancho: 32, alto: 32 },
    corona: [0, 96],
    piso: 0,
    piezas: [
      { tipo: 'capsula', a: [0, 16, 0], b: [0, 60, 0], ra: 24, rb: 21, rol: 'cuerpo' },
      { tipo: 'elipsoide', en: [0, 16, 17], r: [15, 9, 9], rol: 'claro', fundir: 9 },
      pata(-14, 16, [12, 6, 13]),
      pata(14, 16, [12, 6, 13]),
      bracito(-1, [-20, 38, 4], [-32, 28, 8], 7, 5.5),
      bracito(1, [20, 38, 4], [32, 28, 8], 7, 5.5),
      /* El anillo, justo debajo del ala. */
      { tipo: 'toro', en: [0, 58, 0], R: 22, r: 4.5, rol: 'claro', hueso: 'copa', fundir: 5 },
      /* El sombrero: una campana, no una bola. La cápsula que se abre hacia
         arriba le hace la caída del ala. */
      { tipo: 'capsula', a: [0, 62, 0], b: [0, 78, 0], ra: 22, rb: 40, rol: 'acento', hueso: 'copa', fundir: 8 },
      { tipo: 'elipsoide', en: [0, 80, 0], r: [42, 20, 38], rol: 'acento', hueso: 'copa', fundir: 10 },
      /* Las pintas: bultos de color metidos en el sombrero. */
      { tipo: 'esfera', en: [-24, 88, 16], r: 9, rol: 'claro', hueso: 'copa', fundir: 6 },
      { tipo: 'esfera', en: [18, 92, 10], r: 7.5, rol: 'claro', hueso: 'copa', fundir: 6 },
      { tipo: 'esfera', en: [2, 94, -18], r: 8, rol: 'claro', hueso: 'copa', fundir: 6 },
      { tipo: 'esfera', en: [30, 84, -14], r: 7, rol: 'claro', hueso: 'copa', fundir: 6 },
      { tipo: 'esfera', en: [-32, 82, -6], r: 7, rol: 'claro', hueso: 'copa', fundir: 6 },
    ],
  },
};

export const ROOTIES = Object.keys(FIGURAS);

/* ------------------------------------------------------------ construir --- */
const cache = new Map();

/**
 * La figura lista para dibujar: una sola malla, con el rol de color y el
 * hueso de cada vértice. Se esculpe una vez por Rooti y se guarda.
 *
 * `paso` es el tamaño de la grilla en milímetros: 2,4 da mallas de unos
 * veinte mil triángulos y tarda un par de décimas. Más fino no se nota.
 */
export function construir(id, { paso = 2.4 } = {}) {
  const clave = `${id}/${paso}`;
  if (cache.has(clave)) return cache.get(clave);
  const base = FIGURAS[id] || FIGURAS.brote;
  /* `extras` es una lista que se calcula (las costillas del cactus): va al
     final, despues de los bultos declarados a mano. */
  const receta = base.extras ? { ...base, piezas: [...base.piezas, ...base.extras] } : base;
  const reloj = typeof performance !== 'undefined' ? performance : { now: () => 0 };
  const t0 = reloj.now();
  const malla = superficie(receta, { paso, huesos: HUESOS, roles: ROLES, cara: receta.cara });
  const lim = medir(malla);
  const figura = {
    id,
    malla,
    cara: receta.cara,
    corona: receta.corona,
    limites: lim,
    alto: lim.hi[1] - lim.lo[1],
    /* Dónde pivota cada hueso: la copa, donde nace su pieza más baja; los
       brazos, en el hombro. Sale de la receta, así que mover un bulto mueve
       también su pivote. */
    pivotes: pivotesDe(receta),
    ms: Math.round(reloj.now() - t0),
  };
  cache.set(clave, figura);
  return figura;
}

function medir(malla) {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < malla.pos.length; i += 3) {
    for (let j = 0; j < 3; j++) {
      lo[j] = Math.min(lo[j], malla.pos[i + j]);
      hi[j] = Math.max(hi[j], malla.pos[i + j]);
    }
  }
  return { lo, hi };
}

function pivotesDe(receta) {
  const p = { cuerpo: [0, 0, 0] };
  for (const hueso of ['copa', 'brazo-izq', 'brazo-der']) {
    const mias = receta.piezas.filter((z) => z.hueso === hueso);
    if (!mias.length) continue;
    let mejor = null;
    for (const pieza of mias) {
      const punto = pieza.a || pieza.en;
      if (!mejor || punto[1] < mejor[1]) mejor = punto;
    }
    p[hueso] = mejor.slice();
  }
  return p;
}

/** ¿Este punto está adentro de la criatura? Lo usan las pruebas. */
export function dentroDe(figura, punto) {
  const base = FIGURAS[figura.id] || FIGURAS.brote;
  const receta = base.extras ? { ...base, piezas: [...base.piezas, ...base.extras] } : base;
  return campo(receta, HUESOS, ROLES).distancia(punto[0], punto[1], punto[2]) <= 0;
}

export { limitesDe };
