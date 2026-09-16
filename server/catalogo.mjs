/* catalogo.mjs — especies y modelos.
 *
 * ESPECIES
 *
 * Rangos de confort curados a mano para las plantas de interior más
 * comunes en Argentina. Cuando la IA identifica una planta que está acá, se
 * usan ESTOS números y no los que estime el modelo: una tabla revisada es
 * más confiable que una estimación, y el aparato va a juzgar la planta con
 * ellos durante años. Cuando la planta no está, la IA propone rangos y se
 * guardan como especie propia de esa maceta (ver ia.mjs).
 *
 * Unidades, iguales a las del firmware: humedad de suelo y aire en %,
 * temperatura en DÉCIMAS de grado, luz en lux.
 *
 * MODELOS
 *
 * Generado desde rootkit/firmware/core/persona.c por
 * tools/sincronizar-firmware.mjs. El `idx` es la posición en esa tabla y el
 * color de fondo es la piel del personaje, para que la app lo pinte igual.
 * No editar a mano.
 */

export const ESPECIES = [
  /* id                nombre                       científico                    suelo      temp dC     HR   lux min  lux max  dif */
  e('sansevieria',    'Lengua de suegra',          'Dracaena trifasciata',        8, 35,  150, 320,  30,    800, 30000, 10),
  e('pothos',         'Potus',                     'Epipremnum aureum',          20, 55,  170, 300,  40,    500, 12000, 15),
  e('zamioculcas',    'Zamioculca',                'Zamioculcas zamiifolia',     10, 40,  160, 300,  30,    400, 15000, 18),
  e('cactus',         'Cactus',                    'Cactaceae',                   5, 25,  100, 380,  20,   5000, 80000, 25),
  e('suculenta',      'Suculenta',                 'Echeveria spp.',              5, 30,  100, 350,  20,   4000, 60000, 22),
  e('aloe',           'Aloe vera',                 'Aloe barbadensis',            8, 30,  130, 350,  25,   3000, 50000, 28),
  e('monstera',       'Monstera deliciosa',        'Monstera deliciosa',         25, 60,  180, 300,  50,   1000, 15000, 45),
  e('filodendro',     'Filodendro',                'Philodendron hederaceum',    25, 58,  180, 300,  50,    900, 14000, 40),
  e('costilla-adan',  'Costilla de Adán mini',     'Rhaphidophora tetrasperma',  25, 60,  180, 300,  50,   1000, 14000, 42),
  e('espatifilo',     'Espatifilo',                'Spathiphyllum wallisii',     35, 70,  180, 300,  50,    400,  8000, 30),
  e('dracena',        'Palo de agua',              'Dracaena fragrans',          20, 50,  160, 300,  40,    700, 12000, 25),
  e('cinta',          'Cinta',                     'Chlorophytum comosum',       25, 60,  120, 300,  40,    800, 15000, 12),
  e('ficus-elastica', 'Gomero',                    'Ficus elastica',             20, 55,  160, 300,  40,   1500, 20000, 35),
  e('ficus-lyrata',   'Ficus lyrata',              'Ficus lyrata',               25, 55,  180, 270,  50,   2000, 20000, 85),
  e('helecho',        'Helecho de Boston',         'Nephrolepis exaltata',       45, 80,  160, 260,  70,    600,  8000, 70),
  e('calathea',       'Calathea',                  'Goeppertia spp.',            40, 70,  180, 280,  70,    800,  9000, 78),
  e('maranta',        'Maranta',                   'Maranta leuconeura',         40, 70,  180, 290,  60,    800,  9000, 65),
  e('orquidea',       'Orquídea',                  'Phalaenopsis spp.',          30, 60,  180, 290,  60,   1200, 10000, 75),
  e('anturio',        'Anturio',                   'Anthurium andraeanum',       35, 65,  180, 300,  60,   1000, 12000, 55),
  e('begonia',        'Begonia',                   'Begonia spp.',               35, 65,  160, 280,  50,   1000, 12000, 50),
  e('peperomia',      'Peperomia',                 'Peperomia obtusifolia',      15, 45,  170, 300,  40,    800, 12000, 20),
  e('hoya',           'Flor de cera',              'Hoya carnosa',               15, 45,  160, 300,  40,   1500, 20000, 30),
  e('aglaonema',      'Aglaonema',                 'Aglaonema commutatum',       25, 55,  180, 300,  45,    400, 10000, 22),
  e('areca',          'Palmera areca',             'Dypsis lutescens',           30, 60,  180, 300,  50,   2000, 20000, 48),
  e('albahaca',       'Albahaca',                  'Ocimum basilicum',           35, 65,  180, 320,  40,  10000, 60000, 40),
  e('romero',         'Romero',                    'Salvia rosmarinus',          10, 40,  100, 330,  30,  10000, 80000, 30),
  e('menta',          'Menta',                     'Mentha spicata',             40, 75,  120, 300,  40,   5000, 40000, 25),
  e('tomate',         'Tomate',                    'Solanum lycopersicum',       40, 70,  150, 320,  50,  20000, 90000, 55),
  e('bonsai',         'Bonsái de olmo',            'Ulmus parvifolia',           30, 60,  150, 270,  55,   3000, 25000, 92),
  e('potus-neon',     'Potus neón',                'Epipremnum aureum "Neon"',   20, 55,  170, 300,  45,    800, 12000, 18),
];

