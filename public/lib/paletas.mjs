/* paletas.mjs — las paletas de ROOTLAB y cómo se vuelven un tema.
 *
 * LA IDEA
 *
 * La app se pinta con la paleta de tu Rooti. Cuando abrís un cofre y te toca
 * un Rooti que tiene paleta propia, la app entera cambia a sus colores. La
 * paleta por defecto es Vibrant Tones, y en Ajustes se puede elegir entre
 * ella y las de los Rooties que ya tenés.
 *
 * ARTE COMO DATOS
 *
 * Cada paleta son sus colores (con nombre y descripción, como los entrega
 * la artista) y unos ROLES: qué color es la base de las superficies, cuál es
 * el botón principal, cuál el destacado, cuáles los estados. Agregar la
 * paleta de un Rooti nuevo es agregar un objeto a PALETAS; no hay que tocar
 * CSS ni vistas.
 *
 * EL MOTOR GARANTIZA QUE SE LEA
 *
 * Los roles dicen la intención; `temaDesdePaleta()` la convierte en tokens de
 * CSS y se asegura de que todo texto cumpla WCAG AA contra su fondo (4,5:1;
 * 7:1 para el texto principal). Si un color de la paleta no llega —un azul
 * profundo como texto sobre azul noche— se aclara lo justo, en el espacio
 * OKLab para que no cambie de tono. Así la artista elige colores con libertad
 * y la app nunca queda ilegible. test/paletas.test.mjs lo verifica en todas.
 *
 * PALETAS COSMÉTICAS
 *
 * Además de las de los Rooties hay tres que se ganan cuidando: OLED Midnight
 * (negro absoluto y verde fósforo; libre), Cristal (vidrio esmerilado; el
 * Rooti secreto o 60 días sanos) y Solar Gold (oro y ámbar; 180 días sanos).
 * Cada una trae un `estilo` que el CSS usa para lo que los tokens no pueden
 * decir (paneles translúcidos, fondo sin degradé) y un `requisito`. El motor
 * de contraste las trata como a las demás.
 *
 * La mezcla y el contraste son funciones puras: este archivo lo usan la app,
 * el servidor (colores de los emails) y los tests.
 */

export const PALETA_POR_DEFECTO = 'vibrant';

