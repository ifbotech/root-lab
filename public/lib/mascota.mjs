/* mascota.mjs — las reglas del "Pou botánico": felicidad, caricias,
 * polvo, gotas de rocío y la noche.
 *
 * Cada Rooti tiene dos barras:
 *
 *   SALUD      la biológica: la dan la tierra y los sensores reales. No se
 *              puede subir desde la app; se sube cuidando la planta.
 *   FELICIDAD  la emocional: sube con los cuidados que se le dan en la app
 *              y baja despacio si nadie le presta atención.
 *
 * Y cuatro gestos:
 *
 *   ACARICIAR  deslizar el dedo por el cuerpo: ronronea, vibra y suelta
 *              corazones. Suma 5 de felicidad, como mucho una vez cada 4 h
 *              (las demás caricias se sienten igual, pero no suman).
 *   LIMPIAR    si pasan 3 días sin ningún cuidado aparecen motas de polvo
 *              sobre el cuerpo, más cuanto más tiempo pase. Una vez que hay
 *              polvo, sólo la esponja lo saca (una caricia no limpia):
 *              pasarla hasta sacar todas las motas suma 10.
 *   SNACK      una gota de rocío suma 15. Las gotas se ganan manteniendo la
 *              planta en su rango: una cada 8 h de sensores cómodos (el
 *              servidor las cuenta con las lecturas), hasta 9 guardadas.
 *   DORMIR     de 22 a 8 el Rooti se sienta, se pone el gorrito de hoja y
 *              suelta Zzz. Es sólo la escena: los gestos siguen andando.
 *
 * Todo es puro y en milisegundos: lo usa el servidor (que es quien guarda y
 * decide) y la app (que lo muestra y anima). Nada de esto toca la planta: una
 * planta con sed no se arregla acariciándola, y la barra de salud lo dice.
 */

const HORA = 3600 * 1000;
const DIA = 24 * HORA;

export const FELICIDAD_INICIAL = 60;
export const DECAE_POR_DIA = 8;
export const CARICIA = { suma: 5, cadaMs: 4 * HORA };
export const LIMPIEZA = { suma: 10 };
export const SNACK = { suma: 15 };
export const POLVO = { desdeMs: 3 * DIA, minimo: 4, maximo: 12, cadaMs: 8 * HORA };
export const GOTAS = { cadaMs: 8 * HORA, maximo: 9, huecoMaxMs: HORA, bienvenida: 1 };
export const NOCHE = { desde: 22, hasta: 8 };
export const ACCIONES = ['caricia', 'limpiar', 'snack'];

const acotar = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** El estado de una planta recién revelada. */
export function mascotaNueva(t) {
  return {
    felicidad: FELICIDAD_INICIAL,
    t_felicidad: t,
    ultima_interaccion: t,
    ultima_caricia: 0,
    polvo_desde: t,
    gotas: GOTAS.bienvenida,
    ms_optimo: 0,
  };
}

/** Completa un estado guardado a medias (o viejo) con los valores de hoy. */
export function normalizar(m, t) {
  const base = mascotaNueva(t);
  if (!m || typeof m !== 'object') return base;
  const num = (v, def) => (Number.isFinite(Number(v)) ? Number(v) : def);
  return {
    felicidad: acotar(num(m.felicidad, base.felicidad), 0, 100),
    t_felicidad: num(m.t_felicidad, t),
    ultima_interaccion: num(m.ultima_interaccion, t),
    ultima_caricia: num(m.ultima_caricia, 0),
    polvo_desde: num(m.polvo_desde, num(m.ultima_interaccion, t)),
    gotas: acotar(Math.floor(num(m.gotas, base.gotas)), 0, GOTAS.maximo),
    ms_optimo: Math.max(0, num(m.ms_optimo, 0)),
  };
}

/** La felicidad de este instante: la guardada, menos lo que bajó desde entonces. */
export function felicidadEn(m, ahora) {
  const dias = Math.max(0, ahora - m.t_felicidad) / DIA;
  return Math.round(acotar(m.felicidad - DECAE_POR_DIA * dias, 0, 100));
}

/**
 * Cuántas motas de polvo hay: ninguna antes de los 3 días sin cuidados. El
 * reloj del polvo (`polvo_desde`) lo reinicia cualquier cuidado mientras
 * todavía no hay polvo; con polvo encima, sólo limpiar.
 */
export function polvoEn(m, ahora) {
  const sin = ahora - (m.polvo_desde ?? m.ultima_interaccion);
  if (sin < POLVO.desdeMs) return 0;
  return Math.min(POLVO.maximo, POLVO.minimo + Math.floor((sin - POLVO.desdeMs) / POLVO.cadaMs));
}

