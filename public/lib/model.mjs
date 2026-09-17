/* model.mjs — lógica pura de la app.
 *
 * Deliberadamente NO incluye evaluación de estados de ánimo: eso lo calcula
 * cada ROOTKIT en firmware/core/mood.c y llega ya resuelto en cada lectura.
 * Dos implementaciones de la misma regla terminan
 * divergiendo, y el día que divergen el usuario ve una cara en la maceta,
 * otra en el teléfono.
 *
 * Acá va lo que sí es responsabilidad de la vista: formatear, validar
 * entradas antes de mandarlas, y decidir el orden en que se muestran los
 * nodos del kit.
 */

/* Severidades, de más a menos urgente. El orden importa: es el que define
 * qué planta va primero en la lista. */
export const SEVERIDADES = ['URGENT', 'WATCH', 'OK'];

/* Las rarezas del cofre, de la más común a la más rara. Son rarezas de la
 * PIEL: qué Rooti es lo dice la figura; el cofre sortea sus colores. El
 * orden importa: es el que ordena la vista de colección. Los ids son los
 * del firmware y la nube. */
export const RAREZAS = ['comun', 'raro', 'epico'];

export const RAREZA_ES = {
  comun: 'común',
  raro: 'rara',
  epico: 'épica',
};

/* Salud del enlace, tal como la calcula firmware/core/node.c. La app la
 * muestra, no la deduce: el umbral vive en un solo lugar. */
export const LINK_ES = {
  NUNCA: 'sin enlazar',
  VIVO: 'en línea',
  TIBIO: 'demorado',
  CAIDO: 'sin señal',
};

/* Las cinco etapas del vínculo, en el mismo orden que rk_stage_t. */
export const ETAPAS = ['ESPORA', 'BROTE', 'JOVEN', 'MADURO', 'ANCESTRAL'];

export const ETAPA_ES = {
  ESPORA: 'espora',
  BROTE: 'brote',
  JOVEN: 'joven',
  MADURO: 'maduro',
  ANCESTRAL: 'ancestral',
};

/* Días sanos que pide cada etapa. Espejo de STAGE_DIAS en
 * firmware/core/vinculo.c, y hay un test que verifica que no se separen. */
export const ETAPA_DIAS = [0, 7, 30, 90, 180];

export const MOOD_ES = {
  UNKNOWN: 'sin datos',
  OFFLINE: 'sin señal',
  SLEEPING: 'durmiendo',
  HAPPY: 'bien',
  THIRSTY: 'con sed',
  DROWNING: 'encharcada',
  COLD: 'con frío',
  HOT: 'con calor',
  SCORCHED: 'demasiado sol',
  DARK: 'sin luz',
  PARCHED_AIR: 'aire seco',
};

/** Décimas de grado a texto. `236` → `"23,6 °C"`. */
export function formatTemp(dc) {
  if (dc === null || dc === undefined || Number.isNaN(dc)) return '—';
  const signo = dc < 0 ? '-' : '';
  const abs = Math.abs(dc);
  return `${signo}${Math.floor(abs / 10)},${abs % 10} °C`;
}

/** Iluminancia legible. Arriba de mil se abrevia, que es como la lee la gente. */
export function formatLux(lux) {
  if (lux === null || lux === undefined || Number.isNaN(lux)) return '—';
  if (lux >= 10000) return `${Math.round(lux / 1000)}k lux`;
  if (lux >= 1000) return `${(lux / 1000).toFixed(1).replace('.', ',')}k lux`;
  return `${lux} lux`;
}

/** Antigüedad de la última lectura, en palabras. */
export function formatEdad(s) {
  if (s === null || s === undefined || Number.isNaN(s)) return '—';
  if (s < 90) return 'recién';
  if (s < 5400) return `hace ${Math.round(s / 60)} min`;
  if (s < 172800) return `hace ${Math.round(s / 3600)} h`;
  return `hace ${Math.round(s / 86400)} días`;
}