function e(id, nombre, cientifico, soilMin, soilMax, tMin, tMax, rh, luxMin, luxMax, dif) {
  return {
    id, nombre, cientifico,
    soil_min: soilMin, soil_max: soilMax,
    temp_min_dc: tMin, temp_max_dc: tMax,
    rh_min: rh, lux_min: luxMin, lux_max: luxMax,
    dificultad: dif,
  };
}

/* ---- generado: no editar a mano ---------------------------------------- */
export const MODELOS = [
  { idx: 0, id: 'cresta', nombre: 'Cresta', rareza: 'COMUN', fondo: '#62c536',
    carcasa: 'carcasas/cresta.stl', lema: 'No te va a agradecer. Igual regala.' },
  { idx: 1, id: 'kawaii', nombre: 'Kawaii', rareza: 'COMUN', fondo: '#ffa8d0',
    carcasa: 'carcasas/kawaii.stl', lema: 'Te quiere aunque la olvides. Eso es peor.' },
  { idx: 2, id: 'visor', nombre: 'Visor', rareza: 'COMUN', fondo: '#3a526a',
    carcasa: 'carcasas/visor.stl', lema: 'Registra. No opina.' },
  { idx: 3, id: 'ciclope', nombre: 'Ciclope', rareza: 'RARO', fondo: '#ffa838',
    carcasa: 'carcasas/ciclope.stl', lema: 'Mira una sola cosa. La mira mucho.' },
  { idx: 4, id: 'hongo', nombre: 'Hongo', rareza: 'RARO', fondo: '#ba8ef2',
    carcasa: 'carcasas/hongo.stl', lema: 'Duerme. Crece igual.' },
  { idx: 5, id: 'glitch', nombre: '?????', rareza: 'SECRETO', fondo: '#1c1c26',
    carcasa: 'carcasas/glitch.stl', lema: 'No estaba en la caja. Igual salio.' },
];
/* ---- fin de lo generado ------------------------------------------------ */

export const especiePorId = (id) => ESPECIES.find((x) => x.id === id) || null;
export const modeloPorId = (id) => MODELOS.find((x) => x.id === id) || null;

/* Los once ánimos del firmware (core/mood.h), en el mismo orden. */
export const ANIMOS = [
  'UNKNOWN', 'OFFLINE', 'SLEEPING', 'HAPPY', 'THIRSTY', 'DROWNING',
  'COLD', 'HOT', 'SCORCHED', 'DARK', 'PARCHED_AIR',
];

/* Lo que "dice" la planta en cada ánimo, en la voz de la app. */
export const FRASES = {
  UNKNOWN: 'todavía no sé cómo estoy',
  OFFLINE: 'no llegan datos',
  SLEEPING: 'durmiendo',
  HAPPY: 'estoy perfecta',
  THIRSTY: 'tengo sed',
  DROWNING: 'me estoy ahogando',
  COLD: 'tengo frío',
  HOT: 'tengo calor',
  SCORCHED: 'demasiado sol',
  DARK: 'necesito más luz',
  PARCHED_AIR: 'el aire está seco',
};

/**
 * Valida y acota una especie que no viene del catálogo (la estimó la IA o
 * la cargó alguien a mano). Devuelve null si no es coherente: una especie
 * a medias es peor que ninguna, porque la cara reaccionaría a umbrales
 * inventados. Es la misma regla que aplica el firmware en net/nube.c.
 */
export function validarEspecie(x) {
  if (!x || typeof x !== 'object') return null;
  const num = (v, lo, hi) => (Number.isFinite(Number(v))
    ? Math.min(hi, Math.max(lo, Math.round(Number(v)))) : null);
  const s = {
    id: String(x.id || '').toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 23) || null,
    nombre: String(x.nombre || '').trim().slice(0, 31) || null,
    cientifico: String(x.cientifico || '').trim().slice(0, 60),
    soil_min: num(x.soil_min, 0, 100),
    soil_max: num(x.soil_max, 0, 100),
    temp_min_dc: num(x.temp_min_dc, -400, 600),
    temp_max_dc: num(x.temp_max_dc, -400, 600),
    rh_min: num(x.rh_min, 0, 100),
    lux_min: num(x.lux_min, 0, 200000),
    lux_max: num(x.lux_max, 0, 200000),
    dificultad: num(x.dificultad ?? 50, 0, 100),
  };
  if (!s.id || !s.nombre) return null;
  if ([s.soil_min, s.soil_max, s.temp_min_dc, s.temp_max_dc, s.rh_min, s.lux_min, s.lux_max]
    .some((v) => v === null)) return null;
  if (s.soil_min >= s.soil_max || s.temp_min_dc >= s.temp_max_dc || s.lux_min >= s.lux_max) {
    return null;
  }
  return s;
}
