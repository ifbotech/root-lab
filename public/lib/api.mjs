/* api.mjs — la sesión y los pedidos al servidor.
 *
 * LA CUENTA ES ANÓNIMA
 *
 * No hay usuario ni contraseña. La primera vez que se abre la app se crea
 * una cuenta y el teléfono guarda su token. Pedir un mail antes de que la
 * maceta abra los ojos sería pedir algo a cambio de nada; el día que haga
 * falta (varios teléfonos, recuperar la cuenta) se agrega sin romper esto.
 *
 * Para pasar la cuenta a otro teléfono —o de Safari a la app instalada en
 * un iPhone, que no comparten almacenamiento— está el código de
 * transferencia de Ajustes.
 */

const CLAVE = 'rootkit:token';

const leer = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const escribir = (k, v) => { try { localStorage.setItem(k, v); } catch { /* privado */ } };

export const tokenGuardado = () => leer(CLAVE);
export const guardarToken = (t) => escribir(CLAVE, t);

export class ErrorApi extends Error {
  constructor(estado, mensaje) {
    super(mensaje);
    this.estado = estado;
  }
}

export async function api(ruta, { metodo = 'GET', cuerpo, token = tokenGuardado() } = {}) {
  let r;
  try {
    r = await fetch(ruta, {
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

/** Garantiza que haya una cuenta. Devuelve el token. */
export async function asegurarCuenta() {
  const t = tokenGuardado();
  if (t) {
    try {
      await api('/api/cuenta', { token: t });
      return t;
    } catch (e) {
      if (e.estado !== 401) return t;   /* sin red: se sigue con la que hay */
    }
  }
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const r = await api('/api/cuenta', { metodo: 'POST', cuerpo: { tz }, token: null });
  guardarToken(r.token);
  return r.token;
}
