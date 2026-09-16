/* almacen.mjs — lo que la app guarda en el teléfono para abrir sin red.
 *
 * LOCAL PRIMERO
 *
 * La app abre en menos de 100 ms con lo último que vio —las caras, las
 * tareas, los números— aunque no haya red, y después se pone al día. Para
 * eso guarda en IndexedDB la última respuesta de cada pedido de lectura
 * (`get:/api/estado`, el historial de una planta, la charla...) y la cola
 * de cambios hechos sin conexión (lib/cola.mjs).
 *
 * Es una tabla clave → valor, nada más. IndexedDB y no localStorage porque
 * localStorage es sincrónico, chico (5 MB) y de texto; una charla larga y
 * un historial de 7 días de tres plantas ya lo llenan.
 *
 * El respaldo (`backend`) se inyecta: IndexedDB en el navegador, un Map en
 * los tests y como red de seguridad cuando IndexedDB no está (modo privado
 * de algún navegador). La app nunca se rompe por no poder guardar.
 */

const NOMBRE = 'rootlab';
const TIENDA = 'kv';

/** Un respaldo en memoria: para los tests y para navegadores sin IndexedDB. */
export function backendMemoria() {
  const m = new Map();
  return {
    tipo: 'memoria',
    async leer(clave) { return m.has(clave) ? m.get(clave) : undefined; },
    async guardar(clave, valor) { m.set(clave, valor); },
    async borrar(clave) { m.delete(clave); },
    async claves(prefijo = '') { return [...m.keys()].filter((k) => k.startsWith(prefijo)); },
  };
}

/** IndexedDB, o null si el navegador no la tiene. */
export function backendIndexedDB(nombre = NOMBRE, tienda = TIENDA) {
  if (typeof indexedDB === 'undefined') return null;
  let abriendo = null;
  const abrir = () => {
    if (abriendo) return abriendo;
    abriendo = new Promise((ok, mal) => {
      const req = indexedDB.open(nombre, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(tienda); };
      req.onsuccess = () => ok(req.result);
      req.onerror = () => mal(req.error);
      req.onblocked = () => mal(new Error('bloqueada'));
    });
    abriendo.catch(() => { abriendo = null; });
    return abriendo;
  };
  const pedir = (modo, fn) => abrir().then((db) => new Promise((ok, mal) => {
    const tx = db.transaction(tienda, modo);
    const r = fn(tx.objectStore(tienda));
    r.onsuccess = () => ok(r.result);
    r.onerror = () => mal(r.error);
  }));
  return {
    tipo: 'indexeddb',
    leer: (clave) => pedir('readonly', (s) => s.get(clave)),
    guardar: (clave, valor) => pedir('readwrite', (s) => s.put(valor, clave)),
    borrar: (clave) => pedir('readwrite', (s) => s.delete(clave)),
    claves: (prefijo = '') => pedir('readonly', (s) => s.getAllKeys()).then((ks) => ks.filter((k) => String(k).startsWith(prefijo))),
  };
}

/**
 * El almacén: clave → valor, con fecha. Nunca tira: si el respaldo falla
 * (cuota, modo privado), leer devuelve null y guardar no hace nada.
 */
export function crearAlmacen(backend) {
  const b = backend || backendMemoria();
  return {
    tipo: b.tipo,
    /** El valor guardado bajo `clave`, o null. */
    async leer(clave) {
      try {
        const r = await b.leer(clave);
        return r === undefined ? null : r;
      } catch { return null; }
    },
    /** Guarda `valor` con la hora. Devuelve si pudo. */
    async guardar(clave, valor, t = Date.now()) {
      try { await b.guardar(clave, { t, valor }); return true; } catch { return false; }
    },
    async borrar(clave) {
      try { await b.borrar(clave); return true; } catch { return false; }
    },
    async claves(prefijo = '') {
      try { return await b.claves(prefijo); } catch { return []; }
    },
    /** Borra todo lo que empiece con `prefijo` (al cerrar la sesión). */
    async vaciar(prefijo = '') {
      for (const k of await this.claves(prefijo)) await this.borrar(k);
    },
  };
}

let unico = null;
/** El almacén de la app (uno solo por página). */
export function almacen() {
  if (!unico) unico = crearAlmacen(backendIndexedDB() || backendMemoria());
  return unico;
}
