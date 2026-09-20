/* esculpir.mjs — modelar un bicho como si fuera plastilina.
 *
 * POR QUÉ NO ALCANZABA CON PERFILES QUE GIRAN
 *
 * La primera versión de los Rooties en 3D armaba cada cuerpo con un perfil que
 * gira, más bultos pegados. Eso da cuerpos redondos y correctos, y siempre el
 * mismo cuerpo: una papa. Los personajes que queremos —los de la escuela de
 * los juegos de criaturas-vegetales— tienen panza, cogote, ancas, bracitos que
 * SALEN del cuerpo sin junta visible y piecitos apoyados. Eso no se hace
 * pegando piezas: se hace fundiéndolas.
 *
 * CÓMO FUNCIONA
 *
 * Cada pieza es una función que dice, para cualquier punto del espacio, a qué
 * distancia está de su superficie (negativo adentro). Un cuerpo entero es la
 * UNIÓN SUAVE de todas sus piezas: en vez de quedarse con la distancia menor,
 * se mezclan las dos más cercanas con un radio de fusión. Ahí es donde
 * aparece el menisco de plastilina entre el brazo y el torso.
 *
 * Después hay que convertir ese campo en triángulos, y eso lo hace
 * `superficie()` con surface nets: recorre una grilla, busca las celdas donde
 * el campo cambia de signo, pone un vértice en cada una y las cose. Da mallas
 * suaves y parejas, que es justo lo que quiere una criatura de goma.
 *
 * LO QUE VIAJA CON CADA VÉRTICE
 *
 * No sólo la posición y la normal (que sale del gradiente del campo, y por eso
 * es exacta y suave):
 *
 *   color   se mezcla con los mismos pesos que la fusión, así que el verde de
 *           una hoja se derrite en el cuerpo en vez de cortarse;
 *   huesos  cada pieza dice de qué parte del bicho es (cuerpo, copa, brazo) y
 *           el vértice hereda esa pertenencia mezclada. Con eso la animación
 *           deforma al bicho entero sin costuras: la copa se inclina y el
 *           cogote la acompaña, en vez de girar una pieza suelta;
 *   uv      la proyección de la cara sobre el frente, para pegar la pantalla.
 *
 * NADA DE ESTO SE IMPRIME
 *
 * Es el personaje de la app. Las carcasas se diseñan aparte: acá no hay reglas
 * de voladizo que respetar, y por eso los bichos pueden tener ancas, orejas y
 * patas separadas.
 */

/* ------------------------------------------------------------ distancias --- */
/*
 * Todas devuelven la distancia con signo a la superficie de la pieza. Están
 * escritas para que el compilador no tenga que adivinar: sin objetos
 * intermedios, sin desestructurar, porque esto se llama cientos de miles de
 * veces por figura.
 */

export function dEsfera(px, py, pz, c, r) {
  const x = px - c[0]; const y = py - c[1]; const z = pz - c[2];
  return Math.sqrt(x * x + y * y + z * z) - r;
}

/** Elipsoide: la distancia exacta no tiene forma cerrada; ésta es la de Quílez. */
export function dElipsoide(px, py, pz, c, r) {
  const x = (px - c[0]); const y = (py - c[1]); const z = (pz - c[2]);
  const k0 = Math.sqrt((x / r[0]) ** 2 + (y / r[1]) ** 2 + (z / r[2]) ** 2);
  if (k0 === 0) return -Math.min(r[0], r[1], r[2]);
  const k1 = Math.sqrt((x / (r[0] * r[0])) ** 2 + (y / (r[1] * r[1])) ** 2 + (z / (r[2] * r[2])) ** 2);
  return (k0 * (k0 - 1)) / k1;
}

/** Cápsula de radio variable: un cono con las puntas redondeadas. */
export function dCapsula(px, py, pz, a, b, ra, rb) {
  const bax = b[0] - a[0]; const bay = b[1] - a[1]; const baz = b[2] - a[2];
  const pax = px - a[0]; const pay = py - a[1]; const paz = pz - a[2];
  const baba = bax * bax + bay * bay + baz * baz;
  const paba = pax * bax + pay * bay + paz * baz;
  const h = baba === 0 ? 0 : Math.min(1, Math.max(0, paba / baba));
  const dx = pax - bax * h; const dy = pay - bay * h; const dz = paz - baz * h;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - (ra + (rb - ra) * h);
}

