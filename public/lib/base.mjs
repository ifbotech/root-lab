/* base.mjs — dónde está montada la app.
 *
 * La app puede vivir en la raíz de un dominio o debajo de una ruta
 * (https://ifbotech.com/rootkit/). El servidor escribe `<base href>` en cada
 * página con la base que le configuraron (ROOTLAB_BASE), y de ahí sale todo:
 * las rutas relativas del HTML las resuelve el navegador, y lo que arma
 * JavaScript —pedidos a la API, historial del navegador, recursos— pasa por
 * `enBase()`.
 */

/** La base sin barra final: "" en la raíz, "/rootkit" en una subruta. */
export const BASE = (() => {
  try {
    return new URL(document.baseURI).pathname.replace(/\/+$/, '');
  } catch {
    return '';
  }
})();

/** Una ruta de la app con la base adelante: enBase('api/estado'). */
export const enBase = (ruta = '') => `${BASE}/${String(ruta).replace(/^\/+/, '')}`;

/** La ruta actual sin la base: "/rootkit/v/ABC" -> "/v/ABC". */
export function rutaSinBase(pathname = location.pathname) {
  if (BASE && pathname.toLowerCase().startsWith(BASE.toLowerCase())) {
    return pathname.slice(BASE.length) || '/';
  }
  return pathname;
}
