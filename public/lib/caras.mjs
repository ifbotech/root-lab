/* caras.mjs — las caras de las macetas, dibujadas por el firmware.
 *
 * El módulo WebAssembly de public/caras/ es rootkit/firmware compilado para
 * el navegador: art/face.c, gfx/aa.c y la tabla de personajes. Así la cara
 * que ves en el teléfono es exactamente la que pone la maceta, parpadeo y
 * respiración incluidos, y un cambio de la artista llega a los dos lados a
 * la vez.
 *
 * Todas las caras de la pantalla comparten un solo bucle de animación y un
 * solo módulo (que tiene un framebuffer): cada cuadro se dibujan de a una.
 * Una cara que sale de la pantalla se da de baja sola.
 *
 * Mientras el módulo carga —o si el navegador no tiene WebAssembly— se
 * muestra la imagen fija de public/caras/<modelo>-<ANIMO>.png.
 *
 * LA CARA NO SALTA DE ÁNIMO
 *
 * Cuando el ánimo cambia, el firmware dibuja una transición de un tercio de
 * segundo (ui/cara.h). Acá se lleva el reloj: `actualizar({animo})` la
 * arranca, y una cara nueva con la misma `clave` (el id de la planta) que
 * una que ya se mostró arranca desde el ánimo que esa tenía, así la
 * transición sobrevive a que la vista se vuelva a pintar.
 */

import { enBase } from './base.mjs';

export const ANIMOS = [
  'UNKNOWN', 'OFFLINE', 'SLEEPING', 'HAPPY', 'THIRSTY', 'DROWNING',
  'COLD', 'HOT', 'SCORCHED', 'DARK', 'PARCHED_AIR',
];

let modulo = null;
let promesa = null;

function texto(p) {
  const m = new Uint8Array(modulo.x.memory.buffer);
  let f = p;
  while (m[f]) f++;
  return new TextDecoder().decode(m.subarray(p, f));
}

/** Carga el módulo una sola vez. Resuelve a null si no se puede. */
export function cargarCaras(url = enBase('caras/rootkit_caras.wasm')) {
  if (!promesa) {
    promesa = (async () => {
      try {
        const r = await fetch(url);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const { instance } = await WebAssembly.instantiate(await r.arrayBuffer(), {});
        modulo = { x: instance.exports, personas: new Map() };
        for (let i = 0; i < modulo.x.personas(); i++) {
          modulo.personas.set(texto(modulo.x.persona_id(i)), i);
        }
        modulo.despertarMs = modulo.x.despertar_ms();
        modulo.transicionMs = modulo.x.transicion_ms ? modulo.x.transicion_ms() : 0;
        return modulo;
      } catch (e) {
        console.warn('caras sin WebAssembly:', e.message);
        return null;
      }
    })();
  }
  return promesa;
}

export const moduloCaras = () => modulo;

/** Escribe texto en el buffer de entrada del módulo. */
export function escribirEntrada(s) {
  const x = modulo.x;
  const bytes = new TextEncoder().encode(String(s)).slice(0, 255);
  const m = new Uint8Array(x.memory.buffer, x.entrada(), 256);
  m.set(bytes);
  m[bytes.length] = 0;
}

export const leerTexto = (p) => texto(p);

/* ---------------------------------------------------------------- bucle --- */
const activas = new Set();
let corriendo = false;

function pintar(e, ahora) {
  const x = modulo.x;
  const idx = modulo.personas.get(e.persona) ?? 0;
  const ms = Math.max(0, Math.floor(ahora - e.inicio));
  x.lienzo(e.px, e.px);
  if (e.modo === 'dormida' || !e.persona) {
    x.dormida(ms);
  } else if (e.modo === 'despertar') {
    x.despertar(idx, ms);
    if (ms >= modulo.despertarMs) {
      e.modo = 'cara';
      e.alTerminar?.();
    }
  } else {
    const animo = Math.max(0, ANIMOS.indexOf(e.animo));
    const pasado = e.desde !== undefined ? performance.now() - e.transicion : Infinity;
    if (pasado < modulo.transicionMs && x.cara_mezcla) {
      x.cara_mezcla(idx, Math.max(0, ANIMOS.indexOf(e.desde)), animo, x.cara_anim_pct(Math.floor(pasado)), e.etapa || 0, 0, ms);
    } else {
      e.desde = undefined;
      x.cara(idx, animo, e.etapa || 0, ms);
    }
  }
  const datos = new Uint8ClampedArray(x.memory.buffer, x.rgba(), e.px * e.px * 4);
  e.ctx.putImageData(new ImageData(new Uint8ClampedArray(datos), e.px, e.px), 0, 0);
  e.pintada = true;
  e.c.style.backgroundImage = '';
}