/** Caja redondeada: para hocicos, dientes y cosas con canto. */
export function dCaja(px, py, pz, c, t, r) {
  const x = Math.abs(px - c[0]) - t[0] + r;
  const y = Math.abs(py - c[1]) - t[1] + r;
  const z = Math.abs(pz - c[2]) - t[2] + r;
  const mx = Math.max(x, 0); const my = Math.max(y, 0); const mz = Math.max(z, 0);
  return Math.sqrt(mx * mx + my * my + mz * mz) + Math.min(Math.max(x, Math.max(y, z)), 0) - r;
}

/** Toro de pie (el eje en Y): anillos, collares, la falda de un hongo. */
export function dToro(px, py, pz, c, R, r) {
  const x = px - c[0]; const y = py - c[1]; const z = pz - c[2];
  const q = Math.sqrt(x * x + z * z) - R;
  return Math.sqrt(q * q + y * y) - r;
}

/**
 * Una hoja: un disco achatado y alargado, doblado como una cuchara y con un
 * eje propio (nace en `a`, la punta en `b`).
 */
export function dHoja(px, py, pz, a, b, ancho, grosor, curva) {
  const ux = b[0] - a[0]; const uy = b[1] - a[1]; const uz = b[2] - a[2];
  const largo = Math.sqrt(ux * ux + uy * uy + uz * uz) || 1;
  const ex = ux / largo; const ey = uy / largo; const ez = uz / largo;
  /* Base ortonormal con el "ancho" lo más horizontal posible. */
  let sx = -ez; let sy = 0; let sz = ex;
  const sl = Math.hypot(sx, sy, sz) || 1;
  sx /= sl; sy /= sl; sz /= sl;
  const tx = ey * sz - ez * sy; const ty = ez * sx - ex * sz; const tz = ex * sy - ey * sx;
  const qx = px - a[0]; const qy = py - a[1]; const qz = pz - a[2];
  const l = qx * ex + qy * ey + qz * ez;          /* a lo largo */
  const w = qx * sx + qy * sy + qz * sz;          /* a lo ancho */
  let h = qx * tx + qy * ty + qz * tz;            /* el espesor */
  const t = Math.min(1, Math.max(0, l / largo));
  h -= curva * largo * t * t;                     /* la cuchara */
  /* Media elipse: ancha en el medio, en punta arriba y redondeada abajo. */
  const perfil = Math.sin(Math.PI * Math.min(1, t * 1.04)) ** 0.7;
  const a2 = (ancho / 2) * Math.max(0.12, perfil);
  const dl = l < 0 ? -l : (l > largo ? l - largo : 0);
  const dw = Math.max(0, Math.abs(w) - a2);
  const dh = Math.max(0, Math.abs(h) - grosor / 2);
  const fuera = Math.sqrt(dl * dl + dw * dw + dh * dh);
  const dentro = Math.min(0, Math.max(Math.abs(h) - grosor / 2, Math.abs(w) - a2));
  return fuera + dentro;
}

/* ------------------------------------------------------------ mezclas --- */
/**
 * Unión suave polinomial: devuelve la distancia mezclada y, en `mezcla`,
 * cuánto pesó la segunda (0 = manda la primera). Ese peso es el que también
 * mezcla el color y los huesos, así que todo se funde igual.
 */
export function unir(a, b, k) {
  if (k <= 0) return b < a ? { d: b, t: 1 } : { d: a, t: 0 };
  const h = Math.min(1, Math.max(0, 0.5 + (0.5 * (a - b)) / k));
  return { d: b * h + a * (1 - h) - k * h * (1 - h), t: h };
}

/** Resta suave: saca `b` de `a` (para hundir una boca o marcar un surco). */
export function restar(a, b, k) {
  if (k <= 0) return Math.max(a, -b);
  const h = Math.min(1, Math.max(0, 0.5 - (0.5 * (a + b)) / k));
  return -b * h + a * (1 - h) + k * h * (1 - h);
}

