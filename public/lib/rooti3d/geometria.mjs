/* geometria.mjs — las piezas con las que está hecho un Rooti en 3D.
 *
 * TODO EN MILÍMETROS, Y TODO IMPRIMIBLE
 *
 * Las medidas son las de la figura de verdad: el mismo modelo que se ve
 * girando en el teléfono es el que sale de la impresora (tools/rooties-stl.mjs)
 * y el que tiene que tener lugar adentro para la 18650 y la pantalla. Por eso
 * cada primitiva es una que FDM sabe imprimir sin soportes:
 *
 *   revolucion  un perfil que gira: el cuerpo. Su voladizo es la pendiente
 *               del perfil, que se mide igual que en las siluetas de antes.
 *   gota        media esfera arriba y un cono de 45° abajo. Es la forma de
 *               los bultos (brazos, matas, patitas): un bulto redondo de
 *               verdad tendría la panza mirando al piso.
 *   capsula     un tubo que puede afinarse: tallos, cuernos, brazos. Sólo
 *               vale si sube (la prueba mide su inclinación).
 *   hoja        una placa elíptica con espesor: hojas, pétalos. Va inclinada
 *               45° o más, y su raíz queda adentro del cuerpo.
 *
 * SIN DEPENDENCIAS
 *
 * Ni three.js ni nada: el proyecto no trae bibliotecas de terceros, la app
 * pesa 89 KB comprimida y una biblioteca 3D la duplicaría para dibujar cinco
 * bichos hechos de esferas. Son cuatro primitivas, un par de matrices y un
 * shader de veinte líneas (motor.mjs).
 *
 * Cada pieza devuelve su malla Y una función `dentro(p)`: con eso se sabe qué
 * triángulo está escondido adentro de otra pieza, que es lo que hace que la
 * prueba de voladizos mida la superficie de verdad y no las costuras.
 */

/* ------------------------------------------------------------- matrices --- */
export const identidad = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

/** a · b, en columna-mayor (como las quiere WebGL). */
export function multiplicar(a, b) {
  const m = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let f = 0; f < 4; f++) {
      m[c * 4 + f] = a[f] * b[c * 4] + a[4 + f] * b[c * 4 + 1] + a[8 + f] * b[c * 4 + 2] + a[12 + f] * b[c * 4 + 3];
    }
  }
  return m;
}

export const trasladar = (x, y, z) => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
export const escalar = (x, y = x, z = x) => new Float32Array([x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1]);

export function rotarX(a) {
  const c = Math.cos(a); const s = Math.sin(a);
  return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]);
}
export function rotarY(a) {
  const c = Math.cos(a); const s = Math.sin(a);
  return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]);
}
export function rotarZ(a) {
  const c = Math.cos(a); const s = Math.sin(a);
  return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

/** Traslación + rotación ZXY + escala, que es todo lo que usa una pieza. */
export function transformacion({ en = [0, 0, 0], giro = [0, 0, 0], esc = [1, 1, 1] } = {}) {
  const g = giro.map((d) => (d * Math.PI) / 180);
  let m = trasladar(en[0], en[1], en[2]);
  m = multiplicar(m, rotarY(g[1]));
  m = multiplicar(m, rotarX(g[0]));
  m = multiplicar(m, rotarZ(g[2]));
  return multiplicar(m, escalar(esc[0], esc[1], esc[2]));
}

export function aplicar(m, [x, y, z]) {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ];
}

/** La inversa de una transformación rígida con escala uniforme por eje. */
export function invertir(m) {
  /* Se separa en escala por columna, rotación y traslación: alcanza para lo
     que arma `transformacion` y evita un solver general. */
  const ex = Math.hypot(m[0], m[1], m[2]) || 1;
  const ey = Math.hypot(m[4], m[5], m[6]) || 1;
  const ez = Math.hypot(m[8], m[9], m[10]) || 1;
  const r = [m[0] / ex, m[1] / ex, m[2] / ex, m[4] / ey, m[5] / ey, m[6] / ey, m[8] / ez, m[9] / ez, m[10] / ez];
  const t = [m[12], m[13], m[14]];
  /* p_local = R^T (p - t) / escala */
  return (p) => {
    const d = [p[0] - t[0], p[1] - t[1], p[2] - t[2]];
    return [
      (r[0] * d[0] + r[1] * d[1] + r[2] * d[2]) / ex,
      (r[3] * d[0] + r[4] * d[1] + r[5] * d[2]) / ey,
      (r[6] * d[0] + r[7] * d[1] + r[8] * d[2]) / ez,
    ];
  };
}