function bucle(t) {
  for (const e of activas) {
    if (!e.c.isConnected) {
      if (e.visto || t - e.creada > 5000) activas.delete(e);
      continue;
    }
    e.visto = true;
    if (e.oculta) continue;
    /* Durante la transición se dibuja a 30 cuadros, sea cual sea el ritmo
       de reposo de esa cara: es un tercio de segundo y tiene que ser suave. */
    if (t - e.ultimo < 1000 / (e.desde !== undefined ? 30 : e.fps)) continue;
    e.ultimo = t;
    if (modulo) pintar(e, performance.timeOrigin + t);
  }
  if (activas.size) {
    requestAnimationFrame(bucle);
  } else {
    corriendo = false;
  }
}

const observador = typeof IntersectionObserver !== 'undefined'
  ? new IntersectionObserver((entradas) => {
    for (const en of entradas) {
      const e = en.target._cara;
      if (e) e.oculta = !en.isIntersecting;
    }
  })
  : null;

/* El último ánimo que mostró cada planta, para que una cara recién creada
   arranque desde ahí. Se olvida a los dos minutos: después de tanto, un
   cambio ya no es "una transición" sino otra visita. */
const ultimoAnimo = new Map();
const RECUERDO_MS = 120000;

/**
 * Un lienzo con una cara viva.
 *
 *   persona   id del modelo ('kawaii'); vacío dibuja la cara dormida neutra
 *   animo     uno de ANIMOS
 *   etapa     0..4, los adornos que ganó el vínculo
 *   modo      'cara' | 'dormida' | 'despertar'
 *   lado      tamaño en pixeles CSS
 *   clave     identidad de la cara entre repintadas (el id de la planta):
 *             con ella, un cambio de ánimo se anima aunque el lienzo sea nuevo
 *
 * Devuelve el <canvas>, con un método `actualizar({...})` para cambiar
 * ánimo, modo o persona sin recrearlo.
 */
export function cara({
  persona = '', animo = 'HAPPY', etapa = 0, modo = 'cara', lado = 120,
  clase = '', fps = 24, alTerminar = null, etiqueta = '', clave = '',
} = {}) {
  const c = document.createElement('canvas');
  const densidad = Math.min(2, window.devicePixelRatio || 1);
  const px = Math.max(32, Math.min(512, Math.round(lado * densidad)));
  c.width = px;
  c.height = px;
  c.className = `cara ${clase}`.trim();
  c.style.width = `${lado}px`;
  c.style.height = `${lado}px`;
  c.setAttribute('role', 'img');
  c.setAttribute('aria-label', etiqueta || (persona ? `La cara de ${persona}` : 'Una cara dormida'));
  if (persona && modo === 'cara') {
    c.style.backgroundImage = `url(${enBase(`caras/${persona}-${animo}.png`)})`;
    c.style.backgroundSize = 'cover';
  }

  const e = {
    c, ctx: c.getContext('2d'), px, persona, animo, etapa, modo, fps, alTerminar, clave,
    inicio: Date.now(), ultimo: -1e9, creada: performance.now(), visto: false, oculta: false,
  };
  if (clave && persona && modo === 'cara') {
    const previo = ultimoAnimo.get(clave);
    if (previo && previo.animo !== animo && performance.now() - previo.t < RECUERDO_MS) {
      e.desde = previo.animo;
      e.transicion = performance.now();
      c.style.backgroundImage = `url(${enBase(`caras/${persona}-${previo.animo}.png`)})`;
    }
    ultimoAnimo.set(clave, { animo, t: performance.now() });
  }
  c._cara = e;
  c.actualizar = (cambios) => {
    if (cambios.modo && cambios.modo !== e.modo) e.inicio = Date.now();
    if (cambios.animo && cambios.animo !== e.animo && e.modo === 'cara' && (cambios.modo || 'cara') === 'cara') {
      e.desde = e.animo;
      e.transicion = performance.now();
    }
    Object.assign(e, cambios);
    if (e.clave && e.persona) ultimoAnimo.set(e.clave, { animo: e.animo, t: performance.now() });
    e.ultimo = -1e9;
  };
  activas.add(e);
  observador?.observe(c);

  cargarCaras();
  if (!corriendo) {
    corriendo = true;
    requestAnimationFrame(bucle);
  }
  return c;
}
