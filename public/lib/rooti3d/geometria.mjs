/* geometria.mjs — las matrices, y nada más.
 *
 * Acá vivían también las primitivas con las que se armaban los Rooties: un
 * perfil que giraba, bultos, cápsulas y hojas, todas cosidas a mano. Se fueron
 * cuando los personajes pasaron a esculpirse como campos de distancia
 * (esculpir.mjs), que es lo que permite que un bracito SALGA del cuerpo en vez
 * de estar pegado. Quedó lo que el motor sigue necesitando: mover, girar,
 * escalar y mirar desde algún lado.
 *
 * Todo en columna-mayor, que es como las quiere WebGL.
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