/** Cuánto falta para que una caricia vuelva a sumar (0 si ya suma). */
export function caricia_falta(m, ahora) {
  if (!m.ultima_caricia) return 0;
  return Math.max(0, m.ultima_caricia + CARICIA.cadaMs - ahora);
}

/**
 * Suma tiempo con la planta cómoda y convierte cada 8 h en una gota. Lo usa
 * el servidor con cada lectura: `ms` es el tramo desde la lectura anterior
 * (un hueco de más de una hora no cuenta: el Rooti no estaba midiendo).
 */
export function acumularOptimo(m, ms) {
  const tramo = Math.min(Math.max(0, ms), GOTAS.huecoMaxMs);
  let optimo = m.ms_optimo + tramo;
  let gotas = m.gotas;
  while (optimo >= GOTAS.cadaMs) {
    optimo -= GOTAS.cadaMs;
    gotas = Math.min(GOTAS.maximo, gotas + 1);
  }
  return { ...m, ms_optimo: optimo, gotas };
}

/**
 * Aplica un gesto. Devuelve `{ mascota, ok, suma, motivo }`: `ok` false si
 * no se pudo (no hay polvo que limpiar, no quedan gotas); `suma` es cuánta
 * felicidad dio (0 si la caricia llegó antes de las 4 h).
 */
export function aplicar(m, accion, ahora) {
  const actual = felicidadEn(m, ahora);
  const polvo = polvoEn(m, ahora);
  const con = (suma, extra = {}) => ({
    mascota: {
      ...m,
      polvo_desde: polvo > 0 ? m.polvo_desde ?? m.ultima_interaccion : ahora,
      ...extra,
      felicidad: acotar(actual + suma, 0, 100),
      t_felicidad: ahora,
      ultima_interaccion: ahora,
    },
    ok: true,
    suma: Math.min(suma, 100 - actual),
    motivo: null,
  });

  switch (accion) {
    case 'caricia':
      if (caricia_falta(m, ahora) > 0) return { ...con(0), motivo: 'espera' };
      return con(CARICIA.suma, { ultima_caricia: ahora });
    case 'limpiar':
      if (polvo === 0) return { mascota: m, ok: false, suma: 0, motivo: 'sin-polvo' };
      return con(LIMPIEZA.suma, { polvo_desde: ahora });
    case 'snack':
      if (m.gotas < 1) return { mascota: m, ok: false, suma: 0, motivo: 'sin-gotas' };
      return con(SNACK.suma, { gotas: m.gotas - 1 });
    default:
      return { mascota: m, ok: false, suma: 0, motivo: 'accion' };
  }
}

/** Lo que ve la app. */
export function publico(m, ahora) {
  return {
    felicidad: felicidadEn(m, ahora),
    polvo: polvoEn(m, ahora),
    gotas: m.gotas,
    caricia_en_ms: caricia_falta(m, ahora),
    optimo_pct: Math.round((m.ms_optimo / GOTAS.cadaMs) * 100),
    ultima_interaccion: m.ultima_interaccion,
  };
}

/** De 22 a 8 duerme. */
export const esNoche = (hora) => hora >= NOCHE.desde || hora < NOCHE.hasta;

/**
 * La salud biológica, de 0 a 100, a partir de lo que dijo el Rooti: la
 * severidad de su ánimo y, dentro del rango cómodo, qué tan cerca del
 * centro está la tierra. Null si no hay datos (sin lectura, sin señal).
 */
export function saludBiologica(nodo) {
  if (!nodo || !nodo.revelado) return null;
  if (['NUNCA', 'CAIDO'].includes(nodo.link) || ['UNKNOWN', 'OFFLINE'].includes(nodo.mood)) return null;
  const suelo = nodo.tel?.soil_pct;
  const e = nodo.especie_info;
  let fino = 0.5;
  if (Number.isFinite(suelo) && e && Number.isFinite(e.soil_min) && e.soil_max > e.soil_min) {
    const medio = (e.soil_min + e.soil_max) / 2;
    const mitad = (e.soil_max - e.soil_min) / 2;
    fino = acotar(1 - Math.abs(suelo - medio) / (mitad * 2), 0, 1);
  }
  switch (nodo.severity) {
    case 'URGENT': return Math.round(18 + 14 * fino);
    case 'WATCH': return Math.round(52 + 16 * fino);
    default: return Math.round(84 + 16 * fino);
  }
}
