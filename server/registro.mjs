/* registro.mjs — qué queda escrito de lo que pasó, sin escribir de más.
 *
 * QUÉ PROBLEMA RESUELVE
 *
 * Hasta acá el servidor sólo contaba de sí mismo al arrancar. Cuando alguien
 * dice "no me cargó la app" o una maceta deja de aparecer, en el journal del
 * VPS no había nada que mirar.
 *
 * QUÉ SE ANOTA Y QUÉ NO
 *
 * Una línea por pedido sería ruido: cada aparato habla cada quince minutos y
 * la app relee el tablero cada quince segundos. Se anota sólo lo que alguien
 * querría leer:
 *
 *   - los errores del servidor (5xx), siempre; menos el `503` con el que las
 *     rutas de IA contestan cuando la IA está apagada, que es la respuesta
 *     correcta y no una falla;
 *   - los `429`, que dicen que alguien está golpeando una puerta;
 *   - lo que tardó más de lo que debería (con más paciencia para lo que
 *     llama a la IA, que tarda segundos por diseño);
 *   - y cada diez minutos, un renglón con el resumen: cuántos pedidos, cómo
 *     salieron, cuánto tardaron y cuál fue el más lento.
 *
 * QUÉ NO ENTRA, NUNCA
 *
 * Ni IPs, ni emails, ni ids de cuentas, plantas o aparatos. La ruta se anota
 * por su forma (`/api/plantas/:id/historial`), no como vino: así el journal
 * sirve para operar y no es una base de datos de quién hizo qué y cuándo.
 */

/** La forma de una ruta: lo que se repite, sin lo que identifica a nadie. */
export function patron(ruta) {
  const limpia = String(ruta || '').split('?')[0];
  if (!limpia.startsWith('/api/')) return 'estático';
  return limpia
    .replace(/\/v\/[^/]+/i, '/v/:codigo')
    .replace(/\/(plantas|aparatos|lotes|firmware|sitter|cuidador|fotos)\/[^/]+/gi, '/$1/:id')
    .replace(/\/(restablecer|verificar|clave)\/[^/]+/gi, '/$1/:token')
    /* Cualquier cosa que parezca un id igual se borra: mejor de más. */
    .replace(/\/[0-9a-f]{12,}/gi, '/:id')
    .replace(/\/[A-Z0-9]{8}(?=\/|$)/g, '/:codigo')
    .slice(0, 80);
}

/* Las rutas que llaman a Claude tardan segundos por diseño: medirlas con la
   misma vara que un `GET /api/estado` llenaría el journal de "lento" sin que
   pase nada raro. */
const RUTAS_IA = /(chat|diagnostico|identificar|probar)/;
export const esDeIA = (forma) => RUTAS_IA.test(forma);

const percentil = (ordenados, p) => (ordenados.length
  ? ordenados[Math.min(ordenados.length - 1, Math.floor((ordenados.length * p) / 100))]
  : 0);

/**
 * El registro. `escribir` recibe una línea ya armada; en el VPS es
 * `console.log` y lo levanta journald.
 *
 *   lento     a partir de cuántos ms un pedido merece su propia línea
 *   lentoIA   lo mismo, para las rutas que llaman a la IA
 *   cada      cada cuánto sale el resumen (0 lo apaga)
 */
export function crearRegistro({
  escribir = console.log, reloj = () => Date.now(), lento = 1500, lentoIA = 20000, cada = 10 * 60 * 1000,
} = {}) {
  let desde = reloj();
  let n = 0;
  const clases = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 };
  let tiempos = [];
  let masLento = null;

  function resumen() {
    if (!n) return null;
    const ordenados = [...tiempos].sort((a, b) => a - b);
    const partes = [
      `${n} pedidos en ${Math.round((reloj() - desde) / 1000)} s`,
      Object.entries(clases).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${v}`).join(', '),
      `mediana ${percentil(ordenados, 50)} ms, p95 ${percentil(ordenados, 95)} ms`,
      masLento ? `el más lento: ${masLento.metodo} ${masLento.ruta} ${masLento.ms} ms` : null,
    ].filter(Boolean);
    const linea = partes.join(' · ');
    desde = reloj();
    n = 0;
    for (const k of Object.keys(clases)) clases[k] = 0;
    tiempos = [];
    masLento = null;
    return linea;
  }

  return {
    patron,
    /** Un pedido que terminó. */
    anotar({ metodo = 'GET', ruta = '', codigo = 200, ms = 0 } = {}) {
      const forma = patron(ruta);
      n += 1;
      clases[`${Math.floor(codigo / 100)}xx`] = (clases[`${Math.floor(codigo / 100)}xx`] || 0) + 1;
      tiempos.push(ms);
      if (!masLento || ms > masLento.ms) masLento = { metodo, ruta: forma, ms };

      /* Un 503 en una ruta de IA no es una falla del servidor: es la
         respuesta que se da cuando la IA está apagada (docs/ia.md). */
      const esperado503 = codigo === 503 && esDeIA(forma);
      if (codigo >= 500 && !esperado503) escribir(`error ${codigo} · ${metodo} ${forma} · ${ms} ms`);
      else if (codigo === 429) escribir(`freno 429 · ${metodo} ${forma}`);
      else if (ms >= (esDeIA(forma) ? lentoIA : lento)) escribir(`lento ${ms} ms · ${metodo} ${forma} · ${codigo}`);

      if (cada > 0 && reloj() - desde >= cada) {
        const linea = resumen();
        if (linea) escribir(linea);
      }
    },
    /** El resumen de lo que va, para apagar el servidor sin perderlo. */
    cerrar() {
      const linea = resumen();
      if (linea) escribir(linea);
    },
  };
}
