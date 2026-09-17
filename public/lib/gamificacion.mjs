/* gamificacion.mjs — la racha de la casa y los logros.
 *
 * UNA SOLA PROGRESIÓN
 *
 * Hubo XP y niveles ("Jardinero de interior", nivel 5). Se sacaron: el número
 * salía entero de los días sanos, así que no decía nada que el vínculo no
 * dijera ya, y eran dos barras para lo mismo. Ahora cada cosa mide una sola:
 *
 *   la MASCOTA     lo de hoy: felicidad, polvo, gotas (lib/mascota.mjs)
 *   el VÍNCULO     lo de meses: días sanos -> etapas -> adornos en la cara
 *                  (model.mjs, etapaDe; firmware core/vinculo.c)
 *   la RACHA       la casa entera: días seguidos sin ninguna urgencia
 *   los LOGROS     hitos del vínculo, de la racha y de la colección
 *
 * LA REGLA QUE DECIDE QUÉ ENTRA ACÁ
 *
 * Se premia cuidar plantas, nunca usar la app. Abrir la pantalla,
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
 * Alguien que quiera la última etapa tiene que mantener una planta viva
 * medio año, que es exactamente lo que el producto quiere que pase.
 *
 * Y una que conviene no olvidar: los logros de colección son de OBJETOS que
 * el usuario ya compró. Tener los cinco Rooties demuestra que gastaste plata,
 * no que sepas regar; por eso van al final de la lista.
 */

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
    id: 'raiz',
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
    /* Tenerlos demuestra que compraste figuras, no que sepas regar. */
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
