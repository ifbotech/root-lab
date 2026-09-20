/* cuerpo.mjs — el Rooti entero, en 3D, con la cara del firmware puesta.
 *
 * LA MACETA MUESTRA LA CARA; LA APP, EL BICHO
 *
 * ROOTKIT tiene una pantalla de 1,44": ahí va la CARA y la dibuja el firmware
 * (art/face.c). En el teléfono se ve el personaje completo, con esa misma cara
 * pegada donde está el vidrio en la figura de verdad. Son dos mitades del
 * mismo bicho, no dos dibujos distintos: la cara es el mismo WebAssembly
 * (lib/caras.mjs) que corre en el ESP32.
 *
 * EL MODELO ES LA FIGURA QUE SE IMPRIME
 *
 * Lo que se ve en la pantalla no es una ilustración inspirada en el juguete:
 * es el juguete. Las mismas mallas salen en STL (tools/rooties-stl.mjs), en
 * milímetros, y cumplen las reglas de FDM sin soportes. Todo eso vive en
 * lib/rooti3d/ y lo comprueba test/rooti3d.test.mjs; acá sólo está el
 * componente: cuándo dibujar, con qué colores y qué hacer cuando lo tocan.
 *
 * SIN BIBLIOTECAS
 *
 * No hay three.js: hay un shader de treinta líneas y un contexto WebGL
 * compartido entre todos los Rooties de la página (lib/rooti3d/motor.mjs). Si
 * el navegador no da WebGL, el componente dibuja el cuerpo plano con la cara
 * encima, que sigue siendo un Rooti reconocible.
 *
 * LO QUE PASA ENCIMA
 *
 *   noche     se sienta, la copa se vence y suelta Zzz. Si está bien, la cara
 *             duerme; si tiene sed, no: la cara sigue diciendo la verdad.
 *   polvo     motas sobre el cuerpo, en lugares fijos para ese Rooti, que se
 *             sacan de a una con `limpiarEn(x, y)`.
 *   mimo      `acariciar(true)` ronronea con todo el cuerpo.
 *   rareza    la rara tira destellos; la épica, lo que digan sus adornos
 *             (corona, aura, luces que flotan).
 */

import { mezclar } from './paletas.mjs';
import { pielDe, modeloPorId } from './rooties.mjs';
import { cara, imagenCara, cargarCaras } from './caras.mjs';
import { ROOTIES, construir } from './rooti3d/formas.mjs';
import { pose, efectos, motasDePolvo, limitar } from './rooti3d/animacion.mjs';
import { motor } from './rooti3d/motor.mjs';
import { iluminacion } from './luz.mjs';

/* La proporción del recuadro. Las figuras miden entre 133 y 156 mm de alto
   por unos 110 de ancho; el recuadro les deja aire arriba para el salto y
   abajo para la sombra. */
export const ANCHO = 200;
export const ALTO = 220;
export const POLVO_MAX = 12;

/* Los cinco, por si alguien quiere recorrerlos sin importar formas.mjs. */
export { ROOTIES };
export { imagenCara };

/* --------------------------------------------------------------- color --- */
/*
 * Los roles que pide cada pieza (formas.mjs) salen de los cinco colores de la
 * piel. `piel` es el cuerpo —y el fondo de la cara, que va pintada encima—,
 * `acento` es lo de arriba, y los demás se derivan: así una piel nueva sigue
 * siendo cinco números en persona.c y no diez.
 */
export function coloresDe(piel, { noche = false } = {}) {
  const cuerpo = piel.piel;
  const acento = piel.acento || mezclar(cuerpo, piel.ojos, 0.35);
  return {
    cuerpo,
    acento,
    claro: mezclar(cuerpo, '#ffffff', 0.45),
    oscuro: mezclar(acento, piel.ojos, 0.45),
    rubor: piel.rubor,
    ojos: piel.ojos,
    /* El contorno no es negro: es el color de los ojos tirado hacia el
       cuerpo. Un negro plano sobre estos colores brillantes los apaga. */
    contorno: mezclar(piel.ojos, cuerpo, 0.18),
    /* La luz: cielo del color de la escena, rebote del piso más cálido. */
    cielo: noche ? mezclar(piel.escena || '#ffffff', '#5b6bb5', 0.55) : mezclar(piel.escena || '#ffffff', '#ffffff', 0.5),
    suelo: noche ? mezclar(cuerpo, '#2a2a4a', 0.65) : mezclar(cuerpo, '#ffe9c4', 0.55),
    brillo: noche ? mezclar('#ffffff', '#9fb4ff', 0.5) : '#ffffff',
    sombra: mezclar(piel.ojos, cuerpo, 0.25),
    escena: piel.escena || mezclar(cuerpo, '#ffffff', 0.82),
  };
}

