/* tareas.mjs — qué hay que hacer hoy.
 *
 * Es la pantalla que se abre primero, y por eso este módulo es el corazón de
 * la app. Un tablero que muestra números le deja al usuario el trabajo de
 * interpretarlos; una lista de tareas ya hizo ese trabajo.
 *
 * TRES REGLAS QUE ORDENAN TODO
 *
 * 1. UNA TAREA ES UN VERBO, NO UN ESTADO.
 *    "Regar la Monstera" es una tarea. "Monstera con sed" es un estado. La
 *    diferencia parece cosmética y no lo es: el estado te informa, la tarea
 *    te dice qué hacer con la información.
 *
 * 2. CADA TAREA MUESTRA EL NÚMERO QUE LA JUSTIFICA.
 *    No "necesita agua" sino "la tierra está al 22% y esta especie quiere
 *    entre 25 y 60". Sin el número la app pide fe; con el número se puede
 *    discutir, y un usuario que puede discutirle al aparato es un usuario que
 *    le va a creer cuando tenga razón.
 *
 * 3. LAS TAREAS SE CIERRAN SOLAS.
 *    Si regás, el sensor lo ve y la tarea desaparece sin que nadie toque un
 *    botón. Marcarla como hecha sólo la esconde mientras el sensor se pone al
 *    día. Una app de plantas que te hace tildar casilleros es una app de
 *    listas con plantas de decoración.
 */

/* Cuánto se esconde una tarea marcada como hecha, esperando que el sensor
 * confirme. Dos horas: lo que tarda la tierra en repartir el agua de un riego
 * y el sensor en leer el cambio. Si pasado ese rato la planta sigue seca, la
 * tarea vuelve — y volver es correcto, porque significa que el riego no
 * alcanzó. */
export const GRACIA_MS = 2 * 60 * 60 * 1000;

/* Urgencias, de más a menos. El orden es el de la lista. */
export const URGENCIAS = ['urgente', 'pronto', 'cuando-puedas'];

export const URGENCIA_ES = {
  urgente: 'urgente',
  pronto: 'pronto',
  'cuando-puedas': 'cuando puedas',
};

/* Debajo de esto la batería pide carga. La maceta no lo dibuja (su pantalla
 * sólo muestra ojos): el aviso vive acá y en las notificaciones. */
const BATT_AVISO = 15;
const BATT_CRITICA = 6;

/** Une el nombre de la planta al verbo sin repetir la palabra "planta". */
const conNombre = (verbo, nombre) => `${verbo} ${nombre}`;

/**
 * Las tareas que surgen del estado de UNA maceta. Puede devolver más de una:
 * una planta con sed y con la pila baja tiene dos cosas distintas que pedir,
 * y juntarlas en una sola tarea haría que resolver la fácil esconda la otra.
 */
