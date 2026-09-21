/* formas.mjs — los cuatro Rooties, esculpidos. ARTE COMO DATOS.
 *
 * Cada criatura es una lista de bultos que se funden entre sí (esculpir.mjs).
 * No hay una sola línea de código por personaje: hay números. Rocío mueve un
 * bulto, le cambia el radio o le sube el cuello, y es otro bicho.
 *
 * EL ELENCO
 *
 *   kip    el piloto audaz: cresta de tres rulos sobre una cabeza redonda.
 *   nori   la crítica: corte bob recto con flequillo sobre el visor.
 *   blink  el cíclope: dos cuernitos redondeados y la cabeza más grande.
 *   plum   la berenjenita: cuerpo de gota con su cabito.
 *
 * TODOS TIENEN LA MISMA ARQUITECTURA
 *
 * Cabeza grande y redonda donde va la CARA, cuerpito debajo, bracitos cortos
 * y dos piecitos. Lo que los distingue es lo de arriba —la cresta, el pelo,
 * los cuernitos, el cabito— y las proporciones. Que compartan esqueleto no es
 * pereza: es lo que hace que se lean como el mismo elenco y que la misma
 * animación les quede bien a los cuatro.
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
 * bichos pueden tener pelo, cuernos y patas separadas.
 */

import { superficie, limitesDe, campo } from './esculpir.mjs';

/** De qué color se pinta cada pieza. El rubor se usa sólo en la cara. */
export const ROLES = ['cuerpo', 'acento', 'claro', 'oscuro'];

/** Qué parte del bicho mueve cada pieza. */
export const HUESOS = ['cuerpo', 'copa', 'brazo-izq', 'brazo-der'];

/* Atajos: una pata y un bracito se declaran igual en los cuatro. */
const pata = (x, z, [rx, ry, rz] = [12, 7, 14]) => ({
  tipo: 'elipsoide', en: [x, ry * 0.92, z], r: [rx, ry, rz], rol: 'cuerpo', fundir: 5,
});
const bracito = (lado, desde, hasta, ra, rb) => ({
  tipo: 'capsula', a: desde, b: hasta, ra, rb, rol: 'cuerpo',
  hueso: lado < 0 ? 'brazo-izq' : 'brazo-der', fundir: 7,
});

