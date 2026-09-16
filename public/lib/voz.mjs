/* voz.mjs — la voz de cada Rooti, sintetizada mientras escribe.
 *
 * Cuando la planta contesta en la charla, el texto aparece letra por letra
 * y cada letra suena: un blip corto con Web Audio, sin ningún archivo de
 * sonido. Es la voz de los personajes de los videojuegos de antes (Animal
 * Crossing, Undertale): no dice palabras, dice quién habla. Cada Rooti tiene
 * la suya y se reconoce con los ojos cerrados.
 *
 * ARTE COMO DATOS
 *
 * Una voz son unos pocos números: la onda, el rango de frecuencias, el
 * ataque, cuánto dura cada letra, qué letras suenan. Están todos en VOCES,
 * por modelo, para que la artista los afine sin tocar el sintetizador.
 * Los tres que definen el carácter:
 *
 *   Chico Malo    diente de sierra, grave (130–220 Hz), rápido y seco
 *   Chica Chill   senoidal, media (260–380 Hz), ataque suave, con pausas
 *   Kawaii        aguda (500–800 Hz), arpegios en la escala pentatónica
 *
 * CUÁNDO SE CALLA
 *
 * Con el sonido apagado en Ajustes (mute global), y de 23:00 a 08:00 aunque
 * esté prendido: nadie quiere que la planta hable a la madrugada. La
 * caricia (ronroneo) respeta lo mismo. Sin AudioContext (un navegador
 * viejo, o uno que lo bloquea) el texto sale igual, en silencio.
 *
 * Las funciones de arriba son puras y se prueban en Node; sólo `crearVoz` y
 * `ronronear` tocan el navegador.
 */

export const SILENCIO_DESDE = 23;   /* hora local, inclusive                */
export const SILENCIO_HASTA = 8;    /* hora local, exclusive                */

const CLAVE_MUTE = 'rootlab:sonido';

/* Do mayor pentatónica entre 500 y 800 Hz: C5 D5 E5 G5. */
const PENTATONICA = [523.25, 587.33, 659.25, 783.99];

export const VOZ_BASE = Object.freeze({
  onda: 'triangle', fmin: 300, fmax: 440,
  msPorLetra: 34, ataque: 0.010, caida: 0.080, ganancia: 0.050, filtro: 2400,
  suenan: 'todas', pausaComa: 180, pausaPunto: 320, escala: null,
});

export const VOCES = {
  'chico-malo': {
    ...VOZ_BASE,
    nota: 'Grave, rápido y seco: habla como quien no quiere.',
    onda: 'sawtooth', fmin: 130, fmax: 220,
    msPorLetra: 22, ataque: 0.004, caida: 0.060, ganancia: 0.045, filtro: 1400,
    suenan: 'todas', pausaComa: 110, pausaPunto: 220,
  },
  'chica-chill': {
    ...VOZ_BASE,
    nota: 'Suave, sin apuro, con silencios: como si pensara cada frase.',
    onda: 'sine', fmin: 260, fmax: 380,
    msPorLetra: 46, ataque: 0.035, caida: 0.120, ganancia: 0.060, filtro: 3000,
    suenan: 'vocales', pausaComa: 260, pausaPunto: 520,
  },
  kawaii: {
    ...VOZ_BASE,
    nota: 'Aguda y cantada: cada letra sube por una escala pentatónica.',
    onda: 'triangle', fmin: 500, fmax: 800,
    msPorLetra: 32, ataque: 0.008, caida: 0.090, ganancia: 0.050, filtro: 4000,
    suenan: 'todas', pausaComa: 160, pausaPunto: 300, escala: PENTATONICA,
  },
  cresta: {
    ...VOZ_BASE, nota: 'Cuadrada y cortante, medio enojada.',
    onda: 'square', fmin: 180, fmax: 260, msPorLetra: 26, ganancia: 0.032, filtro: 1600,
  },
  visor: {
    ...VOZ_BASE, nota: 'Casi monótona, de aparato.',
    onda: 'square', fmin: 330, fmax: 370, msPorLetra: 30, ataque: 0.002, caida: 0.050, ganancia: 0.030, filtro: 2000,
  },
  ciclope: {
    ...VOZ_BASE, nota: 'Redonda y lenta, de gigante bueno.',
    onda: 'sine', fmin: 190, fmax: 280, msPorLetra: 42, ataque: 0.020, caida: 0.140, ganancia: 0.065,
  },
  hongo: {
    ...VOZ_BASE, nota: 'Esponjosa, un poco más alta que la base.',
    onda: 'triangle', fmin: 360, fmax: 520, msPorLetra: 36, ataque: 0.014,
  },
  glitch: {
    ...VOZ_BASE, nota: 'Salta de grave a agudo sin avisar: mal sintonizada.',
    onda: 'sawtooth', fmin: 240, fmax: 900, msPorLetra: 24, ataque: 0.002, caida: 0.045, ganancia: 0.040, filtro: 5000,
  },
};

