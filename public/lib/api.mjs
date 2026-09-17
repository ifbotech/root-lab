/* api.mjs — la sesión y los pedidos al servidor.
 *
 * CADA PERSONA TIENE SU CUENTA
 *
 * Email y contraseña. Al entrar, el servidor devuelve un token de sesión que
 * el teléfono guarda; con él, cada pedido ve sólo las plantas de esa cuenta.
 * Entrar desde otro teléfono con el mismo email trae las mismas plantas, y
 * cerrar la sesión en uno no toca los demás.
 *
 * El token vive en localStorage del origen de la app. Si el servidor dice que
 * la sesión venció (401), la app lo borra y vuelve a pedir entrar.
 *
 * LOCAL PRIMERO (lib/almacen.mjs, lib/cola.mjs)
 *
 * Cada lectura que sale bien se guarda en el teléfono; si la siguiente falla
 * por falta de red, se devuelve la guardada y `desdeCache()` lo dice, para
 * que la app avise "sin conexión" mostrando igual lo último que vio. Los
 * cambios que se pueden repetir sin daño (renombrar, brillo, ciudad, "ya
 * regué", fotos) se encolan y salen solos cuando vuelve la red; los demás
 * fallan como siempre. Nada de esto queda para otra cuenta: al cerrar la
 * sesión se vacía.
 */
import { enBase } from './base.mjs';
import { almacen } from './almacen.mjs';
import { encolable, agregar, quitar, siguiente } from './cola.mjs';

const CLAVE = 'rootkit:token';
const CLAVE_COLA = 'cola';
/* Qué lecturas vale la pena guardar: las que arman las pantallas. */
const CACHEABLES = /^\/api\/(estado|config|cuenta|coleccion|especies|plantas\/[A-Za-z0-9]+(\/(historial|chat|fotos|cuidador|prevision))?|sitter\/[^/]+)(\?.*)?$/;

const leer = (k) => { try { return localStorage.getItem(k); } catch { return null; } };

/* PREGUNTAR SI CAMBIÓ, EN VEZ DE BAJARLO DE NUEVO
 *
 * El tablero se relee cada quince segundos y casi nunca cambia. El servidor
 * manda con cada lectura una etiqueta (`ETag`) y acá se guarda junto con la
 * respuesta; la próxima vez la etiqueta viaja en `If-None-Match` y, si sigue
 * valiendo, la respuesta es un `304` vacío y se reusa lo que ya estaba.
 *
 * Vive en memoria y sólo mientras la app está abierta: en el disco del
 * teléfono no queda nada (las respuestas siguen siendo `no-store`). El texto
 * se guarda sin interpretar y se vuelve a interpretar en cada `304`, así dos
 * pantallas nunca comparten el mismo objeto sin querer. */
const etags = new Map();
const TOPE_ETAGS = 40;

export const tokenGuardado = () => leer(CLAVE);
export const guardarToken = (t) => { try { localStorage.setItem(CLAVE, t); } catch { /* privado */ } };
export const borrarToken = () => {
  try { localStorage.removeItem(CLAVE); } catch { /* privado */ }
  /* Lo guardado es de esa cuenta: no queda para la siguiente. */
  almacen().vaciar('get:');
  almacen().borrar(CLAVE_COLA);
  etags.clear();
};

export class ErrorApi extends Error {
  constructor(estado, mensaje) {
    super(mensaje);
    this.estado = estado;
  }
}

let ultimaDesdeCache = false;
/** Si el último pedido se contestó con lo guardado por no haber red. */
export const desdeCache = () => ultimaDesdeCache;

const oyentes = new Set();
/** Avisar cuando la cola cambia (para el contador de la barra). */
export const alCambiarCola = (f) => { oyentes.add(f); return () => oyentes.delete(f); };
let pendientes = 0;
export const colaPendiente = () => pendientes;
const avisarCola = (cola) => { pendientes = cola.length; oyentes.forEach((f) => f(pendientes)); };

async function pedir(ruta, { metodo, cuerpo, token }) {
  const previo = metodo === 'GET' ? etags.get(ruta) : null;
  let r;
  try {
    r = await fetch(enBase(ruta), {
      method: metodo,
      headers: {
        ...(cuerpo !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(previo ? { 'if-none-match': previo.etag } : {}),
      },
      body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
    });
  } catch {
    throw new ErrorApi(0, 'Sin conexión');
  }
  if (r.status === 304 && previo) return JSON.parse(previo.texto);
  if (r.status === 204) return null;
  const texto = await r.text().catch(() => '');
  let datos;
  try { datos = texto ? JSON.parse(texto) : {}; } catch { datos = {}; }
  if (!r.ok) {
    /* Una etiqueta vieja no puede dejar a la app clavada en un error. */
    etags.delete(ruta);
    throw new ErrorApi(r.status, datos.error || `Error ${r.status}`);
  }
  const etag = r.headers.get('etag');
  if (metodo === 'GET' && etag && texto) {
    if (etags.size >= TOPE_ETAGS && !etags.has(ruta)) etags.clear();
    etags.set(ruta, { etag, texto });
  }
  return datos;
}

export async function api(ruta, { metodo = 'GET', cuerpo, token = tokenGuardado(), cache = true } = {}) {
  const guardable = cache && metodo === 'GET' && CACHEABLES.test(ruta);
  try {
    const datos = await pedir(ruta, { metodo, cuerpo, token });
    ultimaDesdeCache = false;
    if (guardable) almacen().guardar(`get:${ruta}`, datos);
    if (metodo !== 'GET' && pendientes > 0) sincronizar();
    return datos;
  } catch (e) {
    if (!(e instanceof ErrorApi) || e.estado !== 0) throw e;
    if (guardable) {
      const g = await almacen().leer(`get:${ruta}`);
      if (g) {
        ultimaDesdeCache = true;
        return g.valor;
      }
    } else if (encolable(metodo, ruta)) {
      const cola = agregar((await almacen().leer(CLAVE_COLA))?.valor || [], { metodo, ruta, cuerpo });
      await almacen().guardar(CLAVE_COLA, cola);
      avisarCola(cola);
      return { encolado: true };
    }
    throw e;
  }
}

/** Lo guardado para una ruta, sin ir a la red (para pintar al instante). */
export async function guardado(ruta) {
  const g = await almacen().leer(`get:${ruta}`);
  return g ? { datos: g.valor, t: g.t } : null;
}

let sincronizando = null;
/**
 * Manda los cambios encolados, en orden. Para en el primero que no sale por
 * falta de red; descarta los que el servidor rechaza (ya no tienen sentido).
 * Devuelve cuántos salieron.
 */
export function sincronizar() {
  if (sincronizando) return sincronizando;
  sincronizando = (async () => {
    let cola = (await almacen().leer(CLAVE_COLA))?.valor || [];
    let salieron = 0;
    for (let p = siguiente(cola); p; p = siguiente(cola)) {
      try {
        await pedir(p.ruta, { metodo: p.metodo, cuerpo: p.cuerpo ?? undefined, token: tokenGuardado() });
        salieron += 1;
      } catch (e) {
        if (e instanceof ErrorApi && e.estado === 0) break;   /* sigue sin red */
      }
      cola = quitar(cola, p.id);
      await almacen().guardar(CLAVE_COLA, cola);
    }
    avisarCola(cola);
    return salieron;
  })().finally(() => { sincronizando = null; });
  return sincronizando;
}

/** Cuántos cambios esperan, leídos del almacén (al arrancar). */
export async function contarCola() {
  const cola = (await almacen().leer(CLAVE_COLA))?.valor || [];
  avisarCola(cola);
  return cola.length;
}
