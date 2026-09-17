/* gamificacion.mjs — el progreso del jardinero, no el de la app.
 *
 * LA REGLA QUE DECIDE QUÉ ENTRA ACÁ
 *
 * Se gana XP por cuidar plantas, nunca por usar la app. Abrir la pantalla,
 * mirar un gráfico o tocar un botón no dan nada. Si dieran, el número
 * mediría enganche en vez de jardinería, y un número que mide enganche
 * termina empujando a la app a pedir atención que no necesita.
 *
 * Todo lo que suma acá tiene una contraparte física verificable por sensor:
 *
 *   un día sano de una planta        -> la planta estuvo en rango todo el día
 *   resolver algo urgente            -> el sensor vio que el problema se fue
 *   una racha                        -> días sanos consecutivos
 *   una etapa del vínculo            -> 7, 30, 90, 180 días sanos
 *
 * De ahí sale una consecuencia incómoda y correcta: **no se puede acelerar.**
 * No hay forma de subir de nivel en una tarde. Alguien que quiera el nivel
 * más alto tiene que mantener plantas vivas medio año, que es exactamente lo
 * que el producto quiere que pase.
 *
 * Y una que conviene no olvidar: los logros de colección son de OBJETOS que
 * el usuario ya compró, así que no dan XP. Tener las seis carcasas demuestra
 * que gastaste plata, no que sepas regar.
 */

/* XP por evento. Los números son chicos a propósito: con un día sano por
 * planta valiendo 10, alguien con tres plantas hace 30 por día, y llegar al
 * último nivel lleva unos siete meses de cuidado sostenido. Esa lentitud es
 * la característica, no un problema de balanceo. */
export const XP = {
  DIA_SANO: 10,
  RESOLVER_URGENTE: 15,
  RESOLVER_TAREA: 5,
  ETAPA: 100,
  RACHA_SEMANA: 25,
};

/* Los niveles. El salto entre uno y otro crece, pero no exponencialmente:
 * una curva agresiva haría que el último nivel sea inalcanzable y eso deja
 * de motivar cuando se nota. */
export const NIVELES = [
  { nivel: 1, desde: 0, titulo: 'Maceta nueva' },
  { nivel: 2, desde: 150, titulo: 'Regador ocasional' },
  { nivel: 3, desde: 500, titulo: 'Mano verde' },
  { nivel: 4, desde: 1200, titulo: 'Jardinero' },
  { nivel: 5, desde: 2500, titulo: 'Jardinero de interior' },
  { nivel: 6, desde: 5000, titulo: 'Botánico aficionado' },
  { nivel: 7, desde: 9000, titulo: 'Sabe lo que hace' },
];

/**
 * XP total a partir del estado real del kit. Se DERIVA, no se acumula: no hay
 * un contador guardado que se pueda desincronizar ni inflar. Si una planta se
 * muere y se borra, su XP se va con ella, y eso es correcto — el número dice
 * cuánto cuidado hay vivo ahora, no cuánto hubo alguna vez.
 */
export function xpTotal(nodos) {
  let xp = 0;
  for (const n of nodos || []) {
    const b = n.bond || {};
    xp += (b.dias_sanos || 0) * XP.DIA_SANO;
    xp += Math.floor((b.mejor_racha || 0) / 7) * XP.RACHA_SEMANA;
    xp += etapasAlcanzadas(b.dias_sanos || 0) * XP.ETAPA;
  }
  return xp;
}

/** Cuántos umbrales de etapa superó. Espejo de rk_stage_from_bond. */
function etapasAlcanzadas(diasSanos) {
  return [7, 30, 90, 180].filter((u) => diasSanos >= u).length;
}

/** Nivel, título y progreso hacia el siguiente. */
export function nivelDe(xp) {
  const n = Number.isFinite(xp) ? Math.max(0, xp) : 0;
  let i = 0;
  while (i + 1 < NIVELES.length && n >= NIVELES[i + 1].desde) i += 1;

  const actual = NIVELES[i];
  const siguiente = NIVELES[i + 1] || null;
  const progreso = siguiente
    ? Math.round(((n - actual.desde) * 100) / (siguiente.desde - actual.desde))
    : 100;

  return {
    ...actual,
    xp: n,
    siguiente,
    progreso: Math.min(100, Math.max(0, progreso)),
    faltan: siguiente ? siguiente.desde - n : 0,
  };
}