/** La voz de un modelo; la base si no tiene una propia. */
export const vozDe = (modelo) => VOCES[modelo] || VOZ_BASE;

const VOCALES = /[aeiouáéíóúü]/i;
const LETRA = /[\p{L}\p{N}]/u;

/** Si esta letra hace sonar un blip con esta voz. */
export function suena(voz, letra) {
  if (!LETRA.test(letra)) return false;
  return voz.suenan === 'vocales' ? VOCALES.test(letra) : true;
}

/* Un número estable de 0 a 999 por letra: la misma letra siempre suena
 * igual, así una palabra repetida se reconoce. */
function semilla(letra) {
  let h = 2166136261;
  for (const c of letra.toLowerCase()) h = Math.imul(h ^ c.codePointAt(0), 16777619) >>> 0;
  return h % 1000;
}

/**
 * La frecuencia (Hz) del blip de la letra número `i` del mensaje. En una
 * voz con escala, sube y baja por ella (arpegio); en las demás, las vocales
 * van a la mitad alta del rango y las consonantes a la baja.
 */
export function notaPara(voz, letra, i = 0) {
  if (voz.escala) {
    const n = voz.escala.length;
    const ciclo = 2 * (n - 1);
    const k = i % ciclo;
    return voz.escala[k < n ? k : ciclo - k];
  }
  const ancho = voz.fmax - voz.fmin;
  const s = semilla(letra) / 1000;
  return VOCALES.test(letra)
    ? voz.fmin + ancho * (0.5 + 0.5 * s)
    : voz.fmin + ancho * 0.5 * s;
}

/** Cuánto esperar (ms) después de escribir `letra` antes de la siguiente. */
export function duracionLetra(voz, letra) {
  if (/[.!?…\n]/.test(letra)) return voz.pausaPunto;
  if (/[,;:]/.test(letra)) return voz.pausaComa;
  if (letra === ' ') return Math.round(voz.msPorLetra * 1.3);
  return voz.msPorLetra;
}

/** Si puede sonar ahora: sin mute y fuera del silencio nocturno. */
export function puedeSonar({ silenciado = false, hora = new Date().getHours() } = {}) {
  if (silenciado) return false;
  return !(hora >= SILENCIO_DESDE || hora < SILENCIO_HASTA);
}

export const estaSilenciado = () => { try { return localStorage.getItem(CLAVE_MUTE) === 'off'; } catch { return false; } };
export const silenciar = (si) => { try { localStorage.setItem(CLAVE_MUTE, si ? 'off' : 'on'); } catch { /* privado */ } };

/* ------------------------------------------------------------- audio --- */
let contexto = null;

function audio() {
  if (contexto) return contexto;
  const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  if (!AC) return null;
  try { contexto = new AC(); } catch { return null; }
  return contexto;
}