export const FIGURAS = {
  kip: {
    /* EL PILOTO AUDAZ. Cabeza redonda y grande, cuerpito compacto, y arriba
       la cresta: tres rulos esponjosos en fila, el del medio más alto, que le
       dan la silueta aerodinámica. No es una cabellera: son tres nubes, y por
       eso van poco fundidas entre sí, para que se cuenten. */
    cara: { y: 80, ancho: 48, alto: 48 },
    corona: [0, 118],
    piso: 0,
    piezas: [
      /* Una sola masa con la cabeza grande, como los otros tres. Se probó con
         cintura marcada, al estilo muñeco de nieve, y Kip quedaba desarmado:
         la cabeza se leía más chica que el cuerpo y perdía la silueta de
         bebé que tiene todo el elenco. */
      { tipo: 'elipsoide', en: [0, 78, 0], r: [41, 38, 37], rol: 'cuerpo' },
      { tipo: 'elipsoide', en: [0, 32, 0], r: [29, 27, 27], rol: 'cuerpo', fundir: 13 },
      { tipo: 'elipsoide', en: [0, 22, 20], r: [17, 12, 11], rol: 'claro', fundir: 10 },
      pata(-14, 12, [12, 7, 15]),
      pata(14, 12, [12, 7, 15]),
      bracito(-1, [-25, 40, 3], [-36, 29, 8], 7.5, 6),
      bracito(1, [25, 40, 3], [36, 29, 8], 7.5, 6),
      /* LA CRESTA VA DE LA FRENTE A LA NUCA, no de oreja a oreja: es una
         cresta punk, no una vincha. Tres mechones en gradación decreciente
         —el de la frente es el más grande y abombado, el de la nuca el más
         chico— y apenas pegados entre sí, porque tienen que contarse: con el
         menisco grande quedaba una masa con bultos. */
      /* Mechones ALARGADOS hacia arriba, no bolas: tres esferas iguales en
         fila se tapan entre sí y desde el frente se cuenta una sola. Con el
         perfil en arco —el frontal adelante y abajo, el del medio el más
         alto, el de la nuca chico— la cresta se lee de frente y de perfil. */
      { tipo: 'elipsoide', en: [0, 117, 28], r: [13, 16, 13], rol: 'acento', hueso: 'copa', fundir: 2 },
      { tipo: 'elipsoide', en: [0, 130, 4], r: [11.5, 17, 11.5], rol: 'acento', hueso: 'copa', fundir: 2 },
      { tipo: 'elipsoide', en: [0, 118, -19], r: [9.5, 12, 9.5], rol: 'acento', hueso: 'copa', fundir: 2 },
    ],
  },

  nori: {
    /* LA CRÍTICA. Cabeza algo más chica y ovalada, hombros marcados, y el
       corte bob: un casquete que le baja por los costados hasta la mandíbula
       y un flequillo recto que apoya sobre el borde de arriba del visor. El
       pelo es una sola pieza que envuelve: si fueran mechones sueltos
       perdería la pulcritud, que es todo su personaje. */
    cara: { y: 76, ancho: 44, alto: 44 },
    corona: [0, 116],
    piso: 0,
    piezas: [
      { tipo: 'elipsoide', en: [0, 74, 0], r: [35, 36, 33], rol: 'cuerpo' },
      { tipo: 'elipsoide', en: [0, 32, 0], r: [27, 25, 24], rol: 'cuerpo', fundir: 14 },
      { tipo: 'elipsoide', en: [0, 24, 16], r: [15, 11, 10], rol: 'claro', fundir: 10 },
      pata(-14, 12, [12, 7, 14]),
      pata(14, 12, [12, 7, 14]),
      /* En jarra: los codos hacia afuera, las manos en la cintura. */
      bracito(-1, [-24, 42, 0], [-36, 30, 2], 7, 6),
      bracito(1, [24, 42, 0], [36, 30, 2], 7, 6),
      /* El pelo va POR DETRÁS y por arriba: corrido hacia atrás y apenas más
         grande que la cabeza, para que la cara quede despejada. Envolviéndola
         entera, Nori desaparecía adentro del peinado. */
      { tipo: 'elipsoide', en: [0, 86, -10], r: [37, 30, 34], rol: 'acento', hueso: 'copa', fundir: 4 },
      /* Las dos puntas del bob, que bajan hasta la mandíbula, bien al costado. */
      { tipo: 'elipsoide', en: [-33, 64, -8], r: [10, 22, 17], rol: 'acento', hueso: 'copa', fundir: 4 },
      { tipo: 'elipsoide', en: [33, 64, -8], r: [10, 22, 17], rol: 'acento', hueso: 'copa', fundir: 4 },
      /* El flequillo: recto y fino, apoyado en el borde de arriba del visor. */
      { tipo: 'caja', en: [0, 97, 10], tam: [33, 8, 26], redondeo: 7, rol: 'acento', hueso: 'copa', fundir: 9 },
    ],
  },

  blink: {
    /* EL CÍCLOPE. La cabeza es casi todo el bicho —tiene que entrar un ojo
       enorme— y el cuerpito es apenas una base. Arriba, dos cuernitos
       redondeados: no son cuernos de pelear, son antenitas de alguien que
       está contento. Van bien separados, porque juntos parecerían orejas. */
    cara: { y: 80, ancho: 56, alto: 56 },
    corona: [0, 126],
    piso: 0,
    piezas: [
      { tipo: 'elipsoide', en: [0, 78, 0], r: [42, 40, 37], rol: 'cuerpo' },
      { tipo: 'elipsoide', en: [0, 32, 0], r: [26, 24, 24], rol: 'cuerpo', fundir: 14 },
      { tipo: 'elipsoide', en: [0, 24, 16], r: [15, 11, 10], rol: 'claro', fundir: 10 },
      pata(-14, 12, [12, 7, 14]),
      pata(14, 12, [12, 7, 14]),
      bracito(-1, [-26, 40, 2], [-38, 30, 6], 7, 5.5),
      bracito(1, [26, 40, 2], [38, 30, 6], 7, 5.5),
      /* Los cuernitos, con la punta gorda y redondeada. */
      { tipo: 'capsula', a: [-20, 108, -4], b: [-26, 126, -6], ra: 6, rb: 7, rol: 'acento', hueso: 'copa', fundir: 5 },
      { tipo: 'capsula', a: [20, 108, -4], b: [26, 126, -6], ra: 6, rb: 7, rol: 'acento', hueso: 'copa', fundir: 5 },
    ],
  },

  plum: {
    /* LA BERENJENITA. Un solo volumen con forma de gota: ancho y pesado
       abajo, angostándose hacia arriba, sin cuello. La cara va alta, sobre la
       parte más ancha. Arriba, el cabito, que es lo único que sobresale: un
       tallito corto y grueso con su hojita. Es la más compacta de las cuatro,
       y por eso la más abrazable. */
    cara: { y: 72, ancho: 46, alto: 46 },
    corona: [0, 112],
    piso: 0,
    piezas: [
      { tipo: 'elipsoide', en: [0, 58, 0], r: [38, 48, 35], rol: 'cuerpo' },
      { tipo: 'elipsoide', en: [0, 28, 0], r: [34, 28, 31], rol: 'cuerpo', fundir: 18 },
      { tipo: 'elipsoide', en: [0, 30, 22], r: [20, 14, 12], rol: 'claro', fundir: 12 },
      pata(-16, 14, [13, 7, 15]),
      pata(16, 14, [13, 7, 15]),
      bracito(-1, [-26, 46, 2], [-37, 34, 6], 7.5, 6),
      bracito(1, [26, 46, 2], [37, 34, 6], 7.5, 6),
      /* El cabito y su hojita. */
      { tipo: 'capsula', a: [0, 98, 0], b: [2, 114, 2], ra: 7, rb: 5, rol: 'oscuro', hueso: 'copa', fundir: 6 },
      { tipo: 'hoja', a: [1, 108, 1], b: [17, 122, 5], ancho: 17, grosor: 5, curva: 0.12, rol: 'oscuro', hueso: 'copa', fundir: 3 },
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
