/* imprimible.mjs — ¿esta figura sale de la impresora, y entra el hardware?
 *
 * El cuerpo de un Rooti no es una ilustración: es la carcasa. Este módulo mira
 * el modelo 3D y contesta las preguntas que antes se contestaban a ojo:
 *
 *   voladizos   ninguna superficie que mire hacia abajo puede pasar de 45°
 *               respecto de la vertical, o hay que imprimir con soportes y
 *               romperlos con pinza en cada unidad (docs/carcasas.md).
 *   apoyo       ninguna pieza puede empezar en el aire: o toca la cama o
 *               nace adentro de otra.
 *   base        plana, ancha, y con el centro de masa bajo y encima de ella:
 *               la maceta vive clavada en tierra blanda.
 *   hardware    la 18650 parada y el módulo del TFT tienen que entrar con su
 *               pared, o la figura es linda y no sirve.
 *   cara        el TFT es un vidrio plano: la zona de la cara no puede ser
 *               una curva pronunciada.
 *
 * LO QUE HACE QUE LA MEDIDA SEA HONESTA
 *
 * Las piezas se cruzan entre ellas (un brazo entra en el cuerpo), así que un
 * triángulo puede estar escondido: su normal no dice nada porque no existe en
 * la pieza impresa. Por eso cada pieza sabe si un punto está adentro suyo
 * (`dentro`), y sólo se miden los triángulos que quedan a la vista.
 */

import { triangulos, limites, radioEn, cruz, normalizar } from './geometria.mjs';
import { ENVOLVENTE, dentroDe } from './formas.mjs';

export const VOLADIZO_MAX = 45;      /* grados respecto de la vertical      */
export const CAMA = [220, 250, 220]; /* lo que entra en una impresora común */

const grados = (r) => (r * 180) / Math.PI;

/** Los triángulos de una pieza que quedan a la vista (no metidos en otra). */
function* visibles(figura, parte) {
  const otras = figura.partes.filter((p) => p !== parte);
  for (const t of triangulos(parte.malla, parte.matriz)) {
    const c = [(t[0][0] + t[1][0] + t[2][0]) / 3, (t[0][1] + t[1][1] + t[2][1]) / 3, (t[0][2] + t[1][2] + t[2][2]) / 3];
    if (otras.some((o) => o.dentro(c))) continue;
    yield [t, c];
  }
}

/** El voladizo de un triángulo: 0° una pared vertical, 90° un techo. */
export function voladizoDe(t) {
  const u = [t[1][0] - t[0][0], t[1][1] - t[0][1], t[1][2] - t[0][2]];
  const v = [t[2][0] - t[0][0], t[2][1] - t[0][1], t[2][2] - t[0][2]];
  const n = normalizar(cruz(u, v));
  return { grados: grados(Math.asin(Math.max(-1, Math.min(1, -n[1])))), n };
}

/** El área de un triángulo, para saber si una falla es una esquirla o una cara. */
const area = (t) => {
  const u = [t[1][0] - t[0][0], t[1][1] - t[0][1], t[1][2] - t[0][2]];
  const v = [t[2][0] - t[0][0], t[2][1] - t[0][1], t[2][2] - t[0][2]];
  const c = cruz(u, v);
  return Math.hypot(c[0], c[1], c[2]) / 2;
};

/**
 * Todos los voladizos que pasan del máximo, con su pieza y dónde están.
 * Se ignora lo que apoya en la cama (y ≈ 0), que es la cara de abajo.
 */
export function voladizos(figura, max = VOLADIZO_MAX) {
  const malos = [];
  for (const parte of figura.partes) {
    let peor = { grados: 0, donde: null, area: 0 };
    for (const [t, c] of visibles(figura, parte)) {
      if (t.every((p) => p[1] <= 0.25)) continue;          /* la base */
      const v = voladizoDe(t);
      if (v.grados <= max + 0.5) continue;
      peor = v.grados > peor.grados
        ? { grados: Math.round(v.grados * 10) / 10, donde: c.map((n) => Math.round(n * 10) / 10), area: 0 }
        : peor;
      peor.area += area(t);
    }
    if (peor.donde) malos.push({ parte: parte.id, ...peor, area: Math.round(peor.area * 100) / 100 });
  }
  return malos;
}

