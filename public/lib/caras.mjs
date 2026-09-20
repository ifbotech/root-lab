/* caras.mjs — las caras de las macetas, dibujadas por el firmware.
 *
 * El módulo WebAssembly de public/caras/ es rootkit/firmware compilado para
 * el navegador: art/face.c, gfx/aa.c y la tabla de los cinco Rooties con
 * sus tres pieles (core/persona.c). Así la cara
 * que ves en el teléfono es exactamente la que pone la maceta, parpadeo y
 * respiración incluidos, y un cambio de la artista llega a los dos lados a
 * la vez.
 *
 * Todas las caras de la pantalla comparten un solo bucle de animación y un
 * solo módulo (que tiene un framebuffer): cada cuadro se dibujan de a una.
 * Una cara que sale de la pantalla se da de baja sola.
 *
 * Mientras el módulo carga —o si el navegador no tiene WebAssembly— se
 * muestra la imagen fija de public/caras/<rooti>-<rareza>-<ANIMO>.png (o
 * <rooti>-dormido.png, la cara gris de antes del cofre).
 *
 * LA PIEL
 *
 * Cada cara se pinta con la piel que salió del cofre: `rareza` es 'comun',
 * 'raro' o 'epico', los mismos ids que manda la nube en el sync. La figura
 * define el Rooti (`persona`); la rareza, sólo los colores y los adornos.
 *
 * LA CARA NO SALTA DE ÁNIMO
 *
 * Cuando el ánimo cambia, el firmware dibuja una transición de un tercio de
 * segundo (ui/cara.h). Acá se lleva el reloj: `actualizar({animo})` la
 * arranca, y una cara nueva con la misma `clave` (el id de la planta) que
 * una que ya se mostró arranca desde el ánimo que esa tenía, así la
 * transición sobrevive a que la vista se vuelva a pintar.
 *
 * LO QUE SÓLO PASA EN EL TELÉFONO
 *
 * Dos cosas se le agregan a la cara del firmware, después de dibujada, y
 * nunca llegan a la maceta:
 *
 *   - LA LUZ. Con `lux` (lo que midió el BH1750) la cara se ve con esa luz:
 *     en penumbra se apaga y se entibia, a pleno sol gana contraste y le
 *     cruza un brillo. Cuánto, lo decide lib/luz.mjs; se pinta acá con
 *     modos de mezcla del canvas.
 *   - LA CARICIA. `acariciar(true)` la pone contenta con los ojos en ^ ^ y
 *     ronroneando (rk_face_draw_mimo, del mismo módulo), subiendo en un
 *     tercio de segundo; `acariciar(false)` la devuelve a su ánimo.
 *   - LA MIRADA. `actualizar({ mirada: { mira_x, mira_y, preocupado } })`
 *     la hace mirar hacia un lado, preocupada o no (rk_face_draw_mirada):
 *     el invernadero, donde los Rooties se miran entre ellos. El cambio se
 *     suaviza en un tercio de segundo.
 */

import { enBase } from './base.mjs';
import { iluminacion, faseEspecular } from './luz.mjs';
import { RAREZAS } from './rooties.mjs';

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

/** El índice de una rareza para el módulo: 0 común, 1 rara, 2 épica. */
export const indiceRareza = (r) => Math.max(0, RAREZAS.indexOf(r));

/** La imagen fija de una cara, para mientras carga el módulo. */
export function imagenCara({ persona = '', rareza = 'comun', animo = 'HAPPY', modo = 'cara' } = {}) {
  if (modo !== 'cara' || !persona) return enBase(`caras/${persona || 'kip'}-dormido.png`);
  return enBase(`caras/${persona}-${RAREZAS.includes(rareza) ? rareza : 'comun'}-${ANIMOS.includes(animo) ? animo : 'HAPPY'}.png`);
}

/** Escribe texto en el buffer de entrada del módulo. */
export function escribirEntrada(s) {
  const x = modulo.x;
  const bytes = new TextEncoder().encode(String(s)).slice(0, 255);
  const m = new Uint8Array(x.memory.buffer, x.entrada(), 256);
  m.set(bytes);
  m[bytes.length] = 0;
}

export const leerTexto = (p) => texto(p);

/* ------------------------------------------------------------------ luz --- */
/* Un lienzo auxiliar compartido: putImageData ignora los modos de mezcla,
   así que la cara se pone ahí y de ahí se dibuja con los efectos. */
let aux = null;