export function perspectiva(fovGrados, aspecto, cerca, lejos) {
  const f = 1 / Math.tan((fovGrados * Math.PI) / 360);
  const m = new Float32Array(16);
  m[0] = f / aspecto; m[5] = f; m[11] = -1;
  m[10] = (lejos + cerca) / (cerca - lejos);
  m[14] = (2 * lejos * cerca) / (cerca - lejos);
  return m;
}

export function mirarDesde(ojo, centro, arriba = [0, 1, 0]) {
  const z = normalizar([ojo[0] - centro[0], ojo[1] - centro[1], ojo[2] - centro[2]]);
  const x = normalizar(cruz(arriba, z));
  const y = cruz(z, x);
  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -(x[0] * ojo[0] + x[1] * ojo[1] + x[2] * ojo[2]),
    -(y[0] * ojo[0] + y[1] * ojo[1] + y[2] * ojo[2]),
    -(z[0] * ojo[0] + z[1] * ojo[1] + z[2] * ojo[2]), 1,
  ]);
}

export const cruz = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export function normalizar(v) {
  const n = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / n, v[1] / n, v[2] / n];
}

/* ---------------------------------------------------------------- malla --- */
/** Una malla vacía a la que se le van agregando triángulos. */
export function malla() {
  return { pos: [], nor: [], uv: [], idx: [] };
}

export function vertice(m, p, n = [0, 1, 0], uv = [0, 0]) {
  m.pos.push(p[0], p[1], p[2]);
  m.nor.push(n[0], n[1], n[2]);
  m.uv.push(uv[0], uv[1]);
  return m.pos.length / 3 - 1;
}

export const triangulo = (m, a, b, c) => m.idx.push(a, b, c);

/** Rejilla de (filas × columnas) vértices ya cargados: los une en quads. */
export function tejer(m, base, filas, columnas, cerrada = true) {
  for (let f = 0; f < filas - 1; f++) {
    for (let c = 0; c < columnas - (cerrada ? 0 : 1); c++) {
      const c1 = (c + 1) % columnas;
      const a = base + f * columnas + c;
      const b = base + f * columnas + c1;
      const d = base + (f + 1) * columnas + c;
      const e = base + (f + 1) * columnas + c1;
      triangulo(m, a, b, e);
      triangulo(m, a, e, d);
    }
  }
}

/**
 * Cierra una superficie de revolución en un polo con un abanico.
 *
 * Es tentador dejar que el anillo del polo tenga radio cero y que `tejer` lo
 * cosa igual, pero entonces esa vuelta entera son triángulos de área cero: no
 * se ven, no cambian el volumen, y son basura que después aparece en el STL y
 * que algunos laminadores reportan como malla rota.
 */
export function abanico(m, base, segmentos, apice, hacia) {
  const c = vertice(m, apice, [0, hacia, 0]);
  for (let s = 0; s < segmentos; s++) {
    const a = base + s;
    const b = base + ((s + 1) % segmentos);
    if (hacia < 0) triangulo(m, c, b, a); else triangulo(m, c, a, b);
  }
  return c;
}

/** Normales suavizadas por área (las caras grandes pesan más). */
export function suavizar(m) {
  const n = new Float32Array(m.pos.length);
  for (let i = 0; i < m.idx.length; i += 3) {
    const [a, b, c] = [m.idx[i] * 3, m.idx[i + 1] * 3, m.idx[i + 2] * 3];
    const u = [m.pos[b] - m.pos[a], m.pos[b + 1] - m.pos[a + 1], m.pos[b + 2] - m.pos[a + 2]];
    const v = [m.pos[c] - m.pos[a], m.pos[c + 1] - m.pos[a + 1], m.pos[c + 2] - m.pos[a + 2]];
    const f = cruz(u, v);
    for (const k of [a, b, c]) { n[k] += f[0]; n[k + 1] += f[1]; n[k + 2] += f[2]; }
  }
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
    m.nor[i] = n[i] / l; m.nor[i + 1] = n[i + 1] / l; m.nor[i + 2] = n[i + 2] / l;
  }
  return m;
}