/** Piezas que empiezan en el aire: ni tocan la cama ni nacen adentro de otra. */
export function sinApoyo(figura) {
  const sueltas = [];
  for (const parte of figura.partes) {
    const l = limites(parte.malla, parte.matriz);
    if (l.lo[1] <= 0.4) continue;                          /* apoya en la cama */
    /* El punto más bajo de la pieza tiene que estar adentro de otra. */
    let bajo = null;
    for (const t of triangulos(parte.malla, parte.matriz)) {
      for (const p of t) if (!bajo || p[1] < bajo[1]) bajo = p;
    }
    const otras = figura.partes.filter((p) => p !== parte);
    if (!otras.some((o) => o.dentro(bajo))) sueltas.push({ parte: parte.id, donde: bajo.map((n) => Math.round(n * 10) / 10) });
  }
  return sueltas;
}

/** La base: el radio de lo que apoya y si es plana. */
export function base(figura) {
  const perfil = figura.partes[0].receta.perfil;
  const r = perfil[0][0];
  const ancho = (figura.limites.hi[0] - figura.limites.lo[0]) / 2;
  return { radio: r, proporcion: Math.round((r / ancho) * 100) / 100, plana: perfil[0][1] <= 0.001 };
}

/**
 * El centro de masa del cuerpo (sólido de revolución): ∫r²y dy / ∫r² dy. Las
 * piezas chicas mueven poco y la celda —que pesa el doble que el plástico— va
 * abajo, así que el de verdad queda todavía más bajo que este.
 */
export function centroDeMasa(figura) {
  const perfil = figura.partes[0].receta.perfil;
  let num = 0; let den = 0;
  const y0 = perfil[0][1]; const y1 = perfil[perfil.length - 1][1];
  const pasos = 400;
  for (let i = 0; i < pasos; i++) {
    const y = y0 + ((y1 - y0) * (i + 0.5)) / pasos;
    const r = radioEn(perfil, y);
    num += r * r * y; den += r * r;
  }
  return Math.round((num / den) * 10) / 10;
}

/** La superficie de la figura en (x, y) mirando de frente: hasta dónde llega. */
export function frenteEn(figura, x, y, hasta = 120) {
  let lo = 0; let hi = hasta;
  if (!figura.partes[0].dentro([x, y, 0])) return null;
  for (let i = 0; i < 24; i++) {
    const m = (lo + hi) / 2;
    if (figura.partes[0].dentro([x, y, m])) lo = m; else hi = m;
  }
  return lo;
}

/**
 * Cuánto se curva una zona del frente: la diferencia entre el punto más
 * saliente y el más hundido. Sirve dos veces:
 *
 *   la VENTANA (27 x 27): lo que se ve de la cara, que en el 3D de la app va
 *   pintada sobre la curva del cuerpo;
 *   el HUECO del módulo (32 x 41): el TFT es una plaquita plana y rígida, así
 *   que la carcasa se talla plana en toda esa zona. Esa profundidad es la del
 *   hueco, y si es mucha la cara queda metida en una cueva.
 */
export function curvaturaCara(figura, ancho = figura.cara.ancho, alto = figura.cara.alto) {
  const { y } = figura.cara;
  let min = Infinity; let max = -Infinity;
  /* min es lo más hundido de la ventana: ahí queda el vidrio cuando se talla
     la cara plana, y de ahí para atrás va el módulo. */
  for (let i = 0; i <= 6; i++) {
    for (let j = 0; j <= 6; j++) {
      const x = -ancho / 2 + (ancho * i) / 6;
      const yy = y - alto / 2 + (alto * j) / 6;
      const z = frenteEn(figura, x, yy);
      if (z === null) return { mm: Infinity, falta: [x, yy] };
      min = Math.min(min, z); max = Math.max(max, z);
    }
  }
  return {
    mm: Math.round((max - min) * 100) / 100,
    frente: Math.round(max * 10) / 10,
    plano: Math.round(min * 10) / 10,
  };
}

/** Los ocho vértices y los centros de las caras de una caja. */
function puntosCaja({ centro, tamano }) {
  const [cx, cy, cz] = centro;
  const [sx, sy, sz] = tamano.map((v) => v / 2);
  const p = [];
  for (const dx of [-1, 0, 1]) {
    for (const dy of [-1, 0, 1]) {
      for (const dz of [-1, 0, 1]) p.push([cx + dx * sx, cy + dy * sy, cz + dz * sz]);
    }
  }
  return p;
}