function conLuz(e, img, luz, ahora) {
  const { ctx, px } = e;
  if (!aux) aux = document.createElement('canvas');
  if (aux.width !== px || aux.height !== px) { aux.width = px; aux.height = px; }
  aux.getContext('2d').putImageData(img, 0, 0);

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.drawImage(aux, 0, 0);

  if (luz.desaturacion > 0) {
    /* Con 'saturation' el resultado toma la saturación de lo que se pinta:
       un gris, con alfa, le quita color de a poco. */
    ctx.globalCompositeOperation = 'saturation';
    ctx.fillStyle = `rgba(128,128,128,${luz.desaturacion.toFixed(3)})`;
    ctx.fillRect(0, 0, px, px);
  }
  if (luz.calidez > 0) {
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = `rgba(255,150,70,${(0.55 * luz.calidez).toFixed(3)})`;
    ctx.fillRect(0, 0, px, px);
  }
  if (luz.vineta > 0) {
    const g = ctx.createRadialGradient(px / 2, px / 2, px * 0.28, px / 2, px / 2, px * 0.78);
    g.addColorStop(0, 'rgba(60,30,10,0)');
    g.addColorStop(1, `rgba(60,30,10,${(0.85 * luz.vineta).toFixed(3)})`);
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, px, px);
  }
  if (luz.contraste > 1) {
    /* La imagen sobre sí misma en 'overlay' es más contraste, sin filtros
       (ctx.filter no está en todos los navegadores). */
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = Math.min(1, (luz.contraste - 1) * 3);
    ctx.drawImage(aux, 0, 0);
    ctx.globalAlpha = 1;
  }
  if (luz.especular > 0) {
    /* Un brillo que cruza en diagonal (45°), como el reflejo del sol en un
       vidrio, animado con el tiempo. */
    const f = faseEspecular(ahora);
    const g = ctx.createLinearGradient(0, 0, px, px);
    const a = (0.32 * luz.especular).toFixed(3);
    const p0 = Math.max(0, Math.min(1, f - 0.12));
    const p1 = Math.max(0, Math.min(1, f));
    const p2 = Math.max(0, Math.min(1, f + 0.12));
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(p0, 'rgba(255,255,255,0)');
    g.addColorStop(p1, `rgba(255,255,255,${a})`);
    g.addColorStop(p2, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, px, px);
  }
  ctx.restore();
}

/* ---------------------------------------------------------------- bucle --- */
const activas = new Set();
let corriendo = false;

/* La mirada de ahora: entre la anterior y la pedida, con la curva de la
   transición. Null si no hay ninguna. */
const SIN_MIRADA = { mira_x: 0, mira_y: 0, preocupado: 0 };
function miradaActual(e, ahora) {
  if (!e.miradaObjetivo) return null;
  const pasado = ahora - e.miradaT0;
  const pct = modulo.transicionMs && modulo.x.cara_anim_pct
    ? (pasado >= modulo.transicionMs ? 100 : modulo.x.cara_anim_pct(Math.max(0, Math.floor(pasado)))) : 100;
  const d = e.miradaDesde || SIN_MIRADA;
  const o = e.miradaObjetivo;
  const l = (a, b) => Math.round(a + ((b - a) * pct) / 100);
  return { mira_x: l(d.mira_x, o.mira_x), mira_y: l(d.mira_y, o.mira_y), preocupado: l(d.preocupado, o.preocupado) };
}
const mirando = (e) => e.miradaT0 !== undefined && performance.now() - e.miradaT0 < (modulo?.transicionMs || 0);

/* Cuánto mimo hay ahora: sube o baja con la curva de la transición. */
function mimoActual(e, ahora) {
  if (!modulo.transicionMs || !modulo.x.cara_anim_pct) return e.mimo ? 100 : 0;
  const pasado = Math.floor(ahora - e.mimoT0);
  const pct = pasado >= modulo.transicionMs ? 100 : modulo.x.cara_anim_pct(Math.max(0, pasado));
  return e.mimo ? e.mimoDesde + Math.round((100 - e.mimoDesde) * pct / 100)
    : e.mimoDesde - Math.round(e.mimoDesde * pct / 100);
}

function pintar(e, ahora) {
  const x = modulo.x;
  const idx = modulo.personas.get(e.persona) ?? 0;
  const r = indiceRareza(e.rareza);
  const ms = Math.max(0, Math.floor(ahora - e.inicio));
  x.lienzo(e.px, e.px);
  if (e.modo === 'dormida' || !e.persona) {
    x.dormida(idx, ms);
  } else if (e.modo === 'despertar') {
    x.despertar(idx, r, ms);
    if (ms >= modulo.despertarMs) {
      e.modo = 'cara';
      e.alTerminar?.();
    }
  } else {
    const animo = Math.max(0, ANIMOS.indexOf(e.animo));
    const pasado = e.desde !== undefined ? performance.now() - e.transicion : Infinity;
    const mimo = e.mimoT0 !== undefined ? mimoActual(e, performance.now()) : 0;
    e.mimoPct = mimo;
    const mir = miradaActual(e, performance.now());
    if (mimo > 0 && x.cara_mimo) {
      x.cara_mimo(idx, r, animo, e.etapa || 0, mimo, ms);
      e.desde = undefined;
    } else if (pasado < modulo.transicionMs && x.cara_mezcla) {
      x.cara_mezcla(idx, r, Math.max(0, ANIMOS.indexOf(e.desde)), animo, x.cara_anim_pct(Math.floor(pasado)), e.etapa || 0, 0, ms);
    } else if (mir && (mir.mira_x || mir.mira_y || mir.preocupado) && x.cara_mirada) {
      e.desde = undefined;
      x.cara_mirada(idx, r, animo, e.etapa || 0, mir.mira_x, mir.mira_y, mir.preocupado, ms);
    } else {
      e.desde = undefined;
      x.cara(idx, r, animo, e.etapa || 0, ms);
    }
    if (mimo === 0 && !e.mimo) e.mimoT0 = undefined;
  }
  const datos = new Uint8ClampedArray(x.memory.buffer, x.rgba(), e.px * e.px * 4);
  const img = new ImageData(new Uint8ClampedArray(datos), e.px, e.px);
  const luz = e.modo === 'cara' && e.persona ? iluminacion(e.lux) : null;
  if (luz && !luz.neutra) conLuz(e, img, luz, ahora);
  else e.ctx.putImageData(img, 0, 0);
  e.pintada = true;
  e.c.style.backgroundImage = '';
}