/** La piel gris del que todavía no despertó. */
export const PIEL_DORMIDA = {
  nombre: 'dormido', fondo: '#cfd5dc', ojos: '#5a6472', piel: '#cfd5dc',
  rubor: '#b4bac2', acento: '#a3aab3', escena: '#eef1f4', adornos: [],
};

/* ------------------------------------------------------------- adornos --- */
/* Lo que la app pinta en 2D encima del 3D, con las posiciones que el motor
   proyecta: así siguen al bicho cuando salta o se sienta. */
const CORONA = 'M-14 0 L-16 -13 L-7 -7 L0 -18 L7 -7 L16 -13 L14 0 Z';

function dibujarEfectos(ctx, lista, proyectar, colores, dpr) {
  /* De atrás hacia adelante: si no, una cosita chica de adelante queda
     tapada por una grande de atrás. */
  const puestos = lista.map((e) => ({ ...e, p: proyectar(e.en) })).sort((a, b) => b.p[2] - a.p[2]);
  for (const e of puestos) {
    const [x, y, z] = e.p;
    if (!Number.isFinite(x) || z <= 0) continue;
    const r = Math.max(1, (e.esc * 3.4 * dpr * 160) / z);
    ctx.save();
    ctx.globalAlpha = limitar(e.alfa, 0, 1);
    switch (e.tipo) {
      case 'copo':
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(1, r * 0.3);
        ctx.lineCap = 'round';
        for (let i = 0; i < 3; i++) {
          const a = (i * Math.PI) / 3;
          ctx.beginPath();
          ctx.moveTo(x - Math.cos(a) * r, y - Math.sin(a) * r);
          ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
          ctx.stroke();
        }
        break;
      case 'vaho':
      case 'burbuja':
        ctx.strokeStyle = e.tipo === 'vaho' ? '#ffffff' : colores.claro;
        ctx.lineWidth = Math.max(1, r * 0.22);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.stroke();
        break;
      case 'polvillo':
        ctx.fillStyle = '#c9b391';
        ctx.beginPath();
        ctx.arc(x, y, r * 0.45, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'zzz':
        ctx.fillStyle = colores.ojos;
        ctx.font = `600 ${Math.round(r * 2.6)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('z', x, y);
        break;
      case 'corazon':
        ctx.fillStyle = colores.rubor;
        ctx.beginPath();
        ctx.moveTo(x, y + r * 0.7);
        ctx.bezierCurveTo(x - r * 1.4, y - r * 0.4, x - r * 0.35, y - r * 1.3, x, y - r * 0.35);
        ctx.bezierCurveTo(x + r * 0.35, y - r * 1.3, x + r * 1.4, y - r * 0.4, x, y + r * 0.7);
        ctx.fill();
        break;
      default: {                                   /* destello */
        ctx.fillStyle = mezclar(colores.rubor, '#ffffff', 0.55);
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = (i * Math.PI) / 4;
          const rr = i % 2 ? r * 0.32 : r;
          ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();
  }
}

function dibujarMotas(ctx, motas, proyectar, dpr) {
  for (const m of motas) {
    const [x, y, z] = proyectar(m.en);
    if (!Number.isFinite(x) || z <= 0) continue;
    const r = Math.max(1.5, (m.r * dpr * 160) / z);
    ctx.save();
    ctx.globalAlpha = 0.62;
    ctx.fillStyle = '#8d7b68';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#e0d6cd';
    ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.34, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

function dibujarCorona(ctx, figura, proyectar, dpr) {
  const [x, y, z] = proyectar([figura.corona[0], figura.corona[1] + 10, 0]);
  if (!Number.isFinite(x) || z <= 0) return;
  const k = (dpr * 150) / z;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  ctx.fillStyle = '#ffd54f';
  ctx.strokeStyle = '#c79100';
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  const p = new Path2D(CORONA);
  ctx.fill(p);
  ctx.stroke(p);
  ctx.restore();
}

/* ----------------------------------------------------------- componente --- */
let secuencia = 0;

/**
 * El Rooti entero. Devuelve un <div> con:
 *
 *   .actualizar({ rareza, animo, noche, dormido, polvo, lux, mirada })
 *   .acariciar(si)         el ronroneo del mimo
 *   .limpiarEn(x, y)       saca las motas que toca; devuelve cuántas quedan
 *   .lienzo                el canvas de la cara (el del firmware)
 *   .estado                lo que está mostrando ahora
 *
 * y adentro un `.cuerpo-ventana` puesto sobre la cara, que es de donde salen
 * y a donde van las cosas que se le tiran (el snack de la ficha).
 */
export function cuerpo({
  persona = 'brote', rareza = 'comun', animo = 'HAPPY', etapa = 0, lado = 200, noche = false, polvo = 0,
  estatico = false, dormido = false, despertar = false, alDespertar = null, clave = '', lux = null, fps = 20, etiqueta = '',
} = {}) {
  const id = ROOTIES.includes(persona) ? persona : 'brote';
  const figura = construir(id);
  const uid = `rc${++secuencia}`;
  const estado = {
    persona: id, rareza, animo, noche, polvo, dormido, despertar, lux,
    mimo: 0, saludo: false, motas: [], desde: 0, desdeSaludo: 0,
  };

  const raiz = document.createElement('div');
  raiz.className = 'cuerpo';
  raiz.id = uid;
  raiz.style.width = `${lado}px`;
  raiz.style.height = `${Math.round((lado * ALTO) / ANCHO)}px`;
  raiz.setAttribute('role', 'img');

  const lienzo3d = document.createElement('canvas');
  lienzo3d.className = 'cuerpo-3d';
  const ctx = lienzo3d.getContext('2d');

  /* La ventana de la cara: un rectángulo vacío puesto donde el motor proyecta
     el vidrio del TFT. La ficha lo usa para saber dónde está la boca cuando
     le tira un snack, y adentro vive el canvas de la cara, que se sigue
     dibujando (invisible) porque es la textura. */
  const ventana = document.createElement('div');
  ventana.className = 'cuerpo-ventana';
  raiz.append(lienzo3d, ventana);

  const animoVisible = () => (estado.noche && ['HAPPY', 'SLEEPING'].includes(estado.animo) ? 'SLEEPING' : estado.animo);
  /* La cara se dibuja SIN el sensor de luz: acá es una textura, y la luz del
     cuarto se la pone el motor al bicho entero (si no, la pantalla tendría una
     luz y el cuerpo otra, y se vería el recuadro pegado). */
  const fuente = cara({
    persona: id, rareza, animo: animoVisible(), etapa, lado: 128, fps: estatico ? 2 : fps, clave, lux: null,
    modo: dormido ? 'dormida' : despertar ? 'despertar' : 'cara', etiqueta: '', alTerminar: alDespertar,
  });
  fuente.classList.add('cuerpo-cara-fuente');
  fuente.setAttribute('aria-hidden', 'true');
  ventana.append(fuente);

  const gl = motor();



  let piel = null;
  let colores = null;
  let dpr = 1;
  let ancho = 0;
  let alto = 0;

  function medir() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = raiz.getBoundingClientRect();
    ancho = Math.max(32, Math.round((r.width || lado) * dpr));
    alto = Math.max(32, Math.round((r.height || (lado * ALTO) / ANCHO) * dpr));
    if (lienzo3d.width !== ancho || lienzo3d.height !== alto) {
      lienzo3d.width = ancho;
      lienzo3d.height = alto;
    }
  }

  function pintarColores() {
    piel = estado.dormido ? PIEL_DORMIDA : (pielDe(id, estado.rareza) || pielDe(id, 'comun'));
    colores = coloresDe(piel, { noche: estado.noche });
    const adornos = estado.dormido ? [] : piel.adornos || [];
    raiz.className = `cuerpo cuerpo-${id} rareza-${estado.dormido ? 'dormido' : estado.rareza}`
      + `${estado.noche ? ' noche' : ''}${estado.mimo ? ' mimo' : ''}${gl ? '' : ' sin-3d'}`;
    raiz.style.setProperty('--cuerpo-fondo', colores.escena);
    raiz.style.setProperty('--cuerpo-cuerpo', colores.cuerpo);
    raiz.style.setProperty('--cuerpo-acento', colores.acento);
    raiz.style.setProperty('--cuerpo-ojos', colores.ojos);
    raiz.style.setProperty('--cuerpo-rubor', colores.rubor);
    const nombre = modeloPorId(id)?.nombre || 'Rooti';
    raiz.setAttribute('aria-label', etiqueta || (estado.dormido
      ? `${nombre}, dormido`
      : `${nombre}, piel ${piel.nombre}${estado.noche ? ', durmiendo' : ''}`));
    raiz.dataset.adornos = adornos.join(' ');
  }

  /** Dibuja y devuelve la proyección, que sirve para saber dónde quedó todo. */
  function cuadro(t) {
    if (!colores) return null;
    medir();
    const p = pose(figura, { ...estado, animo: animoVisible() }, t);
    if (!gl) { pintarSinWebGL(); return null; }
    const proyectar = gl.dibujar(ctx, {
      figura,
      colores,
      pose: p,
      cara: fuente,
      ancho,
      alto,
      giro: estado.dormido ? -8 : -10,
      apagado: estado.dormido ? 0.85 : 0,
      sombra: p.sombra,
      luz: estado.noche ? [-0.3, 0.9, 0.42] : [-0.45, 0.78, 0.65],
      /* Lo que dice el sensor de luz: la misma cuenta que usa la cara. */
      ambiente: estado.dormido ? null : iluminacion(estado.lux),
      /* El fondo que la textura trae y que no hay que pintar. Dormido, el
         firmware apaga la pantalla y el fondo es negro; despierto, es el color
         del cuerpo, porque la cara va pintada encima. */
      fondoCara: estado.dormido ? '#000000' : colores.cuerpo,
    });
    const adornos = estado.dormido ? [] : piel.adornos || [];
    dibujarMotas(ctx, estado.motas, proyectar, dpr);
    if (adornos.includes('corona') && !estado.noche) dibujarCorona(ctx, figura, proyectar, dpr);
    dibujarEfectos(
      ctx,
      efectos(figura, { ...estado, animo: animoVisible(), rareza: estado.dormido ? 'comun' : estado.rareza }, t),
      proyectar, colores, dpr,
    );

    /* La ventana de la cara, en píxeles CSS, para quien le tire cosas. */
    const c = figura.cara;
    const frente = figura.limites.hi[2];
    const centro = proyectar([0, c.y, frente]);
    const borde = proyectar([c.ancho / 2, c.y, frente]);
    const mitad = Math.abs(borde[0] - centro[0]) / dpr;
    ventana.style.left = `${centro[0] / dpr - mitad}px`;
    ventana.style.top = `${centro[1] / dpr - mitad}px`;
    ventana.style.width = `${mitad * 2}px`;
    ventana.style.height = `${mitad * 2}px`;
    return proyectar;
  }

  /* Sin WebGL: el cuerpo plano y la cara, que es lo que no puede faltar. */
  function pintarSinWebGL() {
    ctx.clearRect(0, 0, ancho, alto);
    const r = Math.min(ancho, alto) * 0.36;
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = colores.sombra;
    ctx.beginPath();
    ctx.ellipse(ancho / 2, alto * 0.9, r * 0.9, r * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = colores.cuerpo;
    ctx.strokeStyle = colores.contorno;
    ctx.lineWidth = Math.max(2, r * 0.06);
    ctx.beginPath();
    ctx.ellipse(ancho / 2, alto * 0.55, r, r * 1.14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (fuente.width) {
      const l = r * 1.02;
      ctx.drawImage(fuente, ancho / 2 - l / 2, alto * 0.55 - l / 2, l, l);
    }
    ctx.restore();
    ventana.style.left = `${(ancho / 2 - r * 0.51) / dpr}px`;
    ventana.style.top = `${(alto * 0.55 - r * 0.51) / dpr}px`;
    ventana.style.width = `${(r * 1.02) / dpr}px`;
    ventana.style.height = `${(r * 1.02) / dpr}px`;
  }

  /* ------------------------------------------------------------ el reloj --- */
  /*
   * Un requestAnimationFrame por Rooti, que se apaga cuando no está a la vista
   * (IntersectionObserver) y cuando el sistema pide menos movimiento. Un
   * estático dibuja UN cuadro: la colección tiene quince y no puede animarlos
   * a todos.
   */
  const quieto = estatico || (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  let visible = !estatico;
  let corriendo = false;
  let ultimo = 0;
  const intervalo = 1000 / Math.max(6, Math.min(30, fps));

  function bucle(t) {
    if (!raiz.isConnected || !visible || quieto) { corriendo = false; return; }
    if (t - ultimo >= intervalo) { ultimo = t; cuadro(performance.timeOrigin + t); }
    requestAnimationFrame(bucle);
  }
  function arrancar() {
    if (corriendo || quieto || !visible) return;
    corriendo = true;
    requestAnimationFrame(bucle);
  }

  /* El saludo: el brazo arriba dos segundos. Lo tira la primera vez que el
     Rooti aparece en pantalla, que es cuando alguien lo está mirando. Un
     dormido no saluda, y uno que ya está durmiendo de noche tampoco. */
  let saludado = quieto || dormido || noche;
  function saludar() {
    if (!raiz.isConnected) return;
    saludado = true;
    estado.saludo = true;
    estado.desdeSaludo = performance.timeOrigin + performance.now();
    arrancar();
    setTimeout(() => { estado.saludo = false; }, 2100);
  }
  raiz.saludar = saludar;

  const observador = typeof IntersectionObserver !== 'undefined'
    ? new IntersectionObserver((e) => {
      visible = e[0].isIntersecting;
      if (visible) arrancar();
      if (visible && !saludado && !estado.dormido && !estado.noche) setTimeout(saludar, 420);
    }, { rootMargin: '80px' })
    : null;
  observador?.observe(raiz);

  function ponerPolvo(n) {
    estado.polvo = Math.max(0, Math.min(POLVO_MAX, Math.floor(n) || 0));
    estado.motas = motasDePolvo(figura, estado.polvo, clave || id);
  }

  ponerPolvo(polvo);
  pintarColores();
  estado.desde = performance.timeOrigin + performance.now();
  /* El primer cuadro va enseguida, aunque el observador todavía no haya dicho
     nada: un Rooti que aparece en blanco y se pinta medio segundo después se
     ve como un error. */
  cuadro(estado.desde);
  if (quieto) {
    /* El estático dibuja UN cuadro, pero la cara la pinta un WebAssembly que
       carga después: si no se espera, la textura que se sube está en blanco y
       el Rooti se queda sin cara para siempre. Se redibuja cuando el módulo
       terminó de cargar y una vez más cuando ya pintó su primer cuadro. */
    cargarCaras().then(() => {
      /* Tres repasos: el módulo ya cargó, pero cada cara tarda todavía un
         cuadro o dos en pintarse, y el estático no tiene bucle que la
         alcance. Son tres dibujos de un canvas chico: sale gratis. */
      for (const cuando of [0, 260, 900]) {
        setTimeout(() => { if (raiz.isConnected) cuadro(estado.desde); }, cuando);
      }
    }).catch(() => { /* sin caras, el cuerpo igual se ve */ });
  } else {
    arrancar();
  }

  raiz.lienzo = fuente;
  raiz.figura = figura;
  raiz.estado = estado;
  raiz.actualizar = (cambios = {}) => {
    const antes = { ...estado };
    if (cambios.polvo !== undefined && cambios.polvo !== estado.polvo) ponerPolvo(cambios.polvo);
    for (const k of ['rareza', 'animo', 'noche', 'dormido']) if (cambios[k] !== undefined) estado[k] = cambios[k];
    const c = {};
    if (cambios.lux !== undefined) estado.lux = cambios.lux;
    if (cambios.mirada !== undefined) c.mirada = cambios.mirada;
    if (estado.rareza !== antes.rareza) c.rareza = estado.rareza;
    if (animoVisible() !== fuente._cara?.animo && !estado.dormido) c.animo = animoVisible();
    if (estado.dormido !== antes.dormido) Object.assign(c, { modo: estado.dormido ? 'dormida' : 'cara', persona: id, animo: animoVisible() });
    if (Object.keys(c).length) fuente.actualizar?.(c);
    pintarColores();
    if (quieto) cuadro(performance.timeOrigin + performance.now()); else arrancar();
  };
  raiz.acariciar = (si) => {
    estado.mimo = si ? 1 : 0;
    raiz.classList.toggle('mimo', Boolean(si));
    fuente.acariciar?.(si);
    if (si) arrancar();
  };
  raiz.limpiarEn = (x, y, radio = 18) => {
    if (!estado.motas.length) return -1;
    const proyectar = cuadro(performance.timeOrigin + performance.now());
    if (!proyectar) return -1;
    const antes = estado.motas.length;
    estado.motas = estado.motas.filter((m) => {
      const q = proyectar(m.en);
      return Math.hypot(q[0] / dpr - x, q[1] / dpr - y) > radio + m.r;
    });
    if (estado.motas.length === antes) return -1;
    estado.polvo = estado.motas.length;
    if (quieto) cuadro(performance.timeOrigin + performance.now());
    return estado.motas.length;
  };
  raiz.soltar = () => { observador?.disconnect(); visible = false; };
  return raiz;
}
