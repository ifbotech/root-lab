/* motor.mjs — dibujar un Rooti en 3D, sin bibliotecas.
 *
 * QUÉ HACE Y QUÉ NO
 *
 * Toma una figura (formas.mjs), una pose (animacion.mjs) y los colores de la
 * piel, y pinta el personaje sobre un canvas 2D cualquiera. No sabe de estado,
 * de tiempo ni del DOM más allá de ese canvas: el que decide cuándo dibujar es
 * cuerpo.mjs.
 *
 * UN SOLO CONTEXTO PARA TODOS
 *
 * En la colección puede haber quince Rooties a la vez, y un navegador da unos
 * ocho contextos WebGL antes de empezar a tirar los viejos. Así que hay UNO
 * solo, escondido, del tamaño del más grande que se esté mostrando: se dibuja
 * ahí y se copia con drawImage al canvas 2D de cada uno. Copiar una imagen de
 * 300 px es gratis al lado de perder el contexto.
 *
 * EL SOMBREADO
 *
 * Es un juguete de vinilo: luz de cielo por arriba y rebote del piso por
 * abajo, una luz principal suave (envuelta, para que la sombra no sea un
 * borde duro), un brillo especular ancho —el plástico brillante— y un
 * contraluz en el borde. Encima, un contorno oscuro dibujado con las caras de
 * atrás infladas: es lo que le da el aire de ilustración y no de render.
 *
 * LA CARA
 *
 * La cara la dibuja el firmware, igual que en la maceta: llega como un canvas
 * (lib/caras.mjs, el mismo WebAssembly que corre en el ESP32) y se pega como
 * textura sobre el cuerpo, en las UV que revolucion() dejó en la zona de la
 * pantalla. Se mezcla sólo donde la superficie mira al frente, para que no
 * aparezca una segunda cara en la nuca.
 */

import {
  multiplicar, transformacion, trasladar, perspectiva, mirarDesde, aplicar, empaquetar,
} from './geometria.mjs';

/* ------------------------------------------------------------- shaders --- */
const VS = `
attribute vec3 aPos;
attribute vec3 aNor;
attribute vec2 aUv;
uniform mat4 uProy;
uniform mat4 uVista;
uniform mat4 uModelo;
uniform mat3 uNormal;
uniform float uInflar;
varying vec3 vNor;
varying vec3 vMundo;
varying vec2 vUv;
void main() {
  vec3 p = aPos + aNor * uInflar;
  vec4 mundo = uModelo * vec4(p, 1.0);
  vMundo = mundo.xyz;
  vNor = normalize(uNormal * aNor);
  vUv = aUv;
  gl_Position = uProy * uVista * mundo;
}`;

const FS = `
precision mediump float;
uniform vec3 uColor;
uniform vec3 uCielo;
uniform vec3 uSuelo;
uniform vec3 uBrillo;
uniform vec3 uOjo;
uniform vec3 uLuz;
uniform float uContorno;
uniform float uConCara;
uniform float uApagado;
uniform vec3 uAmbiente;   /* calidez, desaturación, contraste: la luz del cuarto */
uniform sampler2D uCara;
varying vec3 vNor;
varying vec3 vMundo;
varying vec2 vUv;
void main() {
  if (uContorno > 0.5) { gl_FragColor = vec4(uColor, 1.0); return; }
  vec3 n = normalize(vNor);
  vec3 base = uColor;
  if (uConCara > 0.5 && n.z > 0.1) {
    vec2 t = vUv;
    if (t.x > 0.0 && t.x < 1.0 && t.y > 0.0 && t.y < 1.0) {
      vec4 c = texture2D(uCara, t);
      /* La cara llega en sRGB y el color del cuerpo ya está en lineal: sin
         convertirla, el fondo de la cara —que es el MISMO color del cuerpo—
         queda más claro y se ve el recuadro de la pantalla como un parche. */
      vec3 cara = pow(c.rgb, vec3(2.2));
      base = mix(base, cara, c.a * smoothstep(0.06, 0.30, n.z));
    }
  }
  vec3 ambiente = mix(uSuelo, uCielo, 0.5 + 0.5 * n.y);
  vec3 L = normalize(uLuz);
  float dif = 0.5 + 0.5 * dot(n, L);            /* luz envuelta: sin borde duro */
  vec3 V = normalize(uOjo - vMundo);
  vec3 H = normalize(L + V);
  float esp = pow(max(dot(n, H), 0.0), 30.0) * 0.45;
  float borde = pow(1.0 - max(dot(n, V), 0.0), 2.6);
  vec3 col = base * (ambiente * 0.62 + dif * 0.62) + esp * uBrillo + uBrillo * borde * 0.30;
  /* La misma luz que el firmware le pone a la cara (lib/luz.mjs), pero al
     bicho entero: si sólo se la pusiéramos a la cara, la pantalla se vería
     como un parche de otro color pegado en el cuerpo. */
  col = mix(col, vec3(dot(col, vec3(0.299, 0.587, 0.114))), uAmbiente.y);
  col = mix(col, col * vec3(1.16, 1.0, 0.76), uAmbiente.x);
  col = (col - 0.5) * uAmbiente.z + 0.5;
  col = mix(col, vec3(dot(col, vec3(0.299, 0.587, 0.114))) * 0.92, uApagado);
  gl_FragColor = vec4(col, 1.0);
}`;