/* Cuándo una cara necesita cuadros seguidos: en la transición, con mimo, y
   con el brillo del sol cruzándola. */
const animada = (e) => e.desde !== undefined || e.mimoT0 !== undefined || mirando(e)
  || (e.lux !== null && e.lux !== undefined && !iluminacion(e.lux).neutra && iluminacion(e.lux).especular > 0);

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
    if (t - e.ultimo < 1000 / (animada(e) ? 30 : e.fps)) continue;
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
 *   persona   id del Rooti ('brote'); vacío dibuja un Rooti dormido
 *   rareza    la piel: 'comun' | 'raro' | 'epico'
 *   animo     uno de ANIMOS
 *   etapa     0..4, los adornos que ganó el vínculo
 *   modo      'cara' | 'dormida' | 'despertar'
 *   lado      tamaño en pixeles CSS
 *   clave     identidad de la cara entre repintadas (el id de la planta):
 *             con ella, un cambio de ánimo se anima aunque el lienzo sea nuevo
 *   lux       la luz que midió el Rooti, o null: la cara se ve con esa luz
 *
 * Devuelve el <canvas>, con un método `actualizar({...})` para cambiar
 * ánimo, modo, persona o luz sin recrearlo, y `acariciar(si)` para el mimo.
 */
export function cara({
  persona = '', rareza = 'comun', animo = 'HAPPY', etapa = 0, modo = 'cara', lado = 120,
  clase = '', fps = 24, alTerminar = null, etiqueta = '', clave = '', lux = null,
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
  if (modo !== 'despertar') {
    c.style.backgroundImage = `url(${imagenCara({ persona, rareza, animo, modo })})`;
    c.style.backgroundSize = 'cover';
  }

  const e = {
    c, ctx: c.getContext('2d'), px, persona, rareza, animo, etapa, modo, fps, alTerminar, clave, lux,
    inicio: Date.now(), ultimo: -1e9, creada: performance.now(), visto: false, oculta: false,
    mimo: false, mimoPct: 0, mimoDesde: 0,
  };
  if (clave && persona && modo === 'cara') {
    const previo = ultimoAnimo.get(clave);
    if (previo && previo.animo !== animo && performance.now() - previo.t < RECUERDO_MS) {
      e.desde = previo.animo;
      e.transicion = performance.now();
      c.style.backgroundImage = `url(${imagenCara({ persona, rareza, animo: previo.animo })})`;
    }
    ultimoAnimo.set(clave, { animo, t: performance.now() });
  }
  c._cara = e;
  c.actualizar = ({ mirada, ...cambios }) => {
    if (mirada !== undefined) {
      const o = mirada || SIN_MIRADA;
      const a = e.miradaObjetivo;
      if (!a || a.mira_x !== o.mira_x || a.mira_y !== o.mira_y || a.preocupado !== o.preocupado) {
        e.miradaDesde = miradaActual(e, performance.now()) || SIN_MIRADA;
        e.miradaObjetivo = o;
        e.miradaT0 = performance.now();
        e.ultimo = -1e9;
      }
      if (!Object.keys(cambios).length) return;
    }
    if (cambios.modo && cambios.modo !== e.modo) e.inicio = Date.now();
    if (cambios.animo && cambios.animo !== e.animo && e.modo === 'cara' && (cambios.modo || 'cara') === 'cara') {
      e.desde = e.animo;
      e.transicion = performance.now();
    }
    Object.assign(e, cambios);
    if (e.clave && e.persona) ultimoAnimo.set(e.clave, { animo: e.animo, t: performance.now() });
    e.ultimo = -1e9;
  };
  /* El mimo sube o baja desde donde esté: soltar a mitad de subida baja
     desde ahí, sin saltos. */
  c.acariciar = (si) => {
    if (Boolean(si) === e.mimo && e.mimoT0 !== undefined) return;
    e.mimoDesde = e.mimoPct;
    e.mimo = Boolean(si);
    e.mimoT0 = performance.now();
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
