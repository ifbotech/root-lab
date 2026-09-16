/* ia.mjs — reconocer la planta, diagnosticarla y dejarla hablar.
 *
 * DOS PROVEEDORES, UNA INTERFAZ
 *
 *   claude     Si hay ANTHROPIC_API_KEY, se llama a la API de Anthropic.
 *   simulada   Si no, respuestas estables derivadas de la entrada. Sirven
 *              para desarrollar la interfaz y correr los tests sin gastar ni
 *              depender de la red, y la app avisa que son simuladas.
 *
 * Cada llamada real devuelve `uso` (tokens de entrada, salida y caché) para
 * que presupuesto.mjs la cobre contra el tope y la cuota.
 *
 * QUÉ SE LE PIDE AL MODELO, Y QUÉ NO SE LE CREE
 *
 * Reconocer: un JSON cerrado con la especie, su nombre científico, la
 * confianza, su id si está en nuestro catálogo, y los CUIDADOS de la especie
 * (con eso nace la ficha y el chat, ver ficha.mjs). Si la planta está en el
 * catálogo, los umbrales salen del catálogo curado y no del modelo: la
 * maceta va a juzgar a la planta con esos números durante años. Si no está,
 * se usan los rangos que propone el modelo, pasados por la misma validación
 * que aplica el firmware.
 *
 * Diagnosticar: sólo HALLAZGOS VISIBLES de una lista cerrada. La causa sale
 * de cruzarlos con los sensores (public/lib/diagnostico.mjs).
 *
 * Conversar: el prompt de sistema de la planta (ficha.mjs) + las mediciones
 * de este momento + los últimos mensajes. Respuesta corta, con tope de
 * tokens: una charla nunca puede costar más que lo que previó el tope.
 */
import { createHash } from 'node:crypto';
import { ESPECIES, especiePorId, validarEspecie } from './catalogo.mjs';
import { CAMPOS_CUIDADO } from './ficha.mjs';

export const HALLAZGOS = [
  'sana', 'hojas_amarillas', 'puntas_marrones', 'manchas', 'caida',
  'tallo_estirado', 'plagas', 'moho', 'hojas_quemadas', 'hojas_enrolladas',
];

export const MAX_TOKENS = { identificar: 1500, diagnosticar: 400, chat: 350 };

const TIPOS = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_B64 = 7_000_000;

export function validarFoto({ image_b64: b64, mime = 'image/jpeg' } = {}) {
  if (typeof b64 !== 'string' || b64.length < 100) return 'falta la foto';
  if (b64.length > MAX_B64) return 'la foto es demasiado grande';
  if (!TIPOS.includes(mime)) return 'formato de imagen no soportado';
  return null;
}

/* Saca el primer objeto JSON de un texto, tolerando que venga envuelto. */
export function extraerJson(texto) {
  if (typeof texto !== 'string') return null;
  const i = texto.indexOf('{');
  const j = texto.lastIndexOf('}');
  if (i < 0 || j <= i) return null;
  try { return JSON.parse(texto.slice(i, j + 1)); } catch { return null; }
}

const PROMPT_IDENTIFICAR = () => `Sos botánico. Identificá la planta de la foto.
Respondé SOLO un objeto JSON, sin texto alrededor, con esta forma:
{
  "nombre": "nombre común en español rioplatense",
  "cientifico": "nombre científico",
  "confianza": 0.0 a 1.0,
  "catalogo": "id de la lista si coincide, o null",
  "rangos": {
    "suelo_min": % humedad de suelo mínima, "suelo_max": % máxima,
    "temp_min_c": °C mínima cómoda, "temp_max_c": °C máxima cómoda,
    "hr_min": % humedad relativa mínima,
    "lux_min": lux diurnos mínimos, "lux_max": lux máximos antes de quemarse,
    "dificultad": 0 (imposible de matar) a 100 (muy exigente)
  },
  "cuidados": {
${CAMPOS_CUIDADO.map((c) => `    "${c}": "una o dos frases concretas en español rioplatense, en primera persona como si hablara la planta"`).join(',\n')}
  },
  "alternativas": [ { "nombre": "...", "catalogo": "id o null", "confianza": 0.0 } ],
  "no_es_planta": false
}
En "toxicidad" decí si es tóxica para perros, gatos o personas según lo que se sabe de la especie.
Ids del catálogo: ${ESPECIES.map((e) => `${e.id} (${e.nombre}, ${e.cientifico})`).join('; ')}.
Si la foto no muestra una planta, poné "no_es_planta": true.`;

