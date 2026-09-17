/* vigia.mjs — darse cuenta de que algo anda mal en el servicio, no en una planta.
 *
 * Un Rooti que deja de reportar es asunto de su dueño (server/avisos.mjs le
 * avisa). MUCHOS Rooties que dejan de reportar casi a la vez no son muchas
 * casas sin wifi: es el servidor, el dominio o el certificado, y a quien hay
 * que avisarle es a quien opera ROOTLAB.
 *
 * La regla, a propósito simple:
 *
 *   activos    aparatos de verdad (no emuladores) con planta, vistos en las
 *              últimas 24 h
 *   callados   de esos, los que no reportan hace más de 45 minutos
 *   alarma     si hay al menos 3 callados, son la mitad o más de los activos
 *              y se callaron dentro de la misma ventana de 30 minutos
 *
 * Es puro: recibe la lista y la hora. Quién manda el email y cada cuánto lo
 * decide quien llama (api.revisar, una vez cada 6 h como mucho).
 */
const MIN = 60 * 1000;
const H = 60 * MIN;

export const VIGIA = Object.freeze({
  activoMs: 24 * H,
  calladoMs: 45 * MIN,
  ventanaMs: 30 * MIN,
  minimo: 3,
  fraccion: 0.5,
  esperaMs: 6 * H,
});

export function detectarCaidaMasiva(dispositivos, ahora, regla = VIGIA) {
  const activos = (dispositivos || []).filter((d) => d.planta && d.origen !== 'emulador' && !d.deshabilitado
    && d.visto && ahora - d.visto < regla.activoMs);
  const callados = activos.filter((d) => ahora - d.visto > regla.calladoMs).sort((a, b) => a.visto - b.visto);
  const base = { activos: activos.length, callados: callados.length, alarma: false };
  if (callados.length < regla.minimo || callados.length < activos.length * regla.fraccion) return base;
  /* ¿Se callaron juntos? La ventana más poblada de `ventanaMs`. */
  let mejor = 0;
  let desde = null;
  for (let i = 0; i < callados.length; i++) {
    let j = i;
    while (j < callados.length && callados[j].visto - callados[i].visto <= regla.ventanaMs) j += 1;
    if (j - i > mejor) { mejor = j - i; desde = callados[i].visto; }
  }
  if (mejor < regla.minimo || mejor < activos.length * regla.fraccion) return base;
  return { ...base, alarma: true, juntos: mejor, desde };
}