/* ------------------------------------------------------------- piezas --- */
/** La distancia de una pieza suelta, por su tipo. */
export function distanciaDe(pieza, x, y, z) {
  switch (pieza.tipo) {
    case 'esfera': return dEsfera(x, y, z, pieza.en, pieza.r);
    case 'elipsoide': return dElipsoide(x, y, z, pieza.en, pieza.r);
    case 'capsula': return dCapsula(x, y, z, pieza.a, pieza.b, pieza.ra, pieza.rb ?? pieza.ra);
    case 'caja': return dCaja(x, y, z, pieza.en, pieza.tam, pieza.redondeo ?? 1);
    case 'toro': return dToro(x, y, z, pieza.en, pieza.R, pieza.r);
    case 'hoja': return dHoja(x, y, z, pieza.a, pieza.b, pieza.ancho, pieza.grosor, pieza.curva ?? 0.12);
    default: throw new Error(`pieza desconocida: ${pieza.tipo}`);
  }
}

/**
 * El campo de una criatura: sus piezas unidas suavemente, menos los recortes.
 *
 * Devuelve `{ distancia(x,y,z), atributos(x,y,z) }`. La primera es la que se
 * llama cientos de miles de veces (sólo números); la segunda, una por vértice.
 */
export function campo(receta, huesos, roles) {
  const piezas = receta.piezas;
  const recortes = receta.recortes || [];
  const piso = receta.piso ?? null;

  function distancia(x, y, z) {
    let d = Infinity;
    for (let i = 0; i < piezas.length; i++) {
      const p = piezas[i];
      const di = distanciaDe(p, x, y, z);
      d = i === 0 ? di : unir(d, di, p.fundir ?? 4).d;
    }
    for (const r of recortes) d = restar(d, distanciaDe(r, x, y, z), r.fundir ?? 2);
    /* El piso: la criatura se apoya, no se hunde. */
    if (piso !== null) d = Math.max(d, piso - y);
    return d;
  }

  function atributos(x, y, z) {
    /* Se repite la unión guardando cuánto pesó cada pieza; con eso se mezclan
       el color y la pertenencia a cada hueso. */
    const peso = new Float64Array(piezas.length);
    let d = 0;
    for (let i = 0; i < piezas.length; i++) {
      const p = piezas[i];
      const di = distanciaDe(p, x, y, z);
      if (i === 0) { d = di; peso[0] = 1; continue; }
      const u = unir(d, di, p.fundir ?? 4);
      d = u.d;
      for (let j = 0; j < i; j++) peso[j] *= 1 - u.t;
      peso[i] = u.t;
    }
    /* El vértice no guarda un color sino CUÁNTO le toca de cada rol: así la
       misma malla sirve para las tres pieles del Rooti, y el degradé entre el
       verde de una hoja y el cuerpo sale del mismo peso que fundió las dos
       piezas. */
    const rol = new Float32Array(roles.length);
    const hueso = new Float32Array(huesos.length);
    let total = 0;
    for (let i = 0; i < piezas.length; i++) {
      const w = peso[i];
      if (w <= 0.0001) continue;
      total += w;
      const r = roles.indexOf(piezas[i].rol || 'cuerpo');
      rol[r < 0 ? 0 : r] += w;
      const h = huesos.indexOf(piezas[i].hueso || 'cuerpo');
      hueso[h < 0 ? 0 : h] += w;
    }
    if (total > 0) {
      for (let i = 0; i < rol.length; i++) rol[i] /= total;
      for (let i = 0; i < hueso.length; i++) hueso[i] /= total;
    } else {
      rol[0] = 1; hueso[0] = 1;
    }
    return { rol, hueso };
  }

  return { distancia, atributos };
}

/* --------------------------------------------------------- superficie --- */
/**
 * Surface nets: de un campo de distancia a una malla.
 *
 * Se muestrea el campo en una grilla; cada celda que tiene esquinas de los dos
 * signos pone UN vértice, en el promedio de los cruces por cero de sus aristas;
 * después, cada arista que cruza el cero cose las cuatro celdas que la rodean.
 * Es más corto que marching cubes, no tiene tablas de 256 casos y da mallas
 * más parejas, que es lo que le va a una criatura de goma.
 *
 * La normal sale del gradiente del campo, no de los triángulos: por eso la
 * superficie se ve lisa aunque la grilla sea gruesa.
 */