/* ------------------------------------------------------------ utilería --- */
export function hayWebGL() {
  if (typeof document === 'undefined') return false;
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl', { alpha: true, antialias: true }) || c.getContext('experimental-webgl'));
  } catch {
    return false;
  }
}

const aRGB = (hex) => {
  const h = (hex || '#888888').replace('#', '');
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const v = parseInt(n, 16);
  /* A lineal a ojo (gamma 2.2 aproximada): sin esto los colores brillantes se
     empastan al sumarles la luz. */
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255].map((c) => c ** 2.2);
};

/** La inversa transpuesta 3×3, que hace falta porque las poses achatan. */
function matrizNormal(m) {
  const a = [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]];
  const det = a[0] * (a[4] * a[8] - a[5] * a[7]) - a[1] * (a[3] * a[8] - a[5] * a[6]) + a[2] * (a[3] * a[7] - a[4] * a[6]);
  const d = Math.abs(det) < 1e-9 ? 1 : 1 / det;
  return new Float32Array([
    (a[4] * a[8] - a[5] * a[7]) * d, (a[5] * a[6] - a[3] * a[8]) * d, (a[3] * a[7] - a[4] * a[6]) * d,
    (a[2] * a[7] - a[1] * a[8]) * d, (a[0] * a[8] - a[2] * a[6]) * d, (a[1] * a[6] - a[0] * a[7]) * d,
    (a[1] * a[5] - a[2] * a[4]) * d, (a[2] * a[3] - a[0] * a[5]) * d, (a[0] * a[4] - a[1] * a[3]) * d,
  ]);
}

/** La matriz de un grupo: girar y escalar alrededor de su pivote. */
export function matrizDeGrupo(mov, pivote = [0, 0, 0]) {
  const m = multiplicar(trasladar(pivote[0] + mov.en[0], pivote[1] + mov.en[1], pivote[2] + mov.en[2]),
    transformacion({ giro: mov.giro, esc: mov.esc }));
  return multiplicar(m, trasladar(-pivote[0], -pivote[1], -pivote[2]));
}

/* --------------------------------------------------------------- motor --- */
let compartido = null;

/** El motor, uno solo por página. Devuelve null si no hay WebGL. */
export function motor() {
  if (compartido !== null) return compartido || null;
  compartido = crear();
  return compartido;
}

