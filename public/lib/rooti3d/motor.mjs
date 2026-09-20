/* motor.mjs — dibujar un Rooti, sin bibliotecas.
 *
 * QUÉ HACE Y QUÉ NO
 *
 * Toma una figura (formas.mjs), una pose (animacion.mjs) y los colores de la
 * piel, y pinta el personaje sobre un canvas 2D cualquiera. No sabe de estado,
 * de tiempo ni del DOM más allá de ese canvas: el que decide cuándo dibujar es
 * cuerpo.mjs.
 *
 * UNA MALLA, CUATRO HUESOS
 *
 * El bicho es una sola superficie: no hay piezas pegadas. Para animarlo, cada
 * vértice trae cuánto le toca de cada hueso (cuerpo, copa, brazo izquierdo,
 * brazo derecho) y el shader mezcla las matrices en esa proporción. Por eso la
 * copa se inclina arrastrando el cogote, y el brazo que saluda dobla el hombro
 * en vez de desprenderse. Esa pertenencia sale del mismo peso con el que se
 * fundieron los bultos al esculpir, así que nunca hay una junta.
 *
 * UN COLOR POR ROL, NO POR VÉRTICE
 *
 * El vértice tampoco guarda un color: guarda cuánto le toca de cada rol
 * (cuerpo, acento, claro, oscuro). Los cuatro colores llegan como uniformes,
 * así que la misma malla sirve para las tres pieles del Rooti, y el verde de
 * una hoja se derrite en el cuerpo en vez de cortarse.
 *
 * UN SOLO CONTEXTO PARA TODOS
 *
 * En la colección puede haber quince Rooties a la vez, y un navegador da unos
 * ocho contextos WebGL antes de empezar a tirar los viejos. Así que hay UNO
 * solo, escondido: se dibuja ahí y se copia con drawImage al canvas 2D de cada
 * uno. Copiar una imagen de 300 px es gratis al lado de perder el contexto.
 *
 * EL SOMBREADO
 *
 * Es un juguete de goma: luz de cielo por arriba y rebote del piso por abajo,
 * una luz principal envuelta (para que la sombra no sea un borde duro), un
 * brillo especular ancho y un contraluz en el borde. Encima, un contorno
 * oscuro dibujado con las caras de atrás infladas: es lo que le da el aire de
 * ilustración y no de render.
 *
 * LA CARA
 *
 * La dibuja el firmware, igual que en la maceta: llega como un canvas
 * (lib/caras.mjs, el mismo WebAssembly que corre en el ESP32) y se pega como
 * textura sobre el frente. Se mezcla sólo donde la superficie mira al frente,
 * para que no aparezca una segunda cara en la nuca.
 */

import { multiplicar, transformacion, trasladar, perspectiva, mirarDesde, aplicar } from './geometria.mjs';

/* ------------------------------------------------------------- shaders --- */
const VS = `
attribute vec3 aPos;
attribute vec3 aNor;
attribute vec2 aUv;
attribute vec4 aRol;
attribute vec4 aHueso;
uniform mat4 uProy;
uniform mat4 uVista;
uniform mat4 uHueso[4];
uniform highp vec3 uColores[4];
uniform float uInflar;
varying vec3 vNor;
varying vec3 vMundo;
varying vec2 vUv;
varying vec3 vColor;
void main() {
  /* La matriz del vértice es la mezcla de las de sus huesos. */
  mat4 H = uHueso[0] * aHueso.x + uHueso[1] * aHueso.y + uHueso[2] * aHueso.z + uHueso[3] * aHueso.w;
  vec3 p = aPos + aNor * uInflar;
  vec4 mundo = H * vec4(p, 1.0);
  vMundo = mundo.xyz;
  vNor = normalize(mat3(H) * aNor);
  vColor = uColores[0] * aRol.x + uColores[1] * aRol.y + uColores[2] * aRol.z + uColores[3] * aRol.w;
  vUv = aUv;
  gl_Position = uProy * uVista * mundo;
}`;

