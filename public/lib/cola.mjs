/* cola.mjs — los cambios hechos sin conexión, esperando para mandarse.
 *
 * Sin red, la app no se traba ni pierde lo que la persona hizo: renombrar
 * una planta, cambiar el brillo, la ciudad, "ya regué" desde el enlace del
 * cuidador, una foto para el álbum. Esos pedidos se guardan en una cola
 * (lib/almacen.mjs) y se aplican a lo que se ve (`aplicarLocal`), y cuando
 * vuelve la conexión salen en orden (lib/api.mjs, sincronizar).
 *
 * Sólo se encolan pedidos que se pueden repetir sin daño y cuya respuesta
 * no hace falta para seguir: una charla o un reconocimiento por foto
 * necesitan la respuesta, y sin red dicen "sin conexión" como siempre.
 *
 * Funciones puras sobre un array: se prueban sin navegador.
 */

export const ENCOLABLES = [
  { metodo: 'PATCH', ruta: /^\/api\/plantas\/[A-Za-z0-9]+$/, fusiona: true },
  { metodo: 'PATCH', ruta: /^\/api\/cuenta$/, fusiona: true },
  { metodo: 'POST', ruta: /^\/api\/sitter\/[A-Za-z0-9_-]+\/riego$/ },
  { metodo: 'POST', ruta: /^\/api\/plantas\/[A-Za-z0-9]+\/fotos$/ },
  { metodo: 'DELETE', ruta: /^\/api\/plantas\/[A-Za-z0-9]+\/fotos\/[0-9]+$/ },
];

/* Una cola no crece sin límite: más que esto es que algo anda mal. */
export const MAXIMO = 50;

export function encolable(metodo, ruta) {
  return ENCOLABLES.find((e) => e.metodo === metodo && e.ruta.test(ruta)) || null;
}

let contador = 0;
/**
 * Agrega un pedido `{ metodo, ruta, cuerpo }` y devuelve la cola nueva.
 * Dos PATCH a la misma ruta se funden en uno (el último manda en cada
 * campo): renombrar tres veces sin red manda un solo nombre.
 */
export function agregar(cola, pedido, t = Date.now()) {
  const regla = encolable(pedido.metodo, pedido.ruta);
  if (!regla) return cola;
  const lista = [...(cola || [])];
  if (regla.fusiona) {
    const i = lista.findIndex((p) => p.metodo === pedido.metodo && p.ruta === pedido.ruta);
    if (i >= 0) {
      lista[i] = { ...lista[i], cuerpo: { ...(lista[i].cuerpo || {}), ...(pedido.cuerpo || {}) }, t };
      return lista;
    }
  }
  contador += 1;
  lista.push({ id: `${t}-${contador}`, metodo: pedido.metodo, ruta: pedido.ruta, cuerpo: pedido.cuerpo ?? null, t });
  return lista.slice(-MAXIMO);
}

export const quitar = (cola, id) => (cola || []).filter((p) => p.id !== id);
export const siguiente = (cola) => (cola || [])[0] || null;

/**
 * Aplica un pedido encolado a lo que se ve, para que la pantalla no mienta
 * mientras espera la red. Devuelve el estado nuevo (sin tocar el viejo).
 */
export function aplicarLocal(estado, pedido) {
  if (!estado || !pedido) return estado;
  let m;
  if (pedido.metodo === 'PATCH' && (m = pedido.ruta.match(/^\/api\/plantas\/([A-Za-z0-9]+)$/))) {
    const c = pedido.cuerpo || {};
    return {
      ...estado,
      nodes: (estado.nodes || []).map((n) => (n.id !== m[1] ? n : {
        ...n,
        ...(c.nombre !== undefined ? { nombre: String(c.nombre).trim().slice(0, 20) } : {}),
        ...(c.pantalla !== undefined ? { pantalla: c.pantalla } : {}),
        ...(c.brillo !== undefined ? { brillo: c.brillo } : {}),
      })),
    };
  }
  if (pedido.metodo === 'PATCH' && pedido.ruta === '/api/cuenta') {
    const c = pedido.cuerpo || {};
    return { ...estado, cuenta: { ...(estado.cuenta || {}), ...(c.nombre !== undefined ? { nombre: c.nombre } : {}), ...(c.paleta !== undefined ? { paleta: c.paleta } : {}) } };
  }
  return estado;
}

/** Aplica toda la cola, en orden. */
export function aplicarCola(estado, cola) {
  return (cola || []).reduce((e, p) => aplicarLocal(e, p), estado);
}