export const PALETAS = [
  {
    id: 'vibrant',
    nombre: 'Vibrant Tones',
    rooti: null,
    descripcion: 'La de ROOTLAB: jugosa, cálida y con verdes de huerta.',
    colores: [
      { nombre: 'Strawberry Red', hex: '#f94144', nota: 'Jugoso y vibrante, como frutillas recién cortadas.' },
      { nombre: 'Pumpkin Spice', hex: '#f3722c', nota: 'Audaz y especiado, cálido de otoño.' },
      { nombre: 'Carrot Orange', hex: '#f8961e', nota: 'Naranja dorado de cosecha fresca.' },
      { nombre: 'Atomic Tangerine', hex: '#f9844a', nota: 'Mandarina juguetona, pura energía.' },
      { nombre: 'Tuscan Sun', hex: '#f9c74f', nota: 'Sol de tarde mediterránea, dorado y optimista.' },
      { nombre: 'Willow Green', hex: '#90be6d', nota: 'Verde hierba tibio, prados en flor.' },
      { nombre: 'Seaweed', hex: '#43aa8b', nota: 'Verde agua con fondo terroso, calma.' },
      { nombre: 'Dark Cyan', hex: '#4d908e', nota: 'Corrientes profundas, sobrio y moderno.' },
      { nombre: 'Blue Slate', hex: '#577590', nota: 'Azul pizarra, autoridad serena.' },
      { nombre: 'Cerulean', hex: '#277da1', nota: 'Azul vivo entre el mar y el verde.' },
    ],
    roles: {
      base: '#577590',
      primario: '#90be6d',
      secundario: '#277da1',
      destacado: '#f9c74f',
      acento: '#f9844a',
      bien: '#43aa8b',
      atencion: '#f8961e',
      urgente: '#f94144',
      datos: { tierra: '#277da1', temperatura: '#f3722c', luz: '#f9c74f', humedad: '#4d908e' },
    },
  },
  {
    id: 'chico-malo',
    nombre: 'Chico Malo',
    rooti: 'chico-malo',
    descripcion: 'Tinta, bordó y brasas. Nocturna y con drama.',
    colores: [
      { nombre: 'Ink Black', hex: '#03071e', nota: 'Tinta profunda con un dejo azul.' },
      { nombre: 'Night Bordeaux', hex: '#370617', nota: 'Bordó casi negro, poder silencioso.' },
      { nombre: 'Black Cherry', hex: '#6a040f', nota: 'Rojo negro intenso y elegante.' },
      { nombre: 'Oxblood', hex: '#9d0208', nota: 'Carmesí de vino viejo y terciopelo.' },
      { nombre: 'Brick Ember', hex: '#d00000', nota: 'Brasa roja, fuerza y emoción.' },
      { nombre: 'Red Ochre', hex: '#dc2f02', nota: 'Ocre rojizo de arcilla al sol.' },
      { nombre: 'Autumn Leaf', hex: '#e85d04', nota: 'Hoja de otoño, tostada y terrosa.' },
      { nombre: 'Dark Orange', hex: '#f48c06', nota: 'Atardecer feroz.' },
      { nombre: 'Orange', hex: '#faa307', nota: 'Naranja puro, calor y movimiento.' },
      { nombre: 'Amber Flame', hex: '#ffba08', nota: 'Llamarada ámbar, intensidad.' },
    ],
    roles: {
      fondo: '#03071e',
      base: '#9d0208',
      primario: '#ffba08',
      secundario: '#faa307',
      destacado: '#ffba08',
      acento: '#e85d04',
      bien: '#8fd14f',
      atencion: '#f48c06',
      urgente: '#d00000',
      datos: { tierra: '#faa307', temperatura: '#dc2f02', luz: '#ffba08', humedad: '#e85d04' },
    },
  },
  {
    id: 'chica-chill',
    nombre: 'Chica Chill',
    rooti: 'chica-chill',
    descripcion: 'Azules de medianoche y acero. Inteligente y en calma.',
    colores: [
      { nombre: 'Smart Blue', hex: '#0466c8', nota: 'Azul que irradia inteligencia y calma.' },
      { nombre: 'Steel Azure', hex: '#0353a4', nota: 'Azul acero, resistencia y equilibrio.' },
      { nombre: 'Regal Navy', hex: '#023e7d', nota: 'Azul marino de mares a medianoche.' },
      { nombre: 'Prussian Blue', hex: '#002855', nota: 'Azul tinta, gravedad académica.' },
      { nombre: 'Prussian Blue', hex: '#001845', nota: 'Azul tinta, más profundo.' },
      { nombre: 'Prussian Blue', hex: '#001233', nota: 'Azul tinta, el más profundo.' },
      { nombre: 'Twilight Indigo', hex: '#33415c', nota: 'El abrazo sereno del atardecer.' },
      { nombre: 'Blue Slate', hex: '#5c677d', nota: 'Pizarra azulada, calma profunda.' },
      { nombre: 'Slate Grey', hex: '#7d8597', nota: 'Gris frío, equilibrio y claridad.' },
      { nombre: 'Cool Steel', hex: '#979dac', nota: 'Acero con bruma, claridad creativa.' },
    ],
    roles: {
      fondo: '#001233',
      base: '#0353a4',
      primario: '#0466c8',
      secundario: '#0466c8',
      destacado: '#979dac',
      acento: '#5c677d',
      tinta2: '#979dac',
      tinta3: '#7d8597',
      bien: '#4cc38a',
      atencion: '#ffb454',
      urgente: '#ff6b6b',
      datos: { tierra: '#0466c8', temperatura: '#ffb454', luz: '#979dac', humedad: '#5c677d' },
    },
  },
  {
    id: 'oled',
    nombre: 'OLED Midnight',
    rooti: null,
    estilo: 'oled',
    descripcion: 'Negro absoluto y verde fósforo: la pantalla apagada, los ojos encendidos.',
    colores: [
      { nombre: 'Absolute Black', hex: '#000000', nota: 'El pixel apagado de un OLED.' },
      { nombre: 'Graphite', hex: '#111827', nota: 'Apenas gris, para separar sin encender.' },
      { nombre: 'Deep Emerald', hex: '#065f46', nota: 'Verde profundo de bosque de noche.' },
      { nombre: 'Emerald', hex: '#10b981', nota: 'Esmeralda viva.' },
      { nombre: 'Phosphor', hex: '#39ff88', nota: 'Verde fósforo de terminal.' },
      { nombre: 'Mint Glow', hex: '#a7f3d0', nota: 'Menta encendida, para lo destacado.' },
      { nombre: 'Amber Warning', hex: '#fbbf24', nota: 'Ámbar de aviso.' },
      { nombre: 'Coral Alert', hex: '#f87171', nota: 'Coral de alarma.' },
    ],
    roles: {
      fondo: '#000000',
      base: '#0f2a1f',
      primario: '#10b981',
      secundario: '#39ff88',
      destacado: '#a7f3d0',
      acento: '#34d399',
      bien: '#39ff88',
      atencion: '#fbbf24',
      urgente: '#f87171',
      datos: { tierra: '#39ff88', temperatura: '#fbbf24', luz: '#a7f3d0', humedad: '#10b981' },
    },
  },
  {
    id: 'cristal',
    nombre: 'Cristal',
    rooti: null,
    estilo: 'cristal',
    requisito: { secreto: true, dias_sanos: 60 },
    desbloqueo: 'el Rooti secreto, o 60 días sanos de una planta',
    descripcion: 'Vidrio esmerilado sobre azul hielo: paneles translúcidos con luz detrás.',
    colores: [
      { nombre: 'Deep Ice', hex: '#0b1220', nota: 'Azul hielo profundo, el fondo.' },
      { nombre: 'Frost Slate', hex: '#3b4b6b', nota: 'Pizarra helada que tiñe el vidrio.' },
      { nombre: 'Sky Glass', hex: '#7dd3fc', nota: 'Celeste de vidrio al sol.' },
      { nombre: 'Periwinkle', hex: '#a5b4fc', nota: 'Lavanda azulada.' },
      { nombre: 'Lilac Mist', hex: '#c4b5fd', nota: 'Lila de bruma.' },
      { nombre: 'Snow', hex: '#f0f9ff', nota: 'Blanco de nieve.' },
      { nombre: 'Mint Ice', hex: '#6ee7b7', nota: 'Menta helada, el bien.' },
      { nombre: 'Warm Amber', hex: '#fcd34d', nota: 'Ámbar de atención.' },
      { nombre: 'Rose Alert', hex: '#fb7185', nota: 'Rosa de alarma.' },
    ],
    roles: {
      fondo: '#0b1220',
      base: '#3b4b6b',
      primario: '#7dd3fc',
      secundario: '#a5b4fc',
      destacado: '#f0f9ff',
      acento: '#c4b5fd',
      bien: '#6ee7b7',
      atencion: '#fcd34d',
      urgente: '#fb7185',
      datos: { tierra: '#7dd3fc', temperatura: '#fcd34d', luz: '#f0f9ff', humedad: '#a5b4fc' },
    },
  },
  {
    id: 'solar',
    nombre: 'Solar Gold',
    rooti: null,
    estilo: 'solar',
    requisito: { dias_sanos: 180 },
    desbloqueo: '180 días sanos de una planta',
    descripcion: 'Oro y ámbar sobre marrón tostado: medio año de sol.',
    colores: [
      { nombre: 'Roasted Umber', hex: '#1a1206', nota: 'Marrón tostado, el fondo.' },
      { nombre: 'Bronze', hex: '#7a5a1a', nota: 'Bronce que tiñe los paneles.' },
      { nombre: 'Solar Gold', hex: '#f5b301', nota: 'Oro de mediodía.' },
      { nombre: 'Amber', hex: '#f59e0b', nota: 'Ámbar de tarde.' },
      { nombre: 'Pale Gold', hex: '#fde68a', nota: 'Oro pálido, para lo destacado.' },
      { nombre: 'Tangerine', hex: '#fb923c', nota: 'Mandarina, el acento.' },
      { nombre: 'Lime Leaf', hex: '#a3e635', nota: 'Lima, el bien.' },
      { nombre: 'Alert Red', hex: '#ef4444', nota: 'Rojo de alarma.' },
    ],
    roles: {
      fondo: '#1a1206',
      base: '#7a5a1a',
      primario: '#f5b301',
      secundario: '#f59e0b',
      destacado: '#fde68a',
      acento: '#fb923c',
      bien: '#a3e635',
      atencion: '#fb923c',
      urgente: '#ef4444',
      datos: { tierra: '#f59e0b', temperatura: '#ef4444', luz: '#fde68a', humedad: '#a3e635' },
    },
  },
];