/** La malla lista para WebGL. */
export function empaquetar(m) {
  return {
    pos: new Float32Array(m.pos),
    nor: new Float32Array(m.nor),
    uv: new Float32Array(m.uv),
    idx: m.pos.length / 3 > 65535 ? new Uint32Array(m.idx) : new Uint16Array(m.idx),
    triangulos: m.idx.length / 3,
  };
}

/** Los triángulos de una malla en coordenadas del mundo. */
export function* triangulos(m, matriz = null) {
  const p = (i) => {
    const v = [m.pos[i * 3], m.pos[i * 3 + 1], m.pos[i * 3 + 2]];
    return matriz ? aplicar(matriz, v) : v;
  };
  for (let i = 0; i < m.idx.length; i += 3) yield [p(m.idx[i]), p(m.idx[i + 1]), p(m.idx[i + 2])];
}

/**
 * El volumen que encierra una malla cerrada (teorema de la divergencia). Es
 * la forma barata de saber si los triángulos miran hacia afuera: si una malla
 * quedó cosida al revés, da negativo, y con ella mentirían las normales, la
 * luz del 3D y la medida de los voladizos.
 */
export function volumenConSigno(m, matriz = null) {
  let v = 0;
  for (const [a, b, c] of triangulos(m, matriz)) {
    v += (a[0] * (b[1] * c[2] - b[2] * c[1])
        - a[1] * (b[0] * c[2] - b[2] * c[0])
        + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
  }
  return v;
}

export function limites(m, matriz = null) {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < m.pos.length; i += 3) {
    const v = matriz ? aplicar(matriz, [m.pos[i], m.pos[i + 1], m.pos[i + 2]]) : [m.pos[i], m.pos[i + 1], m.pos[i + 2]];
    for (let k = 0; k < 3; k++) { if (v[k] < lo[k]) lo[k] = v[k]; if (v[k] > hi[k]) hi[k] = v[k]; }
  }
  return { lo, hi };
}

/* ----------------------------------------------------------- primitivas --- */
/** El radio del perfil a la altura `y`, interpolando entre puntos. */
export function radioEn(perfil, y) {
  if (y <= perfil[0][1]) return perfil[0][0];
  for (let i = 1; i < perfil.length; i++) {
    const [r0, y0] = perfil[i - 1];
    const [r1, y1] = perfil[i];
    if (y <= y1) return y1 === y0 ? r1 : r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
  }
  return perfil[perfil.length - 1][0];
}

/**
 * Un perfil que gira: el cuerpo de casi todos los Rooties.
 *
 *   perfil      [[r, y], ...] de abajo hacia arriba, en mm
 *   profundidad cuánto se achata de adelante hacia atrás (1 = redondo)
 *   costillas   { n, amp }: ondas verticales (el cactus). Se apagan solas
 *               cerca del frente: ahí va el vidrio del TFT, que es plano, y
 *               una costilla en el medio de la cara obliga a tallar un hueco
 *               el doble de profundo.
 *   cara        { y, ancho, alto }: dónde va la cara, para las UV
 */
export function revolucion({ perfil, profundidad = 1, costillas = null, segmentos = 64, cara = null }) {
  const m = malla();
  const mod = (th) => {
    if (!costillas) return 1;
    /* th está medido desde el frente (+Z): 0 es el medio de la cara. */
    const a = Math.abs(Math.atan2(Math.sin(th), Math.cos(th)));
    const k = Math.min(1, Math.max(0, (a - 0.34) / 0.5));
    return 1 + costillas.amp * Math.cos(costillas.n * th) * (k * k * (3 - 2 * k));
  };
  const punto = (th, r, y) => [Math.sin(th) * r * mod(th), y, Math.cos(th) * r * mod(th) * profundidad];
  const uvDe = (p) => (cara
    ? [0.5 + p[0] / cara.ancho, 0.5 - (p[1] - cara.y) / cara.alto]
    : [0, 0]);

  const base = m.pos.length / 3;
  for (const [r, y] of perfil) {
    for (let s = 0; s < segmentos; s++) {
      const th = (s / segmentos) * Math.PI * 2;
      const p = punto(th, r, y);
      vertice(m, p, [0, 1, 0], uvDe(p));
    }
  }
  tejer(m, base, perfil.length, segmentos);

  /* Tapa de abajo (la cara que apoya en la cama) y de arriba si no cierra. */
  const tapa = (r, y, hacia) => {
    if (r <= 0.001) return;
    const c = vertice(m, [0, y, 0], [0, hacia, 0], uvDe([0, y, 0]));
    const primero = m.pos.length / 3;
    for (let s = 0; s < segmentos; s++) {
      const th = (s / segmentos) * Math.PI * 2;
      vertice(m, punto(th, r, y), [0, hacia, 0], [0, 0]);
    }
    for (let s = 0; s < segmentos; s++) {
      const a = primero + s; const b = primero + ((s + 1) % segmentos);
      if (hacia < 0) triangulo(m, c, b, a); else triangulo(m, c, a, b);
    }
  };
  tapa(perfil[0][0], perfil[0][1], -1);
  tapa(perfil[perfil.length - 1][0], perfil[perfil.length - 1][1], +1);
  suavizar(m);
  /* Las tapas quedan con la normal del suavizado; se fuerzan las planas. */
  return {
    malla: m,
    dentro(p) {
      const y = p[1];
      if (y < perfil[0][1] - 0.001 || y > perfil[perfil.length - 1][1] + 0.001) return false;
      const th = Math.atan2(p[0], p[2] / profundidad);
      const r = Math.hypot(p[0], p[2] / profundidad);
      return r <= radioEn(perfil, y) * mod(th) + 0.001;
    },
  };
}

