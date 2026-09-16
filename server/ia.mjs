/* ia.mjs — identificar la planta y diagnosticarla por foto.
 *
 * DOS PROVEEDORES, UNA INTERFAZ
 *
 *   claude     Si hay ANTHROPIC_API_KEY, la foto va a Claude con visión.
 *   simulada   Si no, una respuesta estable derivada de la foto. Sirve para
 *              desarrollar la interfaz y correr los tests sin gastar ni
 *              depender de la red, y la app avisa que es simulada.
 *
 * QUÉ SE LE PIDE AL MODELO, Y QUÉ NO SE LE CREE
 *
 * Se le pide un JSON cerrado: la especie, su nombre científico, la confianza
 * y, si la planta está en nuestro catálogo, su id. Si está, los umbrales
 * salen del catálogo curado y no del modelo: una tabla revisada a mano es
 * más confiable que una estimación, y la maceta va a juzgar a la planta con
 * esos números durante años. Si no está, se usan los rangos que propone el
 * modelo, pasados por la misma validación que aplica el firmware (acotados,
 * coherentes), y se guardan como especie propia de esa maceta.
 *
 * Para el diagnóstico se le pide sólo HALLAZGOS VISIBLES de una lista
 * cerrada. La causa no la decide el modelo: sale de cruzar esos hallazgos
 * con lo que miden los sensores, en public/lib/diagnostico.mjs. Así el mismo
 * síntoma con la tierra seca o encharcada da causas distintas, que es
 * exactamente lo que una foto sola no puede distinguir.
 */
import { createHash } from 'node:crypto';
import { ESPECIES, especiePorId, validarEspecie } from './catalogo.mjs';

export const HALLAZGOS = [
  'sana', 'hojas_amarillas', 'puntas_marrones', 'manchas', 'caida',
  'tallo_estirado', 'plagas', 'moho', 'hojas_quemadas', 'hojas_enrolladas',
];

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
  "alternativas": [ { "nombre": "...", "catalogo": "id o null", "confianza": 0.0 } ],
  "no_es_planta": false
}
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

export function crearIA({
  clave = process.env.ANTHROPIC_API_KEY,
  modelo = process.env.ROOTLAB_IA_MODELO || 'claude-opus-5',
  fetch: pedir = globalThis.fetch,
} = {}) {
  const real = Boolean(clave);

  async function claude(foto, texto) {
    const r = await pedir('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': clave,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      signal: AbortSignal.timeout(45000),
      body: JSON.stringify({
        model: modelo,
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: foto.mime || 'image/jpeg', data: foto.image_b64 } },
            { type: 'text', text: texto },
          ],
        }],
      }),
    });
    if (!r.ok) throw new Error(`el servicio de IA respondió ${r.status}`);
    const j = await r.json();
    const out = (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
    const obj = extraerJson(out);
    if (!obj) throw new Error('la IA no devolvió una respuesta legible');
    return obj;
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

  return {
    proveedor: real ? 'claude' : 'simulada',
    modelo: real ? modelo : null,

    async identificar(foto) {
      const error = validarFoto(foto);
      if (error) throw Object.assign(new Error(error), { codigo: 400 });
      if (!real) return identificarSimulado(foto);

      const r = await claude(foto, PROMPT_IDENTIFICAR());
      if (r.no_es_planta) {
        throw Object.assign(new Error('No encontré una planta en la foto. Probá con otra más de cerca.'),
          { codigo: 422 });
      }
      const e = especieDesdeModelo(r);
      if (!e) throw Object.assign(new Error('No pude identificarla. Elegila de la lista.'), { codigo: 422 });
      return {
        ...e,
        confianza: Math.min(1, Math.max(0, Number(r.confianza) || 0)),
        alternativas: (Array.isArray(r.alternativas) ? r.alternativas : []).slice(0, 3).map((a) => {
          const c = especiePorId(a.catalogo);
          return { id: c?.id || null, nombre: c?.nombre || String(a.nombre || ''), confianza: Number(a.confianza) || 0 };
        }).filter((a) => a.nombre),
        fuente: 'claude',
      };
    },

    async diagnosticar(foto, { tel = null, especie = null } = {}) {
      const error = validarFoto(foto);
      if (error) throw Object.assign(new Error(error), { codigo: 400 });
      if (!real) return diagnosticarSimulado(foto, tel, especie);
      const r = await claude(foto, PROMPT_DIAGNOSTICAR(especie));
      const hallazgos = (Array.isArray(r.hallazgos) ? r.hallazgos : []).filter((x) => HALLAZGOS.includes(x));
      return {
        hallazgos: hallazgos.length ? hallazgos : ['sana'],
        confianza: Math.min(1, Math.max(0, Number(r.confianza) || 0)),
        observacion: String(r.observacion || '').slice(0, 200),
        fuente: 'claude',
      };
    },
  };
}