/**
 * La racha de la casa: días seguidos sin que ninguna planta llegue a urgente.
 * Es distinta de la racha por planta y es la que más cuesta sostener, porque
 * una sola maceta olvidada la corta para todas.
 *
 * Se guarda en el teléfono porque depende de haber observado cada día, y eso
 * es historia de la app, no estado de la planta.
 */
export function actualizarRacha(racha, hayUrgentes, hoy) {
  const r = racha || { dias: 0, mejor: 0, ultimo: null };
  if (r.ultimo === hoy) {
    return r;                 /* ya se contó hoy */
  }
  if (hayUrgentes) {
    return { dias: 0, mejor: r.mejor, ultimo: hoy };
  }
  const dias = r.dias + 1;
  return { dias, mejor: Math.max(dias, r.mejor), ultimo: hoy };
}

/* Los logros. Cada uno mira el estado y dice si está cumplido; ninguno guarda
 * nada, así que no hay forma de que la lista mienta. */
export const LOGROS = [
  {
    id: 'primera',
    nombre: 'La primera',
    detalle: 'Registrar una planta',
    cumple: (e) => e.nodos.length >= 1,
  },
  {
    id: 'trio',
    nombre: 'Se está poniendo lindo',
    detalle: 'Tener tres Rooties a la vez',
    cumple: (e) => e.nodos.length >= 3,
  },
  {
    id: 'todas-bien',
    nombre: 'Pleno',
    detalle: 'Todas tus plantas cómodas al mismo tiempo',
    cumple: (e) => e.nodos.length >= 2
      && e.nodos.every((n) => n.severity === 'OK'),
  },
  {
    id: 'semana',
    nombre: 'Una semana entera',
    detalle: 'Siete días sin ninguna urgencia',
    cumple: (e) => (e.racha?.mejor || 0) >= 7,
  },
  {
    id: 'mes',
    nombre: 'Un mes sin macanas',
    detalle: 'Treinta días sin ninguna urgencia',
    cumple: (e) => (e.racha?.mejor || 0) >= 30,
  },
  {
    id: 'brote',
    nombre: 'Echó raíz',
    detalle: 'Una planta llega a los 30 días sanos',
    cumple: (e) => e.nodos.some((n) => (n.bond?.dias_sanos || 0) >= 30),
  },
  {
    id: 'ancestral',
    nombre: 'Medio año',
    detalle: 'Una planta llega a los 180 días sanos',
    cumple: (e) => e.nodos.some((n) => (n.bond?.dias_sanos || 0) >= 180),
  },
  {
    id: 'rescate',
    nombre: 'Rescate',
    detalle: 'Sacar una planta de urgente a cómoda en el mismo día',
    cumple: (e) => Boolean(e.rescates),
  },
  {
    id: 'coleccion',
    nombre: 'Los cinco',
    detalle: 'Tener a Brote, Musgo, Pinchito, Bulbo y Champi',
    /* No da XP: tenerlos demuestra que compraste figuras, no que sepas regar. */
    cumple: (e) => (e.coleccion?.rooties || 0) >= 5,
  },
  {
    id: 'epica',
    nombre: 'Piel épica',
    detalle: 'Que un cofre te dé una piel épica (5 %)',
    cumple: (e) => (e.coleccion?.epicas || 0) >= 1,
  },
];

/** Qué logros están cumplidos, con los pendientes al final. */
export function evaluarLogros(estado) {
  const e = {
    nodos: estado?.nodos || [],
    racha: estado?.racha || null,
    coleccion: estado?.coleccion || null,
    rescates: estado?.rescates || 0,
  };
  const evaluados = LOGROS.map((l) => ({
    id: l.id, nombre: l.nombre, detalle: l.detalle, cumplido: Boolean(l.cumple(e)),
  }));
  return [
    ...evaluados.filter((l) => l.cumplido),
    ...evaluados.filter((l) => !l.cumplido),
  ];
}

/**
 * El saludo del encabezado. Cambia con la hora y con el estado, porque un
 * "buenas noches" con dos plantas en urgente suena a que la app no está
 * prestando atención.
 */
export function saludo(hora, hayUrgentes) {
  if (hayUrgentes) {
    return 'Hay algo que mirar';
  }
  if (hora < 6) return 'Todo tranquilo';
  if (hora < 13) return 'Buen día';
  if (hora < 20) return 'Buenas tardes';
  return 'Buenas noches';
}