export function tareasDe(nodo, especie) {
  /* Sin nodo no hay tareas. Sin esta guarda, un `null` producía la tarea
     "terminar el registro" de una maceta que no existe, porque un objeto
     vacío efectivamente no tiene especie. */
  if (!nodo || !nodo.id) {
    return [];
  }
  const t = [];
  const n = nodo;
  const tel = n.tel || {};
  const nombre = n.nombre || 'tu Rooti';
  const sev = n.severity || 'OK';
  const urgente = sev === 'URGENT';

  const add = (tipo, titulo, detalle, urgencia, icono, auto = true) => {
    t.push({
      id: `${n.id}:${tipo}`,
      plantaId: n.id,
      planta: nombre,
      tipo,
      titulo,
      detalle,
      urgencia,
      icono,
      auto,
      edad_s: tel.age_s ?? 0,
    });
  };

  /* --- lo que dice el ánimo ------------------------------------------- */
  switch (n.mood) {
    case 'THIRSTY':
      add('regar', conNombre('Regar', nombre),
        especie
          ? `La tierra está al ${tel.soil_pct}% y ${especie.nombre} quiere entre ${especie.soil_min} y ${especie.soil_max}%.`
          : `La tierra está al ${tel.soil_pct}%.`,
        urgente ? 'urgente' : 'pronto', 'gota');
      break;

    case 'DROWNING':
      /* Ojo con el verbo: acá la acción es NO hacer algo, y eso hay que
       * decirlo explícito o el usuario riega por inercia. */
      add('drenar', `No riegues ${nombre}`,
        `La tierra está al ${tel.soil_pct}%, encharcada. Revisá que la maceta drene y dejala secar.`,
        urgente ? 'urgente' : 'pronto', 'gota-no');
      break;

    case 'SCORCHED':
      add('sombra', conNombre('Correr del sol', nombre),
        `Le están pegando ${formatLuxCorto(tel.lux)} directos. Movela a luz indirecta.`,
        urgente ? 'urgente' : 'pronto', 'sol');
      break;

    case 'DARK':
      add('luz', conNombre('Acercar a la luz', nombre),
        especie
          ? `Está recibiendo ${formatLuxCorto(tel.lux)} y necesita al menos ${formatLuxCorto(especie.lux_min)}.`
          : `Está recibiendo ${formatLuxCorto(tel.lux)}, poca luz.`,
        'pronto', 'luna');
      break;

    case 'COLD':
      add('abrigar', conNombre('Mover de lugar', nombre),
        especie
          ? `Está a ${formatTempCorto(tel.temp_dc)} y no debería bajar de ${formatTempCorto(especie.temp_min_dc)}. Alejala de la ventana.`
          : `Está a ${formatTempCorto(tel.temp_dc)}, hace frío ahí.`,
        urgente ? 'urgente' : 'pronto', 'copo');
      break;

    case 'HOT':
      add('refrescar', conNombre('Mover de lugar', nombre),
        especie
          ? `Está a ${formatTempCorto(tel.temp_dc)} y no debería pasar de ${formatTempCorto(especie.temp_max_dc)}. Alejala de la estufa o del vidrio.`
          : `Está a ${formatTempCorto(tel.temp_dc)}, hace calor ahí.`,
        urgente ? 'urgente' : 'pronto', 'termometro');
      break;

    case 'PARCHED_AIR':
      add('humedad', conNombre('Subir la humedad de', nombre),
        especie
          ? `El aire está al ${tel.rh_pct}% y quiere al menos ${especie.rh_min}%. Pulverizá o juntala con otras plantas.`
          : `El aire está al ${tel.rh_pct}%, muy seco.`,
        'cuando-puedas', 'viento');
      break;

    default:
      break;
  }

  /* --- el riego que se escurrió ---------------------------------------- */
  /* El Rooti vio la tierra subir de golpe y bajar enseguida: el agua pasó
   * por los costados sin empapar. Es la tarea más pedagógica que hay, porque
   * la persona cree que regó y la planta sigue con sed. Si además hay sed,
   * las dos tareas conviven: una dice qué pasó, la otra qué hacer. */
  if (tel.escurre) {
    add('escurrio', `El agua se escurrió en ${nombre}`,
      'La tierra subió y bajó enseguida: el riego pasó por los costados sin empapar. Regá despacio, en dos o tres veces, esperando que la tierra absorba. Si sigue pasando, aflojá la tierra o cambiá el sustrato.',
      'pronto', 'gota');
  }

  /* --- lo que no depende del ánimo ------------------------------------ */

  /* El enlace caído tapa todo lo demás: si no llegan datos, lo que muestre
   * la app sobre esa planta es viejo y no hay que actuar sobre eso. */
  if (n.link === 'CAIDO') {
    add('revisar', conNombre('Revisar el Rooti de', nombre),
      'Hace horas que no manda datos. Puede ser el wifi o la batería.',
      'pronto', 'antena', false);
  }

  const batt = n.nodo?.batt_pct;
  if (!n.nodo?.usb && Number.isFinite(batt) && batt < BATT_AVISO) {
    add('pila', conNombre('Cargar', nombre),
      `Le queda ${batt}%. Enchufalo con un cargador USB-C: mientras carga sigue midiendo.`,
      batt < BATT_CRITICA ? 'urgente' : 'pronto', 'pila', false);
  }

  /* Altas a medio terminar. Son tareas de verdad: con el cofre cerrado la
   * maceta duerme, y sin especie no sabe con qué umbrales juzgar. */
  if (n.revelado === false) {
    add('cofre', 'Abrir el cofre',
      'Tu Rooti duerme hasta que abras el cofre y descubras quién es.',
      'pronto', 'caja', false);
  } else if (!n.especie) {
    add('especie', conNombre('Sacarle una foto a', nombre),
      'Sin saber qué planta es, la cara no puede decir si está bien o mal.',
      'pronto', 'camara', false);
  }

  return t;
}

