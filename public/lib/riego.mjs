/* riego.mjs — calibrar el sensor de tierra y decir CUÁNTA agua.
 *
 * LA CALIBRACIÓN
 *
 * El sensor capacitivo no mide humedad: mide un número crudo (0 a 4095) que
 * baja cuando hay más agua. Qué número es "seco" y cuál "empapado" cambia
 * con cada sensor y con cada sustrato, así que el porcentaje sólo es de fiar
 * si esa planta se calibró: un punto con el sensor al aire (o en la tierra
 * bien seca) y otro con la tierra recién regada a fondo. La nube guarda los
 * dos números por planta y se los manda al Rooti, que es quien convierte
 * crudo en porcentaje (nodo/soil.c). Las reglas de validez de acá son las
 * mismas que las del firmware, y hay un test que las compara.
 *
 * CUÁNTA AGUA
 *
 * "Regá" no alcanza: medio vaso no le hace nada a una maceta de 30 cm y un
 * litro ahoga a una de 10. Con el diámetro de la maceta se estima:
 *
 *   volumen de sustrato   un cilindro del diámetro y de alto 0,9 × diámetro
 *                         (o el alto que se cargó), al 85 % (el borde libre)
 *   agua útil             un sustrato de interior retiene ~25 % de su volumen
 *                         entre "seco para esta planta" y "a capacidad"
 *   lo que falta          de la humedad de ahora al medio del rango de la
 *                         especie, como fracción de esa agua útil
 *
 * Es una regla de tres que se puede explicar, no un modelo hidrológico: da
 * el orden de magnitud correcto (un vaso, medio litro) y se redondea a 10 ml.
 * La app lo muestra con su equivalencia casera y siempre dice "despacio".
 */

export const CRUDO_PISO = 150;      /* por debajo: corto o entrada a masa     */
export const CRUDO_TECHO = 4000;    /* por encima: sensor desconectado        */
export const CAL_TRAMO_MIN = 300;   /* separación mínima entre seco y mojado  */
export const CAL_POR_DEFECTO = Object.freeze({ seco: 2650, mojado: 1180 });
export const CALIBRANDO_MS = 10 * 60 * 1000;

export const MACETA = Object.freeze({ min_cm: 5, max_cm: 80 });
export const RETENCION = 0.25;      /* agua útil por volumen de sustrato      */
export const LLENADO = 0.85;        /* la maceta no se llena hasta el borde   */
export const AGUA = Object.freeze({ min_ml: 30, max_ml: 3000, paso_ml: 10 });

const entero = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : NaN);

/** Espejo de rk_soil_cal_valid: devuelve null si sirve, o por qué no. */
export function errorDeCalibracion(cal) {
  const seco = entero(cal?.seco);
  const mojado = entero(cal?.mojado);
  if (!Number.isFinite(seco) || !Number.isFinite(mojado)) return 'Faltan las dos mediciones.';
  if (seco <= mojado) return 'La medición en seco tiene que dar un número más alto que la mojada. ¿Se invirtieron los pasos?';
  if (seco - mojado < CAL_TRAMO_MIN) return 'Las dos mediciones quedaron muy cerca: la tierra "mojada" tiene que estar regada a fondo.';
  if (seco > CRUDO_TECHO) return 'La medición en seco es demasiado alta: revisá que el sensor esté bien conectado.';
  if (mojado < CRUDO_PISO) return 'La medición mojada es demasiado baja: puede haber un corto en el sensor.';
  return null;
}

export const calibracionValida = (cal) => errorDeCalibracion(cal) === null;

/** Normaliza una calibración válida a enteros, o null. */
export function normalizarCalibracion(cal) {
  if (!calibracionValida(cal)) return null;
  return { seco: entero(cal.seco), mojado: entero(cal.mojado) };
}

/** Crudo -> porcentaje, como nodo/soil.c (null si el crudo no es creíble). */
export function porcentajeDeCrudo(crudo, cal = CAL_POR_DEFECTO) {
  const c = normalizarCalibracion(cal);
  const raw = entero(crudo);
  if (!c || !Number.isFinite(raw) || raw < CRUDO_PISO || raw > CRUDO_TECHO) return null;
  const tramo = c.seco - c.mojado;
  if (raw > c.seco + Math.floor(tramo / 5) || raw + Math.floor(tramo / 5) < c.mojado) return null;
  if (raw >= c.seco) return 0;
  if (raw <= c.mojado) return 100;
  return Math.floor(((c.seco - raw) * 100 + Math.floor(tramo / 2)) / tramo);
}

/** Una maceta válida: { diametro_cm, alto_cm? } en enteros, o null. */
export function normalizarMaceta(m) {
  const d = entero(m?.diametro_cm);
  if (!Number.isFinite(d) || d < MACETA.min_cm || d > MACETA.max_cm) return null;
  const a = entero(m?.alto_cm);
  return { diametro_cm: d, ...(Number.isFinite(a) && a >= MACETA.min_cm && a <= MACETA.max_cm * 1.5 ? { alto_cm: a } : {}) };
}

/** Litros de sustrato de una maceta. */
export function litrosDeSustrato(maceta) {
  const m = normalizarMaceta(maceta);
  if (!m) return null;
  const alto = m.alto_cm || m.diametro_cm * 0.9;
  const cm3 = Math.PI * (m.diametro_cm / 2) ** 2 * alto * LLENADO;
  return Math.round(cm3) / 1000;
}

/**
 * Cuánta agua echar ahora, en ml, para llevar la tierra al medio del rango
 * de la especie. Null si falta la maceta, el rango o la lectura; 0 si la
 * tierra ya está en el medio del rango o por encima.
 */
export function aguaParaRegar({ suelo, soil_min, soil_max, maceta } = {}) {
  const litros = litrosDeSustrato(maceta);
  if (litros === null || ![suelo, soil_min, soil_max].every(Number.isFinite) || soil_max <= soil_min) return null;
  const objetivo = (soil_min + soil_max) / 2;
  if (suelo >= objetivo) return 0;
  /* El rango cómodo de la especie ocupa, más o menos, el agua útil. */
  const fraccion = Math.min(1, (objetivo - suelo) / (soil_max - soil_min));
  const ml = litros * 1000 * RETENCION * fraccion;
  const acotado = Math.min(AGUA.max_ml, Math.max(AGUA.min_ml, ml));
  return Math.round(acotado / AGUA.paso_ml) * AGUA.paso_ml;
}

/** "180 ml (casi un vaso)". */
export function aguaEnPalabras(ml) {
  if (!Number.isFinite(ml) || ml <= 0) return '';
  const texto = ml >= 1000 ? `${(ml / 1000).toFixed(ml % 1000 === 0 ? 0 : 1).replace('.', ',')} l` : `${ml} ml`;
  let casera;
  if (ml < 80) casera = 'un chorrito';
  else if (ml < 160) casera = 'medio vaso';
  else if (ml < 260) casera = 'un vaso';
  else if (ml < 400) casera = 'un vaso y medio';
  else if (ml < 650) casera = 'medio litro';
  else if (ml < 900) casera = 'tres cuartos de litro';
  else if (ml < 1300) casera = 'un litro';
  else casera = `${Math.round(ml / 500) / 2} litros`.replace('.', ',');
  return `${texto} (${casera})`;
}