const FS = `
precision mediump float;
uniform vec3 uColor;      /* sólo para el contorno */
uniform highp vec3 uColores[4];
uniform vec3 uFondoCara;  /* el color de fondo de la textura, que no se pinta */
uniform vec3 uCielo;
uniform vec3 uSuelo;
uniform vec3 uBrillo;
uniform vec3 uOjo;
uniform vec3 uLuz;
uniform vec3 uAmbiente;   /* calidez, desaturación, contraste: la luz del cuarto */
uniform float uContorno;
uniform float uConCara;
uniform float uApagado;
uniform sampler2D uCara;
varying vec3 vNor;
varying vec3 vMundo;
varying vec2 vUv;
varying vec3 vColor;
void main() {
  if (uContorno > 0.5) { gl_FragColor = vec4(uColor, 1.0); return; }
  vec3 n = normalize(vNor);
  vec3 base = vColor;
  if (uConCara > 0.5 && n.z > 0.1) {
    vec2 t = vUv;
    if (t.x > 0.0 && t.x < 1.0 && t.y > 0.0 && t.y < 1.0) {
      vec4 c = texture2D(uCara, t);
      /* La cara llega en sRGB y el cuerpo ya está en lineal. */
      vec3 cara = pow(c.rgb, vec3(2.2));
      /* Y se pintan SÓLO los rasgos: donde la textura trae su color de fondo
         no se toca nada. Si se pegara el cuadro entero, ese fondo plano taparía
         el sombreado del cuerpo y la cara se vería como una calcomanía. Así
         queda pintada sobre el bicho y la luz le pasa por encima —y el que
         todavía duerme no lleva un rectángulo negro en la panza—. */
      float rasgo = smoothstep(0.045, 0.11, distance(cara, uFondoCara));
      base = mix(base, cara, rasgo * c.a * smoothstep(0.06, 0.30, n.z));
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
     bicho entero: si se la pusiéramos sólo a la cara, la pantalla se vería
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

/* A lineal a ojo (gamma 2.2): sin esto los colores brillantes se empastan al
   sumarles la luz. */
export const aRGB = (hex) => {
  const h = (hex || '#888888').replace('#', '');
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const v = parseInt(n, 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255].map((c) => c ** 2.2);
};

/** La matriz de un hueso: girar y escalar alrededor de su pivote. */
export function matrizDeHueso(mov, pivote = [0, 0, 0]) {
  const m = multiplicar(
    trasladar(pivote[0] + mov.en[0], pivote[1] + mov.en[1], pivote[2] + mov.en[2]),
    transformacion({ giro: mov.giro, esc: mov.esc }),
  );
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
  } catch (e) {
    /* Sin shader no hay 3D, y el componente dibuja el cuerpo plano. Pero que
       quede dicho por qué: un shader que no compila es un error nuestro, no
       una limitación del aparato. */
    console.warn('rooti3d: el shader no compiló, se dibuja en 2D —', e.message);
    return false;
  }
  gl.useProgram(programa);

  const A = {};
  for (const n of ['aPos', 'aNor', 'aUv', 'aRol', 'aHueso']) A[n] = gl.getAttribLocation(programa, n);
  const U = {};
  for (const n of ['uProy', 'uVista', 'uColor', 'uCielo', 'uSuelo', 'uBrillo', 'uOjo', 'uLuz', 'uAmbiente',
    'uContorno', 'uConCara', 'uApagado', 'uInflar', 'uCara', 'uFondoCara']) U[n] = gl.getUniformLocation(programa, n);
  U.uHueso = [0, 1, 2, 3].map((i) => gl.getUniformLocation(programa, `uHueso[${i}]`));
  U.uColores = [0, 1, 2, 3].map((i) => gl.getUniformLocation(programa, `uColores[${i}]`));
  for (const n of ['aPos', 'aNor', 'aUv', 'aRol', 'aHueso']) gl.enableVertexAttribArray(A[n]);
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);

  const texCara = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texCara);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR],
    [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) {
    gl.texParameteri(gl.TEXTURE_2D, k, v);
  }
  /* Ni dar vuelta ni premultiplicar: las UV ya tienen el v=0 arriba y el
     shader mezcla la cara con `mix`, que quiere el color sin multiplicar. */
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  const indicesGrandes = Boolean(gl.getExtension('OES_element_index_uint'));

  const subidas = new WeakMap();
  const subir = (malla) => {
    let b = subidas.get(malla);
    if (b) return b;
    const buf = (datos, destino = gl.ARRAY_BUFFER) => {
      const x = gl.createBuffer();
      gl.bindBuffer(destino, x);
      gl.bufferData(destino, datos, gl.STATIC_DRAW);
      return x;
    };
    const grandes = malla.idx.BYTES_PER_ELEMENT === 4;
    if (grandes && !indicesGrandes) throw new Error('malla demasiado grande para este WebGL');
    b = {
      pos: buf(malla.pos), nor: buf(malla.nor), uv: buf(malla.uv), rol: buf(malla.rol), hueso: buf(malla.hue),
      idx: buf(malla.idx, gl.ELEMENT_ARRAY_BUFFER), n: malla.idx.length,
      tipo: grandes ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT,
    };
    subidas.set(malla, b);
    return b;
  };

  const HUESOS = ['cuerpo', 'copa', 'brazo-izq', 'brazo-der'];
  const ROLES = ['cuerpo', 'acento', 'claro', 'oscuro'];
  const identidad = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

  return {
    disponible: true,
    lienzo,

    /**
     * Pinta la figura sobre `ctx` (un contexto 2D) y devuelve una función que
     * proyecta puntos del mundo a píxeles de ese canvas, para que quien llame
     * ponga encima los destellos, los Zzz y el polvo en el lugar justo.
     */
    dibujar(ctx, {
      figura, colores, pose, cara = null, ancho, alto, giro = -12, apagado = 0, sombra = null, luz = null,
      ambiente = null, fondoCara = null,
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

      /* El encuadre: la distancia justa para que entre entera, con aire arriba
         para el salto. Con un número fijo, una figura esbelta quedaba nadando. */
      const l = figura.limites;
      const radio = Math.max(l.hi[0], -l.lo[0], l.hi[2], -l.lo[2]) * Math.SQRT1_2 + 12;
      const altoTotal = (l.hi[1] - Math.min(0, l.lo[1])) * 1.14;
      const centro = [0, altoTotal * 0.48, 0];
      const fov = 20;
      const mitad = Math.tan(((fov / 2) * Math.PI) / 180);
      const dist = Math.max(altoTotal / 2 / mitad, (radio * 1.2) / (mitad * (w / h))) * 1.04;
      const g = (giro * Math.PI) / 180;
      const ojo = [Math.sin(g) * dist, centro[1] + altoTotal * 0.14, Math.cos(g) * dist];
      const proy = perspectiva(fov, w / h, dist * 0.2, dist * 3);
      const vista = mirarDesde(ojo, centro);
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
      ROLES.forEach((r, i) => gl.uniform3fv(U.uColores[i], aRGB(colores[r])));
      gl.uniform3fv(U.uFondoCara, aRGB(fondoCara || colores.cuerpo));
      gl.uniform1i(U.uCara, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texCara);
      if (cara && cara.width) {
        try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cara); } catch { /* todavía no pintó */ }
      }

      /* Las cuatro matrices: la del cuerpo entero por la de cada hueso. */
      const mCuerpo = matrizDeHueso(pose.cuerpo, [0, 0, 0]);
      HUESOS.forEach((nombre, i) => {
        const mov = nombre === 'cuerpo' ? null : pose.grupos[nombre];
        const pivote = figura.pivotes[nombre] || [0, 0, 0];
        const m = mov ? multiplicar(mCuerpo, matrizDeHueso(mov, pivote)) : mCuerpo;
        gl.uniformMatrix4fv(U.uHueso[i], false, m || identidad);
      });

      const b = subir(figura.malla);
      gl.bindBuffer(gl.ARRAY_BUFFER, b.pos); gl.vertexAttribPointer(A.aPos, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, b.nor); gl.vertexAttribPointer(A.aNor, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, b.uv); gl.vertexAttribPointer(A.aUv, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, b.rol); gl.vertexAttribPointer(A.aRol, 4, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, b.hueso); gl.vertexAttribPointer(A.aHueso, 4, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b.idx);

      /* Primero el contorno (las caras de atrás, infladas), después el color. */
      const escala = altoTotal / 140;
      gl.uniform1f(U.uContorno, 1);
      gl.uniform1f(U.uInflar, 0.85 * escala);
      gl.uniform1f(U.uConCara, 0);
      gl.uniform3fv(U.uColor, aRGB(colores.contorno));
      gl.cullFace(gl.FRONT);
      gl.drawElements(gl.TRIANGLES, b.n, b.tipo, 0);

      gl.uniform1f(U.uContorno, 0);
      gl.uniform1f(U.uInflar, 0);
      gl.uniform1f(U.uConCara, cara ? 1 : 0);
      gl.cullFace(gl.BACK);
      gl.drawElements(gl.TRIANGLES, b.n, b.tipo, 0);

      gl.disable(gl.SCISSOR_TEST);
      gl.flush();

      /* El canvas del componente: primero la sombra, después la copia. */
      ctx.clearRect(0, 0, w, h);
      const proyectar = (p) => {
        const c = aplicar(vp, p);
        const k = -(vista[2] * p[0] + vista[6] * p[1] + vista[10] * p[2] + vista[14]) || 1;
        return [((c[0] / k) * 0.5 + 0.5) * w, (0.5 - (c[1] / k) * 0.5) * h, k];
      };
      if (sombra) {
        const c0 = proyectar([0, 0.5, 0]);
        const c1 = proyectar([radio * 0.62, 0.5, 0]);
        const rx = Math.abs(c1[0] - c0[0]) * sombra.esc;
        ctx.save();
        ctx.globalAlpha = sombra.alfa;
        ctx.fillStyle = colores.sombra;
        ctx.beginPath();
        ctx.ellipse(c0[0], c0[1], rx, rx * 0.26, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.drawImage(lienzo, 0, 0, w, h, 0, 0, w, h);
      return proyectar;
    },
  };
}