/**
 * Todas las tareas del kit, ordenadas y sin las que se acaban de hacer.
 *
 * `hechas` es un mapa `{ [idTarea]: timestamp }`. Vive en el teléfono y no en
 * el servidor a propósito: es un estado de interfaz —"ya me ocupé, no me lo
 * muestres más por un rato"— y no un hecho sobre la planta. El hecho sobre la
 * planta lo va a reportar el sensor.
 */
export function tareasDelDia(nodos, especies, hechas = {}, ahora = Date.now()) {
  const porId = new Map((especies || []).map((e) => [e.id, e]));
  const todas = [];

  for (const n of nodos || []) {
    for (const t of tareasDe(n, porId.get(n.especie))) {
      const cuando = hechas[t.id];
      if (cuando && ahora - cuando < GRACIA_MS) {
        continue;   /* recién hecha: se esconde mientras el sensor confirma */
      }
      todas.push(t);
    }
  }

  return ordenarTareas(todas);
}

/**
 * Orden: primero por urgencia, y dentro de cada urgencia la que lleva más
 * tiempo sin resolverse. A igualdad, por nombre para que la lista no baile
 * entre recargas.
 */
export function ordenarTareas(tareas) {
  const rank = (t) => {
    const i = URGENCIAS.indexOf(t.urgencia);
    return i < 0 ? URGENCIAS.length : i;
  };
  return [...(tareas || [])].sort(
    (a, b) => rank(a) - rank(b)
      || (b.edad_s ?? 0) - (a.edad_s ?? 0)
      || String(a.planta).localeCompare(String(b.planta)),
  );
}

/**
 * El resumen de arriba de todo. Se escribe distinto según cuántas cosas haya,
 * porque "0 tareas" y "7 tareas" piden tonos distintos: una felicita, la otra
 * tiene que sonar manejable y no acusatoria.
 */
export function resumenDeTareas(tareas) {
  const n = (tareas || []).length;
  const urgentes = (tareas || []).filter((t) => t.urgencia === 'urgente').length;

  if (n === 0) {
    return { titulo: 'No hay nada que hacer', tono: 'bien',
             detalle: 'Todas tus plantas están cómodas.' };
  }
  if (urgentes > 0) {
    return {
      titulo: urgentes === 1 ? '1 cosa urgente' : `${urgentes} cosas urgentes`,
      tono: 'urgente',
      detalle: n > urgentes ? `y ${n - urgentes} más para después` : '',
    };
  }
  return {
    titulo: n === 1 ? '1 cosa para hacer' : `${n} cosas para hacer`,
    tono: 'pendiente',
    detalle: 'Nada urgente.',
  };
}

/** Cuántas plantas hay en cada estado. Es el contador del encabezado. */
export function contarEstados(nodos) {
  const c = { total: 0, bien: 0, atencion: 0, urgente: 0, sinDatos: 0 };
  for (const n of nodos || []) {
    c.total += 1;
    if (n.link === 'CAIDO' || n.link === 'NUNCA' || n.mood === 'UNKNOWN') {
      c.sinDatos += 1;
    } else if (n.severity === 'URGENT') {
      c.urgente += 1;
    } else if (n.severity === 'WATCH') {
      c.atencion += 1;
    } else {
      c.bien += 1;
    }
  }
  return c;
}

/* ------------------------------------------------------------ formato --- */
/* Versiones cortas, pensadas para meterse adentro de una frase. Las de
   model.mjs son para mostrar un dato solo en su casillero. */
function formatTempCorto(dc) {
  if (!Number.isFinite(dc)) return '—';
  return `${Math.round(dc / 10)} °C`;
}

function formatLuxCorto(lux) {
  if (!Number.isFinite(lux)) return '—';
  if (lux >= 1000) return `${Math.round(lux / 1000)} mil lux`;
  return `${lux} lux`;
}