export const paletaPorId = (id) => PALETAS.find((p) => p.id === id) || null;
export const paletaDeRooti = (rooti) => PALETAS.find((p) => p.rooti && p.rooti === rooti) || null;

/**
 * Si un requisito cosmético está cumplido: `secreto` (tener al Rooti
 * secreto) o `dias_sanos` (una planta que llegó a esos días). Con los dos,
 * alcanza uno.
 */
export function cumpleRequisito(requisito, { secretos = 0, diasSanos = 0 } = {}) {
  if (!requisito) return true;
  if (requisito.secreto && secretos > 0) return true;
  if (Number.isFinite(requisito.dias_sanos) && diasSanos >= requisito.dias_sanos) return true;
  return false;
}

/**
 * Las paletas que puede elegir quien tiene esta colección de Rooties,
 * `secretos` Rooties secretos y una planta con `diasSanos` días sanos.
 * Cada una trae `bloqueada` y, si lo está, `porque`.
 */
export function paletasDisponibles(coleccion = [], { secretos = 0, diasSanos = 0 } = {}) {
  return PALETAS.map((p) => {
    const porRooti = Boolean(p.rooti && !coleccion.includes(p.rooti));
    const porRequisito = Boolean(p.requisito && !cumpleRequisito(p.requisito, { secretos, diasSanos }));
    return {
      ...p,
      bloqueada: porRooti || porRequisito,
      porque: porRooti ? 'Conseguí su Rooti' : porRequisito ? `Se gana con ${p.desbloqueo}` : null,
    };
  });
}