const PROMPT_DIAGNOSTICAR = (especie) => `Sos fitopatólogo. Mirá la foto de esta planta${especie ? ` (${especie.nombre}, ${especie.cientifico || ''})` : ''}.
Listá SOLO lo que se VE, eligiendo de esta lista cerrada: ${HALLAZGOS.join(', ')}.
Respondé SOLO un objeto JSON: {"hallazgos": ["..."], "confianza": 0.0 a 1.0, "observacion": "una frase corta en español rioplatense"}.
Si no ves problemas, devolvé ["sana"].`;

/* Pasa la respuesta del modelo a una especie validada. */
export function especieDesdeModelo(r) {
  if (!r || r.no_es_planta) return null;
  const delCatalogo = especiePorId(r.catalogo);
  if (delCatalogo) return { especie: delCatalogo, catalogo: true };
  const g = r.rangos || {};
  const nombre = String(r.nombre || '').trim();
  const propia = validarEspecie({
    id: `propia-${createHash('sha1').update(`${r.cientifico}|${nombre}`).digest('hex').slice(0, 8)}`,
    nombre,
    cientifico: r.cientifico,
    soil_min: g.suelo_min, soil_max: g.suelo_max,
    temp_min_dc: Number(g.temp_min_c) * 10, temp_max_dc: Number(g.temp_max_c) * 10,
    rh_min: g.hr_min, lux_min: g.lux_min, lux_max: g.lux_max,
    dificultad: g.dificultad,
  });
  return propia ? { especie: propia, catalogo: false } : null;
}

/**
 * ¿La clave de Anthropic sirve? Lista los modelos (no cuesta nada). Devuelve
 * 'ok', 'invalida' (401/403: revocada o mal copiada) o 'sin-red' (no se pudo
 * saber: no se desactiva nada por un corte momentáneo).
 */
export async function probarClaveAnthropic(clave, { fetch: pedir = globalThis.fetch, plazoMs = 8000 } = {}) {
  if (!clave) return 'invalida';
  try {
    const r = await pedir('https://api.anthropic.com/v1/models?limit=1', {
      headers: { 'x-api-key': clave, 'anthropic-version': '2023-06-01' },
      signal: AbortSignal.timeout(plazoMs),
    });
    if (r.status === 401 || r.status === 403) return 'invalida';
    return 'ok';
  } catch {
    return 'sin-red';
  }
}

const usoDe = (u = {}) => ({
  entrada: u.input_tokens || 0,
  salida: u.output_tokens || 0,
  cache_escritura: u.cache_creation_input_tokens || 0,
  cache_lectura: u.cache_read_input_tokens || 0,
});