/**
 * La firma de un tablero para decidir si hay que repintar: lo que se ve.
 * La edad de la lectura cuenta como el texto que se muestra ("hace 3 min"),
 * no en segundos, y la espera de la caricia no cuenta (la app la descuenta
 * sola): si no, cada consulta cambiaría la firma y la ficha se rehacería en
 * medio de una caricia.
 */
export function firmaTablero(nodes) {
  return JSON.stringify((nodes || []).map((n) => ({
    ...n,
    tel: n.tel ? { ...n.tel, age_s: formatEdad(n.tel.age_s) } : n.tel,
    mascota: n.mascota ? { ...n.mascota, caricia_en_ms: n.mascota.caricia_en_ms > 0 } : n.mascota,
  })));
}

/** Tensión de celda a porcentaje. Misma curva que firmware/nodo/power.c. */
const CURVA_BATT = [
  [4200, 100], [4100, 92], [4000, 85], [3900, 76], [3800, 66], [3700, 55],
  [3600, 43], [3500, 30], [3400, 18], [3300, 9], [3200, 3], [3000, 0],
];

export function battPct(mv) {
  if (!Number.isFinite(mv)) return 0;
  if (mv >= CURVA_BATT[0][0]) return 100;
  const ultimo = CURVA_BATT[CURVA_BATT.length - 1];
  if (mv <= ultimo[0]) return 0;
  for (let i = 1; i < CURVA_BATT.length; i++) {
    const [mvHi, pctHi] = CURVA_BATT[i - 1];
    const [mvLo, pctLo] = CURVA_BATT[i];
    if (mv >= mvLo) {
      return Math.round(pctLo + ((mv - mvLo) * (pctHi - pctLo)) / (mvHi - mvLo));
    }
  }
  return 0;
}

/**
 * Orden de la lista: primero lo que reclama atención, y dentro de cada
 * severidad por nombre, para que la lista no baile entre recargas.
 *
 * El modelo de carcasa NO entra en el orden. La app se abre para saber qué
 * planta necesita algo, y una maceta con sed importa lo mismo tenga la
 * carcasa que tenga. El modelo se muestra como identidad, no como jerarquía.
 */
export function ordenarNodos(nodes) {
  const rank = (p) => {
    const i = SEVERIDADES.indexOf(p.severity);
    return i < 0 ? SEVERIDADES.length : i;
  };
  return [...(nodes || [])].sort(
    (a, b) => rank(a) - rank(b) || String(a.nombre).localeCompare(String(b.nombre)),
  );
}

/** Cuántos nodos necesitan algo. Es el número del encabezado. */
export function contarAlertas(nodes) {
  return (nodes || []).filter((p) => p.severity === 'URGENT' || p.severity === 'WATCH').length;
}

/**
 * Etapa del vínculo a partir de los días sanos. Misma escalera que
 * rk_stage_from_bond: la app la recalcula en vez de pedirla porque es una
 * tabla de cinco números que no puede divergir, y así la barra de progreso
 * se dibuja sin un viaje más.
 */
export function etapaDe(diasSanos) {
  const d = Number.isFinite(diasSanos) ? diasSanos : 0;
  let i = 0;
  while (i + 1 < ETAPA_DIAS.length && d >= ETAPA_DIAS[i + 1]) i += 1;
  return ETAPAS[i];
}

/** Progreso hacia la próxima etapa, de 0 a 100. 100 en la última. */
export function progresoEtapa(diasSanos) {
  const d = Number.isFinite(diasSanos) ? Math.max(0, diasSanos) : 0;
  const i = ETAPAS.indexOf(etapaDe(d));
  if (i >= ETAPAS.length - 1) return 100;
  const desde = ETAPA_DIAS[i];
  const hasta = ETAPA_DIAS[i + 1];
  return Math.min(100, Math.round(((d - desde) * 100) / (hasta - desde)));
}

/**
 * Todos los aparatos van a batería. Devuelve null y no 0 cuando no hay dato,
 * porque "no sé" y "vacía" son cosas distintas y la interfaz las dibuja
 * distinto.
 */