/** ¿Entran la celda y la pantalla, con su pared? */
export function entraElHardware(figura, env = ENVOLVENTE) {
  const b = env.bateria;
  const bateria = {
    centro: [0, b.desdeY + b.alto / 2, b.z],
    tamano: [b.ancho + env.pared * 2, b.alto + env.pared * 2, b.fondo + env.pared * 2],
  };
  /* El vidrio va en la cara plana que se talla al frente, a la altura de lo
     más hundido del HUECO (el módulo entero, no sólo la ventana); el módulo,
     detrás de eso. */
  const s = env.pantalla;
  const plano = curvaturaCara(figura, s.ancho + env.pared, s.alto + env.pared).plano;
  const pantalla = {
    centro: [0, figura.cara.y, plano - env.pantalla.detras - s.fondo / 2],
    tamano: [s.ancho + env.pared, s.alto + env.pared, s.fondo],
  };
  const revisar = (caja) => puntosCaja(caja).filter((p) => !dentroDe(figura, p));
  const fueraBateria = revisar(bateria);
  const fueraPantalla = revisar(pantalla);
  /* Y que no se pisen entre ellas. */
  const choque = Math.abs(bateria.centro[2] - pantalla.centro[2]) * 2
    < bateria.tamano[2] + pantalla.tamano[2]
    && Math.abs(bateria.centro[1] - pantalla.centro[1]) * 2 < bateria.tamano[1] + pantalla.tamano[1];
  return {
    bateria: fueraBateria.length === 0,
    pantalla: fueraPantalla.length === 0,
    choque,
    detalle: { bateria: fueraBateria.slice(0, 3), pantalla: fueraPantalla.slice(0, 3) },
  };
}

/** El grosor mínimo de las piezas finas: menos de 1,6 mm no se imprime bien. */
export function grosorMinimo(figura) {
  let min = Infinity;
  for (const p of figura.partes) {
    const r = p.receta;
    if (r.tipo === 'hoja') min = Math.min(min, r.grosor);
    if (r.tipo === 'capsula') min = Math.min(min, 2 * Math.min(r.r0, r.r1 ?? r.r0));
  }
  return min === Infinity ? null : Math.round(min * 100) / 100;
}

/** El informe completo de una figura. */
export function analizar(figura) {
  const l = figura.limites;
  const tamano = [l.hi[0] - l.lo[0], l.hi[1] - l.lo[1], l.hi[2] - l.lo[2]].map((v) => Math.round(v * 10) / 10);
  return {
    id: figura.id,
    tamano,
    entraEnLaCama: tamano.every((v, i) => v <= CAMA[i]),
    voladizos: voladizos(figura),
    sinApoyo: sinApoyo(figura),
    base: base(figura),
    centroDeMasa: centroDeMasa(figura),
    cara: curvaturaCara(figura),
    hueco: curvaturaCara(figura, ENVOLVENTE.pantalla.ancho + ENVOLVENTE.pared, ENVOLVENTE.pantalla.alto + ENVOLVENTE.pared),
    hardware: entraElHardware(figura),
    grosorMinimo: grosorMinimo(figura),
    triangulos: figura.partes.reduce((n, p) => n + p.malla.idx.length / 3, 0),
  };
}

/* ------------------------------------------------------------------ STL --- */
/** La figura entera como STL binario, en milímetros, lista para el slicer. */
export function stlBinario(figura, titulo = '') {
  const tris = [];
  for (const parte of figura.partes) {
    for (const t of triangulos(parte.malla, parte.matriz)) tris.push(t);
  }
  const buf = new ArrayBuffer(84 + tris.length * 50);
  const v = new DataView(buf);
  const cab = new TextEncoder().encode(`ROOTKIT ${figura.id} ${titulo}`.slice(0, 79));
  new Uint8Array(buf, 0, 80).set(cab);
  v.setUint32(80, tris.length, true);
  let o = 84;
  for (const t of tris) {
    const { n } = voladizoDe(t);
    v.setFloat32(o, n[0], true); v.setFloat32(o + 4, n[1], true); v.setFloat32(o + 8, n[2], true);
    o += 12;
    for (const p of t) {
      v.setFloat32(o, p[0], true); v.setFloat32(o + 4, p[1], true); v.setFloat32(o + 8, p[2], true);
      o += 12;
    }
    v.setUint16(o, 0, true);
    o += 2;
  }
  return new Uint8Array(buf);
}