function crear() {
  if (typeof document === 'undefined') return false;
  const lienzo = document.createElement('canvas');
  lienzo.width = 16; lienzo.height = 16;
  const gl = lienzo.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: true, depth: true })
    || lienzo.getContext('experimental-webgl', { alpha: true, antialias: true });
  if (!gl) return false;

  const compilar = (tipo, fuente) => {
    const s = gl.createShader(tipo);
    gl.shaderSource(s, fuente);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
    return s;
  };
  let programa;
  try {
    programa = gl.createProgram();
    gl.attachShader(programa, compilar(gl.VERTEX_SHADER, VS));
    gl.attachShader(programa, compilar(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(programa);
    if (!gl.getProgramParameter(programa, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(programa) || 'link');
  } catch {
    return false;
  }
  gl.useProgram(programa);

  const A = {
    pos: gl.getAttribLocation(programa, 'aPos'),
    nor: gl.getAttribLocation(programa, 'aNor'),
    uv: gl.getAttribLocation(programa, 'aUv'),
  };
  const U = {};
  for (const n of ['uProy', 'uVista', 'uModelo', 'uNormal', 'uInflar', 'uColor', 'uCielo', 'uSuelo', 'uBrillo', 'uOjo', 'uLuz', 'uContorno', 'uConCara', 'uApagado', 'uAmbiente', 'uCara']) {
    U[n] = gl.getUniformLocation(programa, n);
  }
  gl.enableVertexAttribArray(A.pos);
  gl.enableVertexAttribArray(A.nor);
  gl.enableVertexAttribArray(A.uv);
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);

  /* Una textura de 1×1 transparente para cuando no hay cara todavía. */
  const texCara = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texCara);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  /* Sin dar vuelta ni premultiplicar: las UV de revolucion() ya tienen el
     v=0 arriba, y el shader mezcla la cara con `mix`, que quiere el color sin
     multiplicar por su alfa. */
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  /* Ninguna malla llega a 65 535 vértices, pero si alguna creciera hace falta
     esto para los índices de 32 bits. */
  const indicesGrandes = Boolean(gl.getExtension('OES_element_index_uint'));

  const buffers = new WeakMap();
  const subir = (malla) => {
    let b = buffers.get(malla);
    if (b) return b;
    const m = empaquetar(malla);
    const hacer = (datos, destino = gl.ARRAY_BUFFER) => {
      const buf = gl.createBuffer();
      gl.bindBuffer(destino, buf);
      gl.bufferData(destino, datos, gl.STATIC_DRAW);
      return buf;
    };
    const grandes = m.idx.BYTES_PER_ELEMENT === 4;
    if (grandes && !indicesGrandes) throw new Error('malla demasiado grande para este WebGL');
    b = { pos: hacer(m.pos), nor: hacer(m.nor), uv: hacer(m.uv), idx: hacer(m.idx, gl.ELEMENT_ARRAY_BUFFER), n: m.idx.length, tipo: grandes ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT };
    buffers.set(malla, b);
    return b;
  };

  function medir(figura, giroY) {
    /* Cuánto hay que alejarse para que entre entera, mirándola desde donde la
       mira la cámara. Se calcula del bounding, con aire para la animación. */
    const l = figura.limites;
    const r = Math.max(l.hi[0], -l.lo[0], l.hi[2], -l.lo[2]) * Math.SQRT2;
    /* Un 12% de aire arriba: el salto del contento sube 15 mm y no se le
       puede cortar la cabeza en el punto más alto. */
    const alto = (l.hi[1] - Math.min(0, l.lo[1])) * 1.12;
    return { radio: r, alto, centro: [0, alto * 0.5, 0], giroY };
  }

  return {
    disponible: true,
    lienzo,

    /**
     * Pinta la figura sobre `ctx` (un contexto 2D) y devuelve una función que
     * proyecta puntos del mundo a píxeles de ese canvas, para que quien llame
     * ponga encima los destellos, los Zzz y el polvo en el lugar justo.
     */
    dibujar(ctx, {
      figura, colores, pose, cara = null, ancho, alto, giro = -10, apagado = 0, sombra = null, luz = null,
      ambiente = null,
    }) {
      const w = Math.max(8, Math.round(ancho));
      const h = Math.max(8, Math.round(alto));
      if (lienzo.width < w || lienzo.height < h) {
        lienzo.width = Math.max(lienzo.width, w);
        lienzo.height = Math.max(lienzo.height, h);
      }
      gl.viewport(0, lienzo.height - h, w, h);
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(0, lienzo.height - h, w, h);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      const enc = medir(figura, giro);
      const fov = 20;
      /* La distancia justa para que la figura llene el recuadro: la que hace
         falta por el alto y la que hace falta por el ancho, la que mande. Con
         un número fijo, una figura esbelta quedaba nadando en el aire. */
      const mitad = Math.tan(((fov / 2) * Math.PI) / 180);
      const dist = Math.max(enc.alto / 2 / mitad, enc.radio * 1.15 / (mitad * (w / h))) * 1.04;
      const g = (giro * Math.PI) / 180;
      const ojo = [Math.sin(g) * dist, enc.centro[1] + enc.alto * 0.16, Math.cos(g) * dist];
      const proy = perspectiva(fov, w / h, dist * 0.2, dist * 3);
      const vista = mirarDesde(ojo, enc.centro);
      const vp = multiplicar(proy, vista);

      gl.useProgram(programa);
      gl.uniformMatrix4fv(U.uProy, false, proy);
      gl.uniformMatrix4fv(U.uVista, false, vista);
      gl.uniform3fv(U.uCielo, aRGB(colores.cielo));
      gl.uniform3fv(U.uSuelo, aRGB(colores.suelo));
      gl.uniform3fv(U.uBrillo, aRGB(colores.brillo));
      gl.uniform3fv(U.uOjo, new Float32Array(ojo));
      gl.uniform3fv(U.uLuz, new Float32Array(luz || [-0.45, 0.78, 0.65]));
      gl.uniform1f(U.uApagado, apagado);
      gl.uniform3fv(U.uAmbiente, new Float32Array(ambiente
        ? [ambiente.calidez || 0, ambiente.desaturacion || 0, ambiente.contraste || 1]
        : [0, 0, 1]));
      gl.uniform1i(U.uCara, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texCara);
      if (cara && cara.width) {
        try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cara); } catch { /* todavía no pintó */ }
      }

      const mCuerpo = matrizDeGrupo(pose.cuerpo, [0, 0, 0]);
      const contorno = aRGB(colores.contorno);
      const escala = enc.alto / 150;             /* el contorno acompaña al tamaño */

      for (const vuelta of [1, 0]) {             /* primero el contorno, después el color */
        gl.uniform1f(U.uContorno, vuelta);
        gl.uniform1f(U.uInflar, vuelta ? 0.7 * escala : 0);
        gl.cullFace(vuelta ? gl.FRONT : gl.BACK);
        if (vuelta) gl.uniform3fv(U.uColor, contorno);
        for (const parte of figura.partes) {
          const grupo = figura.grupos[parte.grupo];
          const mov = pose.grupos[parte.grupo];
          const mGrupo = mov && grupo ? matrizDeGrupo(mov, grupo.pivote) : null;
          let modelo = multiplicar(mCuerpo, mGrupo || trasladar(0, 0, 0));
          modelo = multiplicar(modelo, parte.matriz);
          gl.uniformMatrix4fv(U.uModelo, false, modelo);
          gl.uniformMatrix3fv(U.uNormal, false, matrizNormal(modelo));
          if (!vuelta) {
            gl.uniform3fv(U.uColor, aRGB(colores[parte.color] || colores.cuerpo));
            gl.uniform1f(U.uConCara, parte.conCara && cara ? 1 : 0);
          }
          const b = subir(parte.malla);
          gl.bindBuffer(gl.ARRAY_BUFFER, b.pos); gl.vertexAttribPointer(A.pos, 3, gl.FLOAT, false, 0, 0);
          gl.bindBuffer(gl.ARRAY_BUFFER, b.nor); gl.vertexAttribPointer(A.nor, 3, gl.FLOAT, false, 0, 0);
          gl.bindBuffer(gl.ARRAY_BUFFER, b.uv); gl.vertexAttribPointer(A.uv, 2, gl.FLOAT, false, 0, 0);
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b.idx);
          gl.drawElements(gl.TRIANGLES, b.n, b.tipo, 0);
        }
      }
      gl.disable(gl.SCISSOR_TEST);
      gl.flush();

      /* El canvas del componente: primero la sombra, después la copia. */
      ctx.clearRect(0, 0, w, h);
      const proyectar = (p) => {
        const c = aplicar(vp, p);
        const wClip = -(vista[2] * p[0] + vista[6] * p[1] + vista[10] * p[2] + vista[14]);
        const k = wClip || 1;
        return [((c[0] / k) * 0.5 + 0.5) * w, (0.5 - (c[1] / k) * 0.5) * h, k];
      };
      if (sombra) {
        const centro = proyectar([0, 0.5, 0]);
        const borde = proyectar([enc.radio * 0.62, 0.5, 0]);
        const rx = Math.abs(borde[0] - centro[0]) * sombra.esc;
        ctx.save();
        ctx.globalAlpha = sombra.alfa;
        ctx.fillStyle = colores.sombra;
        ctx.beginPath();
        ctx.ellipse(centro[0], centro[1], rx, rx * 0.26, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.drawImage(lienzo, 0, 0, w, h, 0, 0, w, h);
      return proyectar;
    },
  };
}
