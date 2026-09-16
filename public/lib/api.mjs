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
 */
import { enBase } from './base.mjs';

const CLAVE = 'rootkit:token';

const leer = (k) => { try { return localStorage.getItem(k); } catch { return null; } };

export const tokenGuardado = () => leer(CLAVE);
export const guardarToken = (t) => { try { localStorage.setItem(CLAVE, t); } catch { /* privado */ } };
export const borrarToken = () => { try { localStorage.removeItem(CLAVE); } catch { /* privado */ } };

export class ErrorApi extends Error {
  constructor(estado, mensaje) {
    super(mensaje);
    this.estado = estado;
  }
}

export async function api(ruta, { metodo = 'GET', cuerpo, token = tokenGuardado() } = {}) {
  let r;
  try {
    r = await fetch(enBase(ruta), {
      method: metodo,
      headers: {
        ...(cuerpo !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
    });
  } catch {
    throw new ErrorApi(0, 'Sin conexión');
  }
  if (r.status === 204) return null;
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErrorApi(r.status, datos.error || `Error ${r.status}`);
  return datos;
}