/* ------------------------------------------------------------- color --- */
const hexARgb = (hex) => {
  const h = String(hex).replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgbAHex = (rgb) => `#${rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;

const aLineal = (c) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const deLineal = (l) => 255 * (l <= 0.0031308 ? 12.92 * l : 1.055 * (Math.max(0, l) ** (1 / 2.4)) - 0.055);

/** Luminancia relativa de WCAG 2.x. */
export function luminancia(hex) {
  const [r, g, b] = hexARgb(hex).map(aLineal);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contraste de WCAG entre dos colores: de 1 a 21. */
export function contraste(a, b) {
  const [x, y] = [luminancia(a), luminancia(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

/* OKLab (Björn Ottosson, 2020): mezclar ahí no ensucia los colores ni los
   lleva al gris como mezclar en sRGB. */
function aOklab(hex) {
  const [r, g, b] = hexARgb(hex).map(aLineal);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
function deOklab([L, A, B]) {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return rgbAHex([
    deLineal(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    deLineal(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    deLineal(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ]);
}

/** Mezcla `a` hacia `b` en proporción t (0 = a, 1 = b). */
export function mezclar(a, b, t) {
  const x = aOklab(a);
  const y = aOklab(b);
  return deOklab(x.map((v, i) => v + (y[i] - v) * t));
}

/** Aclara (o oscurece) `color` lo mínimo para llegar a `min` contra todos los fondos. */
export function asegurarContraste(color, fondos, min, hacia = '#ffffff') {
  let c = color;
  for (let i = 0; i <= 25; i++) {
    if (fondos.every((f) => contraste(c, f) >= min)) return c;
    c = mezclar(color, hacia, i / 25);
  }
  return hacia;
}

const OSCURO = '#0b0f14';

/** El color de texto que va sobre un color lleno (botones, chips). */
function sobre(color) {
  return contraste('#ffffff', color) >= contraste(OSCURO, color) ? '#ffffff' : OSCURO;
}

/** Un color lleno que admite texto encima con 4,5:1, ajustando lo justo. */
function lleno(color) {
  const texto = sobre(color);
  if (contraste(texto, color) >= 4.5) return { color, texto };
  const hacia = texto === '#ffffff' ? '#000000' : '#ffffff';
  const ajustado = asegurarContraste(color, [texto], 4.5, hacia);
  return { color: ajustado, texto };
}

/* ----------------------------------------------------------------- tema --- */
/**
 * Paleta -> tokens de CSS (sin el "--"). Tema oscuro: la app se mira de
 * noche, al lado de la planta, y los colores de los Rooties brillan sobre
 * fondo profundo.
 */
export function temaDesdePaleta(paleta) {
  const r = (paleta || paletaPorId(PALETA_POR_DEFECTO)).roles;
  const fondo = r.fondo || mezclar('#05070a', r.base, 0.12);
  const sup = (t) => mezclar(fondo, r.base, t);

  const t = {
    fondo,
    'fondo-alto': sup(0.12),
    panel: sup(0.24),
    'panel-alto': sup(0.34),
    borde: sup(0.48),
    'borde-alto': sup(0.64),
  };
  const superficies = [t.fondo, t['fondo-alto'], t.panel, t['panel-alto']];

  t.tinta = asegurarContraste(mezclar('#ffffff', r.base, 0.04), superficies, 7);
  t['tinta-2'] = asegurarContraste(r.tinta2 || mezclar('#ffffff', r.base, 0.38), superficies, 4.5);
  t['tinta-3'] = asegurarContraste(r.tinta3 || mezclar('#ffffff', r.base, 0.58), superficies, 4.5);

  for (const [nombre, valor] of [['primario', r.primario], ['secundario', r.secundario], ['destacado', r.destacado],
    ['acento', r.acento], ['bien', r.bien], ['atencion', r.atencion], ['urgente', r.urgente]]) {
    const l = lleno(valor);
    t[nombre] = l.color;
    t[`sobre-${nombre}`] = l.texto;
    t[`${nombre}-canto`] = mezclar(l.color, '#000000', 0.28);
    /* La versión para usar como TEXTO sobre las superficies. */
    t[`${nombre}-texto`] = asegurarContraste(valor, superficies, 4.5);
  }

  const datos = r.datos || {};
  t['dato-tierra'] = asegurarContraste(datos.tierra || r.secundario, [t.panel], 3);
  t['dato-temperatura'] = asegurarContraste(datos.temperatura || r.atencion, [t.panel], 3);
  t['dato-luz'] = asegurarContraste(datos.luz || r.destacado, [t.panel], 3);
  t['dato-humedad'] = asegurarContraste(datos.humedad || r.acento, [t.panel], 3);

  t.resplandor = mezclar(fondo, r.base, 0.42);
  t['fondo-rgb'] = hexARgb(fondo).join(', ');
  return t;
}

/** Tokens -> declaraciones de CSS para style.setProperty o un <style>. */
export function declaraciones(tema) {
  return Object.entries(tema).map(([k, v]) => [`--${k}`, v]);
}