/**
 * Una gota al revés: media esfera arriba y un cono de 45° abajo. Es el bulto
 * que FDM imprime sin soportes, y con el que están hechos los brazos, las
 * patitas y las matas.
 */
export function gota({ r = 6, esc = [1, 1, 1], segmentos = 24, anillos = 10 }) {
  const m = malla();
  const base = m.pos.length / 3;
  const filas = [];
  /* De la punta de abajo (-r√2 para que el cono cierre a 45°) al polo. */
  const puntaY = -r * Math.SQRT2;
  /* Sin la punta ni el polo: esos dos van como un vértice solo (abanico). */
  for (let a = 1; a < anillos; a++) {
    const t = a / anillos;
    if (t < 0.5) {
      /* El cono: de la punta al ecuador. */
      const k = t / 0.5;
      filas.push([r * k, puntaY + (0 - puntaY) * k]);
    } else {
      const ang = ((t - 0.5) / 0.5) * (Math.PI / 2);
      filas.push([r * Math.cos(ang), r * Math.sin(ang)]);
    }
  }
  for (const [rr, yy] of filas) {
    for (let s = 0; s < segmentos; s++) {
      const th = (s / segmentos) * Math.PI * 2;
      vertice(m, [Math.sin(th) * rr * esc[0], yy * esc[1], Math.cos(th) * rr * esc[2]]);
    }
  }
  tejer(m, base, filas.length, segmentos);
  abanico(m, base, segmentos, [0, puntaY * esc[1], 0], -1);
  abanico(m, base + (filas.length - 1) * segmentos, segmentos, [0, r * esc[1], 0], +1);
  suavizar(m);
  return {
    malla: m,
    dentro(p) {
      const x = p[0] / esc[0]; const y = p[1] / esc[1]; const z = p[2] / esc[2];
      const d = Math.hypot(x, z);
      if (y >= 0) return Math.hypot(d, y) <= r + 0.001;
      if (y < puntaY) return false;
      return d <= r * (1 - y / puntaY) + 0.001;
    },
  };
}

