/* avisos.mjs — qué notificación mandar, y cuándo callarse.
 *
 * Una app de plantas que notifica de más se silencia en una semana, y una
 * notificación silenciada es peor que ninguna: la que importaba no llega.
 * Así que las reglas son de restricción antes que de alcance:
 *
 *   1. SE AVISA POR ESTADO, NO POR LECTURA.
 *      Una planta con sed durante seis horas son veinticuatro lecturas y un
 *      solo aviso. Si sigue con sed, se repite a las 8 h (o a las 3 h si es
 *      urgente), nunca antes.
 *
 *   2. DE NOCHE NO SE MOLESTA.
 *      Entre las 23 y las 8, hora del usuario, sólo pasa lo urgente: una
 *      planta que se ahoga puede esperar a mañana muy poco; una a la que le
 *      falta luz puede esperar perfectamente.
 *
 *   3. CADA AVISO DICE QUÉ HACER.
 *      "Rulo tiene sed" no alcanza: "La tierra está al 18 %, regala hoy" se
 *      puede resolver sin abrir la app.
 *
 *   4. ANTES DEL COFRE, NADA.
 *      La maceta todavía no tiene personaje ni especie; lo que pida sería
 *      ruido.
 *
 * Todo esto es una función pura: entra el estado y el registro de lo ya
 * enviado, salen los avisos. Mandar es trabajo de push.mjs.
 */

const H = 3600 * 1000;

export const ESPERA = {
  WATCH: 8 * H,
  URGENT: 3 * H,
  bateria: 24 * H,
  caido: 24 * H,
};

export const CALMA = { desde: 23, hasta: 8 };
export const CAIDO_MS = 6 * H;
export const BATERIA_AVISO_MV = 3450;

const temp = (dc) => `${(dc / 10).toFixed(1).replace('.', ',')} °C`;
const lux = (l) => (l >= 1000 ? `${Math.round(l / 1000)} mil lux` : `${l} lux`);

/* Título y cuerpo de cada ánimo. `n` es el nombre, `t` la última lectura y
   `e` la especie (puede faltar). */
const TEXTOS = {
  THIRSTY: (n, t, e) => [`${n} tiene sed`,
    e ? `La tierra está al ${t.suelo} % y le gusta arriba de ${e.soil_min} %. Regala hoy.`
      : `La tierra está al ${t.suelo} %. Regala hoy.`],
  DROWNING: (n, t) => [`${n} se está ahogando`,
    `La tierra está al ${t.suelo} %, encharcada. No la riegues y fijate que la maceta drene.`],
  COLD: (n, t, e) => [`${n} tiene frío`,
    e ? `Hace ${temp(t.temp)} y no le gusta bajar de ${temp(e.temp_min_dc)}. Alejala de la ventana.`
      : `Hace ${temp(t.temp)}. Alejala de la ventana.`],
  HOT: (n, t) => [`${n} tiene calor`,
    `Hace ${temp(t.temp)}. Llevala a un lugar más fresco y ventilado.`],
  SCORCHED: (n, t) => [`A ${n} le pega demasiado sol`,
    `Está recibiendo ${lux(t.lux)}. Pasala a luz indirecta.`],
  DARK: (n, t, e) => [`${n} necesita más luz`,
    e ? `Le llegan ${lux(t.lux)} y necesita al menos ${lux(e.lux_min)}. Acercala a una ventana.`
      : `Le llegan ${lux(t.lux)}. Acercala a una ventana.`],
  PARCHED_AIR: (n, t) => [`El aire está seco para ${n}`,
    `Humedad de ${t.hr} %. Pulverizá las hojas o juntala con otras plantas.`],
};

export const ANIMOS_CON_AVISO = Object.keys(TEXTOS);

/** Hora local (0-23) en la zona horaria del usuario. */
export function horaLocal(ahora, tz) {
  try {
    const s = new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: tz })
      .format(new Date(ahora));
    return Number(s);
  } catch {
    return new Date(ahora).getHours();
  }
}

export function esHoraDeCalma(ahora, tz) {
  const h = horaLocal(ahora, tz);
  return CALMA.desde > CALMA.hasta
    ? h >= CALMA.desde || h < CALMA.hasta
    : h >= CALMA.desde && h < CALMA.hasta;
}

/**
 * Los avisos que corresponde mandar ahora para una planta.
 *
 * @param planta       { id, nombre, persona, revelado }
 * @param dispositivo  { visto, usb, bat_mv, animo, sev, ultima }  (ultima: la
 *                     última lectura, con suelo/temp/hr/lux)
 * @param especie      la especie de la planta o null
 * @param enviados     { clave: ms del último envío }
 */
export function avisosPendientes({ planta, dispositivo, especie = null, ahora, enviados = {}, tz }) {
  if (!planta || !dispositivo || !planta.revelado) return [];

  const calma = esHoraDeCalma(ahora, tz);
  const nombre = planta.nombre || 'Tu planta';
  const salida = [];
  const vencido = (clave, espera) => !enviados[clave] || ahora - enviados[clave] >= espera;
  const icono = (animo) => `/caras/${planta.persona || 'incognito'}-${animo}.png`;
  const url = `/#planta/${planta.id}`;

  /* --- caído: si no reporta, lo demás no se sabe --------------------- */
  if (dispositivo.visto && ahora - dispositivo.visto > CAIDO_MS) {
    if (!calma && vencido('caido', ESPERA.caido)) {
      const horas = Math.floor((ahora - dispositivo.visto) / H);
      salida.push({
        clave: 'caido', urgente: false, tag: `${planta.id}:caido`,
        titulo: `${nombre} no reporta hace ${horas} h`,
        cuerpo: 'Puede ser el wifi o la batería. Si está enchufado, desenchufalo y volvé a enchufarlo.',
        icono: icono('OFFLINE'), url,
      });
    }
    return salida;
  }

  /* --- el ánimo ---------------------------------------------------------- */
  const animo = dispositivo.animo;
  const sev = dispositivo.sev === 'URGENT' ? 'URGENT' : dispositivo.sev === 'WATCH' ? 'WATCH' : 'OK';
  if (TEXTOS[animo] && sev !== 'OK' && dispositivo.ultima) {
    const clave = `animo:${animo}`;
    const urgente = sev === 'URGENT';
    if ((!calma || urgente) && vencido(clave, ESPERA[sev])) {
      const [titulo, cuerpo] = TEXTOS[animo](nombre, dispositivo.ultima, especie);
      salida.push({ clave, urgente, tag: `${planta.id}:animo`, titulo, cuerpo, icono: icono(animo), url });
    }
  }

  /* --- batería ----------------------------------------------------------- */
  if (!dispositivo.usb && dispositivo.bat_mv > 0 && dispositivo.bat_mv < BATERIA_AVISO_MV) {
    if (!calma && vencido('bateria', ESPERA.bateria)) {
      salida.push({
        clave: 'bateria', urgente: false, tag: `${planta.id}:bateria`,
        titulo: `${nombre} se está quedando sin batería`,
        cuerpo: 'Enchufalo con cualquier cargador USB-C. Mientras carga sigue funcionando.',
        icono: icono('SLEEPING'), url,
      });
    }
  }
  return salida;
}