export function bateriaDe(nodo) {
  if (!nodo) return null;
  if (Number.isFinite(nodo?.nodo?.batt_pct)) return nodo.nodo.batt_pct;
  if (Number.isFinite(nodo?.tel?.batt_mv) && nodo.tel.batt_mv > 0) {
    return battPct(nodo.tel.batt_mv);
  }
  return null;
}

/**
 * Cómo va la colección de pieles: cinco Rooties por tres rarezas. `rooties`
 * cuenta de cuántos Rooties tenés al menos una piel (eso depende de las
 * figuras que tengas) y `epicas`, las épicas (eso, del azar del cofre).
 */
export function progresoColeccion(catalogo, tengo) {
  const mios = tengo || [];
  const lista = catalogo || [];
  const pieles = lista.flatMap((m) => (m.pieles || []).map((p) => p.id || `${m.id}-${p.rareza}`));
  const propias = pieles.filter((id) => mios.includes(id));
  return {
    tengo: propias.length,
    total: pieles.length,
    completa: pieles.length > 0 && propias.length === pieles.length,
    rooties: lista.filter((m) => (m.pieles || []).some((p) => mios.includes(p.id || `${m.id}-${p.rareza}`))).length,
    epicas: propias.filter((id) => id.endsWith('-epico')).length,
  };
}

/**
 * Orden de la colección: los Rooties como vienen del firmware y, dentro de
 * cada uno, las pieles de la común a la épica. Los repetidos no existen como
 * concepto acá —la app registra qué pieles tenés, no cuántas veces te
 * salieron— porque contar duplicados convertiría la colección en un
 * inventario, y un inventario no da ganas de completar nada.
 */
export function ordenarColeccion(catalogo) {
  const rank = (r) => {
    const i = RAREZAS.indexOf(r);
    return i < 0 ? RAREZAS.length : i;
  };
  return (catalogo || []).map((m) => ({
    ...m,
    pieles: [...(m.pieles || [])].sort((a, b) => rank(a.rareza) - rank(b.rareza)),
  }));
}

/**
 * Posición relativa de un valor dentro del rango cómodo de su especie, de 0 a
 * 1, para dibujar la barra. Devuelve null si falta el rango.
 */
export function posicionEnRango(valor, min, max) {
  if (![valor, min, max].every(Number.isFinite) || max <= min) return null;
  return Math.min(1, Math.max(0, (valor - min) / (max - min)));
}

const RE_NOMBRE = /^[A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ .'-]{1,17}$/;

/**
 * Validación de un nombre y una especie. Se hace también acá y no sólo en el servidor porque
 * el ESP32 tiene que poder confiar en lo que le llega sin gastar memoria en
 * mensajes de error largos.
 */
export function validarAlta({ nombre, especie }, especiesValidas) {
  const errores = [];
  const n = (nombre || '').trim();
  if (!n) {
    errores.push('Poné un nombre.');
  } else if (!RE_NOMBRE.test(n)) {
    errores.push('El nombre admite hasta 17 letras, números y espacios.');
  }
  if (!especie) {
    errores.push('Elegí una especie.');
  } else if (especiesValidas && !especiesValidas.includes(especie)) {
    errores.push('Esa especie no está en el catálogo.');
  }
  return { ok: errores.length === 0, errores };
}

/**
 * Cómo presentar una identificación. Por debajo de 0,7 no se da por buena
 * sola: de esa especie salen los umbrales con los que se juzga la planta el
 * resto de su vida, así que conviene que el usuario confirme.
 */
export function interpretarIdentificacion(r) {
  if (!r || !r.especie) return { estado: 'fallo', mensaje: 'No pude reconocerla.' };
  if (r.confianza >= 0.7) {
    return { estado: 'seguro', especie: r.especie, mensaje: `Parece ${r.nombre}.` };
  }
  return {
    estado: 'dudoso',
    especie: r.especie,
    mensaje: `Puede que sea ${r.nombre}, pero no estoy seguro. Revisá antes de guardar.`,
  };
}