/** Un tubo entre dos puntos, que puede afinarse: tallos, cuernos, brazos. */
export function capsula({ a = [0, 0, 0], b = [0, 10, 0], r0 = 3, r1 = null, segmentos = 20, anillos = 8 }) {
  const rB = r1 === null ? r0 : r1;
  const eje = normalizar([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
  const largo = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const u = normalizar(Math.abs(eje[1]) > 0.9 ? cruz(eje, [1, 0, 0]) : cruz(eje, [0, 1, 0]));
  const v = cruz(eje, u);
  const m = malla();
  const base = m.pos.length / 3;
  const filas = [];
  for (let k = 0; k <= anillos; k++) {
    const t = k / anillos;
    /* Las puntas se redondean como medias esferas del radio de su extremo. */
    const rt = r0 + (rB - r0) * t;
    filas.push([t * largo, rt]);
  }
  const punto = (d, rr, th) => [
    a[0] + eje[0] * d + (u[0] * Math.cos(th) + v[0] * Math.sin(th)) * rr,
    a[1] + eje[1] * d + (u[1] * Math.cos(th) + v[1] * Math.sin(th)) * rr,
    a[2] + eje[2] * d + (u[2] * Math.cos(th) + v[2] * Math.sin(th)) * rr,
  ];
  for (const [d, rr] of filas) {
    for (let s = 0; s < segmentos; s++) vertice(m, punto(d, rr, (s / segmentos) * Math.PI * 2));
  }
  tejer(m, base, filas.length, segmentos);
  /* Casquete de la punta de arriba: media esfera. */
  const capa = [];
  for (let k = 1; k <= 4; k++) {
    const ang = (k / 4) * (Math.PI / 2);
    capa.push([largo + Math.sin(ang) * rB, Math.cos(ang) * rB]);
  }
  const b0 = m.pos.length / 3;
  for (const [d, rr] of capa) {
    for (let s = 0; s < segmentos; s++) vertice(m, punto(d, Math.max(rr, 0.001), (s / segmentos) * Math.PI * 2));
  }
  tejer(m, b0 - segmentos, capa.length + 1, segmentos);
  /* Tapa de abajo, plana: la punta va siempre metida en otra pieza. */
  const c = vertice(m, a, [-eje[0], -eje[1], -eje[2]]);
  for (let s = 0; s < segmentos; s++) {
    triangulo(m, c, base + s, base + ((s + 1) % segmentos));
  }
  suavizar(m);
  return {
    malla: m,
    dentro(p) {
      const d = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
      const t = d[0] * eje[0] + d[1] * eje[1] + d[2] * eje[2];
      if (t < -0.001 || t > largo + rB) return false;
      const tt = Math.max(0, Math.min(largo, t));
      const rr = r0 + (rB - r0) * (tt / (largo || 1));
      const px = [a[0] + eje[0] * tt, a[1] + eje[1] * tt, a[2] + eje[2] * tt];
      return Math.hypot(p[0] - px[0], p[1] - px[1], p[2] - px[2]) <= rr + 0.001;
    },
  };
}

/**
 * Una hoja: placa lanceolada con espesor y una curvatura suave, en el plano XY
 * local, creciendo hacia +Y desde la raíz (que va metida en el cuerpo).
 *
 * POR QUÉ LANCEOLADA Y NO OVALADA
 *
 * El canto de la hoja es lo que decide si se imprime. Mientras la hoja se
 * ensancha, cada capa apoya sobre aire tanto como se abrió el canto, y a eso
 * hay que sumarle lo que la hoja esté inclinada: el voladizo del canto de
 * abajo es `atan(abre) + inclinación`. Una hoja ovalada (un seno) abre a más
 * de 45° en algún punto sí o sí, la midas como la midas; una lanceolada abre
 * a una pendiente constante que se elige, y después se cierra hacia la punta
 * —y un canto que se cierra mira hacia arriba, así que ése es gratis—.
 *
 * `abre` es esa pendiente (mm de ancho por mm de alto, por lado). Con la hoja
 * inclinada θ grados, el canto de abajo mide `atan(abre) + θ`, y de ahí sale
 * cuánto se puede abrir: 0.36 aguanta hasta unos 25° de inclinación.
 *
 * Se cose la cara de adelante, la de atrás con el tejido dado vuelta (si no,
 * la hoja queda con la mitad de los triángulos mirando para adentro) y los
 * dos bordes que las unen.
 */
export function hoja({ largo = 30, ancho = 18, grosor = 2.6, curva = 0.18, segmentos = 16, raiz = 5, abre = 0.36 }) {
  const m = malla();
  const COLS = 7;
  const filas = [];
  /* Hasta dónde sube abriéndose antes de empezar a cerrar. Si no alcanza el
     largo para abrir tan despacio, se abre todo el camino y la hoja sale más
     angosta que lo pedido: antes eso que un voladizo. */
  const tc = Math.min(0.78, (ancho / 2) / (abre * largo));
  /* Nunca llega a cero: una punta de filo infinito no la imprime ninguna
     boquilla, y de paso la malla no queda con una fila de triángulos de área
     cero en la raíz y otra en la punta. */
  const minimo = Math.max(0.4, ancho * 0.03);
  const perfil = (t) => Math.max(minimo, t <= tc
    ? (ancho / 2) * (t / tc)
    : (ancho / 2) * Math.cos((Math.PI / 2) * ((t - tc) / (1 - tc))) ** 0.55);
  /* La raíz: unos milímetros hacia abajo, finitos, que quedan METIDOS en el
     tallo. Sin eso, el canto de la hoja justo donde nace mira al piso y la
     prueba de voladizos lo canta (con razón: ahí la impresora imprimiría en
     el aire). */
  for (let i = 1; i <= 3; i++) filas.push([-raiz * (4 - i) / 3, Math.max(0.4, ancho * 0.03), 0]);
  for (let i = 0; i <= segmentos; i++) {
    const t = i / segmentos;                   /* 0 raíz, 1 punta */
    filas.push([t * largo, perfil(t), curva * largo * t * t]);
  }
  /* Cada fila es un ANILLO cerrado que recorre el contorno de la sección: la
     cara de adelante de izquierda a derecha y la de atrás de vuelta, sin
     repetir los dos bordes. Antes eran dos rejillas cosidas por los cantos, y
     como en el borde el espesor es cero, esos cantos eran setenta y seis
     triángulos de área cero por hoja: invisibles, pero basura en el STL. */
  const ANILLO = (COLS - 1) * 2;
  const punto = (fila, i) => {
    const [y, w, z] = fila;
    const adelante = i < COLS;
    const c = adelante ? i : ANILLO - i;
    const k = (c / (COLS - 1)) * 2 - 1;
    const espesor = (grosor / 2) * Math.sqrt(Math.max(0, 1 - k * k));
    return [k * w, y, z + (adelante ? espesor : -espesor)];
  };

  const base = m.pos.length / 3;
  for (const f of filas) for (let i = 0; i < ANILLO; i++) vertice(m, punto(f, i));
  tejer(m, base, filas.length, ANILLO);

  /* Las dos puntas: un abanico desde el centro de la primera y de la última
     fila. La de abajo va metida en el tallo y la de arriba es la punta. */
  const tapa = (fila, indice, hacia) => {
    const centro = vertice(m, [0, filas[fila][0], filas[fila][2]]);
    for (let i = 0; i < ANILLO; i++) {
      const a = base + indice + i;
      const b = base + indice + ((i + 1) % ANILLO);
      if (hacia < 0) triangulo(m, centro, b, a); else triangulo(m, centro, a, b);
    }
  };
  tapa(0, 0, -1);
  tapa(filas.length - 1, (filas.length - 1) * ANILLO, +1);
  suavizar(m);
  return {
    malla: m,
    dentro(p) {
      if (p[1] < -raiz - 0.001 || p[1] > largo + 0.001) return false;
      if (p[1] < 0) return Math.abs(p[0]) <= Math.max(0.4, ancho * 0.03) + 0.001 && Math.abs(p[2]) <= grosor / 2 + 0.001;
      const t = p[1] / largo;
      const w = perfil(t);
      const z = curva * largo * t * t;
      return Math.abs(p[0]) <= w + 0.001 && Math.abs(p[2] - z) <= grosor / 2 + 0.001;
    },
  };
}

/** Un elipsoide, opcionalmente cortado por abajo (las patitas apoyadas). */
export function elipsoide({ r = [6, 6, 6], desdeY = -1, segmentos = 24, anillos = 12 }) {
  const m = malla();
  const base = m.pos.length / 3;
  const y0 = Math.max(-1, desdeY);
  const filas = [];
  for (let a = 0; a < anillos; a++) {
    const s = y0 + (1 - y0) * (a / anillos);
    filas.push([Math.sqrt(Math.max(0, 1 - s * s)), s]);
  }
  for (const [rr, ss] of filas) {
    for (let s = 0; s < segmentos; s++) {
      const th = (s / segmentos) * Math.PI * 2;
      vertice(m, [Math.sin(th) * rr * r[0], ss * r[1], Math.cos(th) * rr * r[2]]);
    }
  }
  tejer(m, base, filas.length, segmentos);
  abanico(m, base + (filas.length - 1) * segmentos, segmentos, [0, r[1], 0], +1);
  /* Cortado por la cama: la tapa de abajo es lo que apoya. */
  if (y0 > -1) abanico(m, base, segmentos, [0, y0 * r[1], 0], -1);
  suavizar(m);
  return {
    malla: m,
    dentro(p) {
      const v = (p[0] / r[0]) ** 2 + (p[1] / r[1]) ** 2 + (p[2] / r[2]) ** 2;
      return v <= 1.001 && p[1] >= y0 * r[1] - 0.001;
    },
  };
}