export function crearIA({
  motivoSimulada = '',
  clave = process.env.ANTHROPIC_API_KEY,
  modelo = process.env.ROOTLAB_IA_MODELO || 'claude-opus-5',
  modeloChat = process.env.ROOTLAB_IA_MODELO_CHAT || 'claude-sonnet-5',
  fetch: pedir = globalThis.fetch,
} = {}) {
  const real = Boolean(clave);

  async function llamar({ modelo: m, system, messages, maxTokens }) {
    const r = await pedir('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': clave,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      signal: AbortSignal.timeout(45000),
      body: JSON.stringify({
        model: m,
        max_tokens: maxTokens,
        ...(system ? { system } : {}),
        messages,
      }),
    });
    if (!r.ok) {
      /* El detalle técnico va al log; a la persona, algo que entienda. */
      console.error(`IA: Anthropic respondió ${r.status} (${m})`);
      const e = new Error(r.status === 429 || r.status === 529
        ? 'La IA está saturada. Probá en un rato.'
        : 'La IA no está disponible ahora. Probá en un rato.');
      e.codigo = 502;
      throw e;
    }
    const j = await r.json();
    return {
      texto: (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n').trim(),
      uso: usoDe(j.usage),
      modelo: j.model || m,
    };
  }

  async function conFoto(foto, texto, tipo) {
    const r = await llamar({
      modelo, maxTokens: MAX_TOKENS[tipo],
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: foto.mime || 'image/jpeg', data: foto.image_b64 } },
          { type: 'text', text: texto },
        ],
      }],
    });
    const obj = extraerJson(r.texto);
    if (!obj) throw Object.assign(new Error('la IA no devolvió una respuesta legible'), { codigo: 502, uso: r.uso, modelo: r.modelo });
    return { obj, uso: r.uso, modelo: r.modelo };
  }

  /* ------------------------------------------------------ simulada ----- */
  const huella = (b64) => createHash('sha256').update(b64).digest().readUInt32BE(0);

  function identificarSimulado(foto) {
    const h = huella(foto.image_b64);
    const especie = ESPECIES[h % ESPECIES.length];
    const dudosa = h % 7 === 0;
    return {
      especie, catalogo: true,
      confianza: dudosa ? 0.41 : 0.93,
      alternativas: [1, 2].map((k) => ESPECIES[(h + k * 7) % ESPECIES.length])
        .filter((x) => x.id !== especie.id)
        .map((x) => ({ id: x.id, nombre: x.nombre, confianza: dudosa ? 0.3 : 0.03 })),
      cuidados: {
        sustrato: 'Me gusta un sustrato suelto que drene bien, con algo de perlita.',
        abono: 'Un fertilizante líquido suave una vez por mes en primavera y verano.',
        plagas: 'Revisame las hojas de vez en cuando por cochinillas y arañuela.',
        toxicidad: 'No sé con certeza si soy tóxica: mantenete del lado seguro y alejame de mascotas curiosas.',
      },
      fuente: 'simulada',
    };
  }

  function diagnosticarSimulado(foto, tel, especie) {
    const hallazgos = [];
    if (especie && tel) {
      if (tel.suelo > especie.soil_max) hallazgos.push('hojas_amarillas');
      else if (tel.suelo < especie.soil_min) hallazgos.push('caida');
      if (tel.hr < especie.rh_min) hallazgos.push('puntas_marrones');
      if (tel.lux < especie.lux_min) hallazgos.push('tallo_estirado');
    }
    /* Una de cada tres fotos ve algo que los sensores no pueden ver: es el
       caso interesante, y tiene que aparecer también en desarrollo. */
    if (huella(foto.image_b64) % 3 === 0) hallazgos.push('manchas');
    if (hallazgos.length === 0) hallazgos.push('sana');
    return { hallazgos, confianza: 0.86, observacion: '', fuente: 'simulada' };
  }

  /* Sin IA la planta igual contesta, con sus datos: sirve para diseñar la
     charla y para los tests, y no finge saber lo que no sabe. */
  function conversarSimulado({ nombre, contexto, mensaje }) {
    const m = String(mensaje).toLowerCase();
    const dato = (re) => (contexto.match(re) || [])[0]?.replace(/^- /, '');
    const fuera = /(program|código|codigo|noticia|polític|politic|tarea|receta|chiste|bitcoin|fútbol|futbol)/.test(m);
    let texto;
    if (fuera) {
      texto = `Soy ${nombre} y de eso no sé nada: sólo sé ser planta. Si querés, te cuento cómo cuidarme.`;
    } else if (/(agua|regar|riego|sed)/.test(m)) {
      const tierra = dato(/- Humedad de la tierra:[^\n]*/);
      texto = tierra
        ? `${tierra}. ${/tierra:[^\n]*por debajo/.test(contexto) ? '¡Un vasito me vendría bárbaro!' : 'Por ahora estoy bien de agua.'}`
        : 'Ahora no tengo el dato de la tierra.';
    } else if (/(luz|sol|ventana)/.test(m)) {
      texto = dato(/- Luz ahora:[^\n]*/) || 'Ahora no tengo el dato de la luz.';
    } else {
      const animo = dato(/- Cómo te sentís según tu Rooti:[^\n]*/);
      texto = `Hola, soy ${nombre}. ${animo ? animo.replace('Cómo te sentís según tu Rooti: ', 'Hoy: ') : 'Todavía no sé bien cómo estoy.'}`;
    }
    return { texto: `${texto} (respuesta simulada)`, fuente: 'simulada', uso: {}, modelo: null };
  }

  return {
    motivo: real ? '' : (motivoSimulada || 'sin ANTHROPIC_API_KEY'),
    proveedor: real ? 'claude' : 'simulada',
    modelo: real ? modelo : null,
    modeloChat: real ? modeloChat : null,

    async identificar(foto) {
      const error = validarFoto(foto);
      if (error) throw Object.assign(new Error(error), { codigo: 400 });
      if (!real) return identificarSimulado(foto);

      const { obj: r, uso, modelo: m } = await conFoto(foto, PROMPT_IDENTIFICAR(), 'identificar');
      if (r.no_es_planta) {
        throw Object.assign(new Error('No encontré una planta en la foto. Probá con otra más de cerca.'),
          { codigo: 422, uso, modelo: m });
      }
      const e = especieDesdeModelo(r);
      if (!e) throw Object.assign(new Error('No pude identificarla. Elegila de la lista.'), { codigo: 422, uso, modelo: m });
      return {
        ...e,
        confianza: Math.min(1, Math.max(0, Number(r.confianza) || 0)),
        alternativas: (Array.isArray(r.alternativas) ? r.alternativas : []).slice(0, 3).map((a) => {
          const c = especiePorId(a.catalogo);
          return { id: c?.id || null, nombre: c?.nombre || String(a.nombre || ''), confianza: Number(a.confianza) || 0 };
        }).filter((a) => a.nombre),
        cuidados: r.cuidados && typeof r.cuidados === 'object' ? r.cuidados : null,
        fuente: 'claude',
        uso,
        modelo: m,
      };
    },

    async diagnosticar(foto, { tel = null, especie = null } = {}) {
      const error = validarFoto(foto);
      if (error) throw Object.assign(new Error(error), { codigo: 400 });
      if (!real) return diagnosticarSimulado(foto, tel, especie);
      const { obj: r, uso, modelo: m } = await conFoto(foto, PROMPT_DIAGNOSTICAR(especie), 'diagnosticar');
      const hallazgos = (Array.isArray(r.hallazgos) ? r.hallazgos : []).filter((x) => HALLAZGOS.includes(x));
      return {
        hallazgos: hallazgos.length ? hallazgos : ['sana'],
        confianza: Math.min(1, Math.max(0, Number(r.confianza) || 0)),
        observacion: String(r.observacion || '').slice(0, 200),
        fuente: 'claude',
        uso,
        modelo: m,
      };
    },

    /**
     * Un mensaje a la planta. `historial`: [{ rol: 'persona'|'planta', texto }],
     * del más viejo al más nuevo, sin el mensaje nuevo.
     */
    async conversar({ nombre, prompt, contexto, historial = [], mensaje }) {
      if (!real) return conversarSimulado({ nombre, contexto, mensaje });
      /* La API pide alternar usuario y asistente empezando por el usuario. */
      const turnos = [];
      for (const h of historial) {
        const role = h.rol === 'planta' ? 'assistant' : 'user';
        if (!turnos.length && role === 'assistant') continue;
        if (turnos.length && turnos[turnos.length - 1].role === role) {
          turnos[turnos.length - 1].content += `\n${h.texto}`;
        } else {
          turnos.push({ role, content: h.texto });
        }
      }
      if (turnos.length && turnos[turnos.length - 1].role === 'user') turnos.pop();
      turnos.push({ role: 'user', content: mensaje });
      const r = await llamar({
        modelo: modeloChat,
        maxTokens: MAX_TOKENS.chat,
        system: [
          /* El prompt fijo va con caché: en una charla larga, desde el
             segundo mensaje se cobra a una décima parte. */
          { type: 'text', text: prompt, cache_control: { type: 'ephemeral' } },
          { type: 'text', text: contexto },
        ],
        messages: turnos,
      });
      if (!r.texto) throw Object.assign(new Error('La planta no encontró qué decir. Probá de nuevo.'), { codigo: 502, uso: r.uso, modelo: r.modelo });
      return { texto: r.texto.slice(0, 1200), fuente: 'claude', uso: r.uso, modelo: r.modelo };
    },
  };
}