export function superficie(receta, {
  paso = 2.2, margen = 4, huesos = ['cuerpo'], roles = ['cuerpo'], cara = null,
} = {}) {
  const f = campo(receta, huesos, roles);
  const lim = limitesDe(receta, margen);
  const nx = Math.ceil((lim.hi[0] - lim.lo[0]) / paso) + 1;
  const ny = Math.ceil((lim.hi[1] - lim.lo[1]) / paso) + 1;
  const nz = Math.ceil((lim.hi[2] - lim.lo[2]) / paso) + 1;

  /* 1. El campo en cada nodo de la grilla. */
  const val = new Float32Array(nx * ny * nz);
  const idx = (i, j, k) => (k * ny + j) * nx + i;
  for (let k = 0; k < nz; k++) {
    const z = lim.lo[2] + k * paso;
    for (let j = 0; j < ny; j++) {
      const y = lim.lo[1] + j * paso;
      for (let i = 0; i < nx; i++) {
        val[idx(i, j, k)] = f.distancia(lim.lo[0] + i * paso, y, z);
      }
    }
  }

  /* 2. Un vértice por celda con cambio de signo. */
  const ESQUINAS = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const ARISTAS = [
    [0, 1], [2, 3], [4, 5], [6, 7],
    [0, 2], [1, 3], [4, 6], [5, 7],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  const celda = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const ic = (i, j, k) => (k * (ny - 1) + j) * (nx - 1) + i;
  const pos = [];
  const nor = [];
  const col = [];
  const hue = [];
  const uv = [];

  const gradiente = (x, y, z) => {
    const e = paso * 0.35;
    const gx = f.distancia(x + e, y, z) - f.distancia(x - e, y, z);
    const gy = f.distancia(x, y + e, z) - f.distancia(x, y - e, z);
    const gz = f.distancia(x, y, z + e) - f.distancia(x, y, z - e);
    const l = Math.hypot(gx, gy, gz) || 1;
    return [gx / l, gy / l, gz / l];
  };

  for (let k = 0; k < nz - 1; k++) {
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const v = [];
        let negativos = 0;
        for (let e = 0; e < 8; e++) {
          const d = val[idx(i + ESQUINAS[e][0], j + ESQUINAS[e][1], k + ESQUINAS[e][2])];
          v.push(d);
          if (d < 0) negativos++;
        }
        if (negativos === 0 || negativos === 8) continue;
        let sx = 0; let sy = 0; let sz = 0; let n = 0;
        for (const [a, b] of ARISTAS) {
          if ((v[a] < 0) === (v[b] < 0)) continue;
          const t = v[a] / (v[a] - v[b]);
          sx += (ESQUINAS[a][0] + (ESQUINAS[b][0] - ESQUINAS[a][0]) * t);
          sy += (ESQUINAS[a][1] + (ESQUINAS[b][1] - ESQUINAS[a][1]) * t);
          sz += (ESQUINAS[a][2] + (ESQUINAS[b][2] - ESQUINAS[a][2]) * t);
          n++;
        }
        const x = lim.lo[0] + (i + sx / n) * paso;
        const y = lim.lo[1] + (j + sy / n) * paso;
        const z = lim.lo[2] + (k + sz / n) * paso;
        celda[ic(i, j, k)] = pos.length / 3;
        pos.push(x, y, z);
        const g = gradiente(x, y, z);
        nor.push(g[0], g[1], g[2]);
        const at = f.atributos(x, y, z);
        col.push(at.rol[0] || 0, at.rol[1] || 0, at.rol[2] || 0, at.rol[3] || 0);
        hue.push(at.hueso[0] || 0, at.hueso[1] || 0, at.hueso[2] || 0, at.hueso[3] || 0);
        uv.push(
          cara ? 0.5 + x / cara.ancho : 0,
          cara ? 0.5 - (y - cara.y) / cara.alto : 0,
        );
      }
    }
  }

  /* 3. Coser: cada arista de la grilla que cruza el cero une cuatro celdas. */
  const tri = [];
  /* El orden de los cuatro: con el signo al revés la malla sale dada vuelta y
     todo se ve negro (lo canta `volumen()`, que tiene que dar positivo). */
  const quad = (a, b, c, d, voltear) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (voltear) tri.push(a, b, c, a, c, d);
    else tri.push(a, c, b, a, d, c);
  };
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const d0 = val[idx(i, j, k)];
        /* Arista hacia +x: la rodean las celdas (i, j-1, k-1) y vecinas. */
        if (i < nx - 1 && j > 0 && k > 0) {
          const d1 = val[idx(i + 1, j, k)];
          if ((d0 < 0) !== (d1 < 0)) {
            quad(celda[ic(i, j - 1, k - 1)], celda[ic(i, j, k - 1)], celda[ic(i, j, k)], celda[ic(i, j - 1, k)], d0 < 0);
          }
        }
        if (j < ny - 1 && i > 0 && k > 0) {
          const d1 = val[idx(i, j + 1, k)];
          if ((d0 < 0) !== (d1 < 0)) {
            quad(celda[ic(i - 1, j, k - 1)], celda[ic(i, j, k - 1)], celda[ic(i, j, k)], celda[ic(i - 1, j, k)], d0 >= 0);
          }
        }
        if (k < nz - 1 && i > 0 && j > 0) {
          const d1 = val[idx(i, j, k + 1)];
          if ((d0 < 0) !== (d1 < 0)) {
            quad(celda[ic(i - 1, j - 1, k)], celda[ic(i, j - 1, k)], celda[ic(i, j, k)], celda[ic(i - 1, j, k)], d0 < 0);
          }
        }
      }
    }
  }

  return {
    pos: new Float32Array(pos),
    nor: new Float32Array(nor),
    rol: new Float32Array(col),
    hue: new Float32Array(hue),
    uv: new Float32Array(uv),
    idx: pos.length / 3 > 65535 ? new Uint32Array(tri) : new Uint16Array(tri),
    triangulos: tri.length / 3,
    limites: lim,
  };
}

