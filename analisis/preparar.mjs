/* Deja una cuenta con un Rooti revelado en el servidor local, sin navegador:
 * registra, simula el aparato (misma derivación que el firmware), vincula,
 * abre el cofre, nombra y pone especie. Devuelve { token, planta, aparato }. */
import { randomBytes } from 'node:crypto';
import { codigoVinculo, tokenApi } from '../server/codigo.mjs';

export async function preparar({ BASE = 'http://localhost:8090', persona = 'brote', placa = 'emulador', nombre = 'Brotecito', token = null } = {}) {
  const pedir = async (metodo, ruta, cuerpo, tok) => {
    const r = await fetch(`${BASE}${ruta}`, {
      method: metodo,
      headers: { 'content-type': 'application/json', ...(tok ? { authorization: `Bearer ${tok}` } : {}) },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error(`${metodo} ${ruta} ${r.status} ${JSON.stringify(j)}`);
    return j;
  };
  if (!token) {
    const reg = await pedir('POST', '/api/cuenta/registro', { email: `prueba-${Date.now()}-${Math.random().toString(16).slice(2, 6)}@ejemplo.com`, clave: 'una clave segura', nombre: 'Rocío', tz: 'America/Argentina/Buenos_Aires' });
    token = reg.token;
  }
  const secreto = randomBytes(16);
  const id = randomBytes(6).toString('hex').toUpperCase();
  const tokAp = tokenApi(secreto);
  let reloj = 1000;
  const sync = (extra = {}) => pedir('POST', '/api/d/sync', {
    id, fw: '0.5.0', placa, pantalla: 'st7735-128', persona, estado: 'SIN_VINCULO', epoca: 0,
    codigo: codigoVinculo(secreto, 0), reloj: reloj++, rssi: -50, usb: true, bat_mv: 0, arranques: 1, lecturas: [], ...extra,
  }, tokAp);
  await sync();
  const planta = await pedir('POST', '/api/vinculo', { codigo: codigoVinculo(secreto, 0) }, token);
  const cofre = await pedir('POST', '/api/cofre/abrir', { planta: planta.id }, token);
  await pedir('PATCH', `/api/plantas/${planta.id}`, { nombre, especie: 'monstera' }, token);
  const lecturas = [{ hace: 0, suelo: 42, temp: 230, hr: 55, lux: 3000, animo: 'HAPPY', sev: 'OK' }];
  await sync({ estado: 'ACTIVO', lecturas });
  const demo = (accion) => pedir('POST', '/api/d/demo', { id, accion }, tokAp);
  return { token, planta, cofre, id, demo, sync, pedir };
}