/* Un blip: oscilador → filtro → envolvente. Dura ataque + caída. */
function blip(ac, voz, hz, cuando) {
  const osc = ac.createOscillator();
  const filtro = ac.createBiquadFilter();
  const g = ac.createGain();
  osc.type = voz.onda;
  osc.frequency.setValueAtTime(hz, cuando);
  filtro.type = 'lowpass';
  filtro.frequency.value = voz.filtro;
  g.gain.setValueAtTime(0.0001, cuando);
  g.gain.linearRampToValueAtTime(voz.ganancia, cuando + voz.ataque);
  g.gain.exponentialRampToValueAtTime(0.0001, cuando + voz.ataque + voz.caida);
  osc.connect(filtro).connect(g).connect(ac.destination);
  osc.start(cuando);
  osc.stop(cuando + voz.ataque + voz.caida + 0.02);
}

/**
 * La voz de un modelo, lista para hablar. `hablar(texto, { alLetra,
 * alTerminar })` escribe el texto letra por letra llamando `alLetra(parcial)`
 * y hace sonar cada una; `parar()` corta (por ejemplo, si se cambia de
 * vista). Devuelve una promesa que termina con el texto completo.
 */
export function crearVoz(modelo, { silenciado = estaSilenciado, hora = () => new Date().getHours() } = {}) {
  const voz = vozDe(modelo);
  let temporizador = null;
  let cancelado = false;

  const sonando = () => puedeSonar({ silenciado: silenciado(), hora: hora() });

  function hablar(texto, { alLetra = () => {}, alTerminar = () => {} } = {}) {
    parar();
    cancelado = false;
    const letras = [...String(texto)];
    const ac = sonando() ? audio() : null;
    if (ac && ac.state === 'suspended') ac.resume().catch(() => {});
    return new Promise((fin) => {
      let i = 0;
      const paso = () => {
        if (cancelado) return;
        if (i >= letras.length) {
          alTerminar(texto);
          fin(texto);
          return;
        }
        const letra = letras[i];
        alLetra(letras.slice(0, i + 1).join(''), i);
        if (ac && suena(voz, letra)) {
          try { blip(ac, voz, notaPara(voz, letra, i), ac.currentTime); } catch { /* sin audio */ }
        }
        i += 1;
        temporizador = setTimeout(paso, duracionLetra(voz, letra));
      };
      paso();
    });
  }

  function parar() {
    cancelado = true;
    clearTimeout(temporizador);
    temporizador = null;
  }

  return { voz, hablar, parar, sonando };
}

/**
 * El ronroneo de la caricia: un tono grave con un temblor de 25 Hz, bajito,
 * que arranca al empezar a acariciar y se apaga solo al soltar. Devuelve
 * `parar()`; sin audio o en silencio, no hace nada.
 */
export function ronronear({ silenciado = estaSilenciado(), hora = new Date().getHours() } = {}) {
  if (!puedeSonar({ silenciado, hora })) return () => {};
  const ac = audio();
  if (!ac) return () => {};
  if (ac.state === 'suspended') ac.resume().catch(() => {});
  try {
    const t = ac.currentTime;
    const osc = ac.createOscillator();
    const lfo = ac.createOscillator();
    const prof = ac.createGain();
    const g = ac.createGain();
    osc.type = 'triangle';
    osc.frequency.value = 62;
    lfo.type = 'sine';
    lfo.frequency.value = 25;
    prof.gain.value = 0.5;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.045, t + 0.25);
    lfo.connect(prof).connect(g.gain);
    osc.connect(g).connect(ac.destination);
    osc.start(t);
    lfo.start(t);
    return () => {
      const fin = ac.currentTime;
      g.gain.cancelScheduledValues(fin);
      g.gain.setValueAtTime(g.gain.value, fin);
      g.gain.linearRampToValueAtTime(0.0001, fin + 0.3);
      osc.stop(fin + 0.35);
      lfo.stop(fin + 0.35);
    };
  } catch {
    return () => {};
  }
}