/** La caja que contiene a todas las piezas, con aire para la fusión. */
export function limitesDe(receta, margen = 4) {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  const meter = (c, r) => {
    for (let i = 0; i < 3; i++) {
      lo[i] = Math.min(lo[i], c[i] - r[i]);
      hi[i] = Math.max(hi[i], c[i] + r[i]);
    }
  };
  for (const p of receta.piezas) {
    switch (p.tipo) {
      case 'esfera': meter(p.en, [p.r, p.r, p.r]); break;
      case 'elipsoide': meter(p.en, p.r); break;
      case 'caja': meter(p.en, p.tam); break;
      case 'toro': meter(p.en, [p.R + p.r, p.r, p.R + p.r]); break;
      case 'capsula': {
        const r = Math.max(p.ra, p.rb ?? p.ra);
        meter(p.a, [r, r, r]); meter(p.b, [r, r, r]);
        break;
      }
      case 'hoja': {
        const r = Math.max(p.ancho, p.grosor) / 2 + Math.abs(p.curva ?? 0.12) * 40;
        meter(p.a, [r, r, r]); meter(p.b, [r, r, r]);
        break;
      }
      default: break;
    }
  }
  const m = margen + 2;
  const piso = receta.piso ?? null;
  return {
    lo: [lo[0] - m, piso === null ? lo[1] - m : piso - 1, lo[2] - m],
    hi: [hi[0] + m, hi[1] + m, hi[2] + m],
  };
}

/** El volumen con signo: sirve para saber si la malla quedó del derecho. */
export function volumen(malla) {
  let v = 0;
  const p = malla.pos;
  for (let i = 0; i < malla.idx.length; i += 3) {
    const a = malla.idx[i] * 3; const b = malla.idx[i + 1] * 3; const c = malla.idx[i + 2] * 3;
    v += (p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1])
      - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c])
      + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])) / 6;
  }
  return v;
}
