/* tiempo.mjs — días y meses, en la zona de cada persona o en UTC. */

export const TZ_POR_DEFECTO = 'America/Argentina/Buenos_Aires';

/** Fecha local "AAAA-MM-DD" en la zona del usuario. */
export function diaLocal(ms, tz = TZ_POR_DEFECTO) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
      .format(new Date(ms));
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
}

/** Hora local "HH:MM". */
export function horaLocal(ms, tz = TZ_POR_DEFECTO) {
  try {
    return new Intl.DateTimeFormat('es-AR', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false })
      .format(new Date(ms));
  } catch {
    return new Date(ms).toISOString().slice(11, 16);
  }
}

export const inicioDiaUtc = (ms) => Date.UTC(new Date(ms).getUTCFullYear(), new Date(ms).getUTCMonth(), new Date(ms).getUTCDate());
export const inicioMesUtc = (ms) => Date.UTC(new Date(ms).getUTCFullYear(), new Date(ms).getUTCMonth(), 1);
export const mesUtc = (ms) => new Date(ms).toISOString().slice(0, 7);
