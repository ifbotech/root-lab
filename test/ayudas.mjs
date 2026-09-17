/* ayudas.mjs — el escenario de los tests de la API.
 *
 * Una base en memoria, avisos y emails que quedan en listas, un reloj que se
 * mueve a mano y un Rooti de mentira que habla igual que el de verdad (con la
 * misma derivación de código y token que el firmware).
 */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

import { crearApi } from '../server/api.mjs';
import { abrirBase } from '../server/db.mjs';
import { crearIA } from '../server/ia.mjs';
import { crearPushDePrueba } from '../server/push.mjs';
import { crearCorreo } from '../server/correo.mjs';
import { crearCripto } from '../server/cripto.mjs';
import { crearClaves } from '../server/claves.mjs';
import { crearPresupuesto } from '../server/presupuesto.mjs';
import { codigoVinculo, tokenApi } from '../server/codigo.mjs';

export const H = 3600 * 1000;
export const T0 = Date.parse('2026-09-16T15:00:00-03:00');
export const FOTO = 'x'.repeat(4000);

/* Argon2id liviano en los tests: el formato y la lógica son los mismos. */
const ARGON_TEST = { memoria: 1024, pasadas: 1, hilos: 1, largo: 32 };

export function escenario({ ia = crearIA({ clave: '' }), tope = {}, limites, argon = ARGON_TEST, url = 'https://rootlab.test', clima, azar = () => 0 } = {}) {
  const reloj = { t: T0 };
  const db = abrirBase();
  const push = crearPushDePrueba();
  const correo = crearCorreo({ transporte: 'memoria', registro: {} });
  const claves = crearClaves(crearCripto(randomBytes(32)), argon);
  const alertas = [];
  const presupuesto = crearPresupuesto({
    db, reloj: () => reloj.t, ...tope, ...(limites ? { limites } : {}),
    alAlerta: (a) => alertas.push(a),
  });
  const api = crearApi({
    db, push, ia, correo, claves, presupuesto,
    reloj: () => reloj.t,
    azar,
    urlPublica: () => url,
    ...(clima ? { clima } : {}),
  });
  const llamar = (metodo, ruta, { cuerpo = null, token = null, query = {}, ip = '1.2.3.4' } = {}) =>
    api.manejar({
      metodo, ruta, cuerpo, query, ip,
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
  return { reloj, db, push, correo, claves, presupuesto, alertas, api, llamar };
}

/* Un Rooti de mentira que habla igual que el de verdad. */
export function aparato(esc, { persona = 'brote', id = 'A1B2C3D4E5F6' } = {}) {
  const secreto = randomBytes(16);
  const yo = {
    id, secreto, token: tokenApi(secreto), epoca: 0, reloj: 1000, arranques: 1,
    vinculado: false, pendientes: [],
    get codigo() { return codigoVinculo(secreto, this.epoca); },
  };
  yo.medir = (l) => {
    yo.pendientes.push({ ...l, reloj: yo.reloj });
  };
  yo.sync = async (extra = {}) => {
    const cuerpo = {
      id: yo.id, fw: '0.5.0', placa: 'c3-supermini', pantalla: 'ili9341-240x320',
      persona, estado: yo.vinculado ? 'ACTIVO' : 'SIN_VINCULO', epoca: yo.epoca,
      ...(yo.vinculado ? {} : { codigo: yo.codigo }),
      reloj: yo.reloj, rssi: -60, usb: false, bat_mv: 3900, arranques: yo.arranques,
      lecturas: yo.pendientes.map(({ reloj, ...l }) => ({ hace: yo.reloj - reloj, ...l })),
      ...extra,
    };
    const [codigo, r] = await esc.llamar('POST', '/api/d/sync', { cuerpo, token: yo.token });
    if (codigo === 200) {
      yo.pendientes.splice(0, r.aceptadas);
      if (yo.vinculado && !r.vinculado) yo.epoca += 1;
      yo.vinculado = r.vinculado;
    }
    return [codigo, r];
  };
  yo.pasar = (segundos) => {
    yo.reloj += segundos;
    esc.reloj.t += segundos * 1000;
  };
  return yo;
}

let nCuentas = 0;
export async function cuenta(esc, { email = `persona${++nCuentas}@ejemplo.com`, clave = 'una clave segura', nombre = 'Persona' } = {}) {
  const [c, r] = await esc.llamar('POST', '/api/cuenta/registro', {
    cuerpo: { email, clave, nombre, tz: 'America/Argentina/Buenos_Aires' },
  });
  assert.equal(c, 201, JSON.stringify(r));
  return r.token;
}

let nAparatos = 0;
/** Una cuenta con un Rooti vinculado, el cofre abierto y la planta con nombre. */
export async function conRooti(esc, { persona = 'brote', nombre = 'Rulo', token = null } = {}) {
  nAparatos += 1;
  const maceta = aparato(esc, { persona, id: `C0FFEE${String(nAparatos).padStart(6, '0')}` });
  const t = token || await cuenta(esc);
  await maceta.sync();
  const [cv, planta] = await esc.llamar('POST', '/api/vinculo', { token: t, cuerpo: { codigo: maceta.codigo } });
  assert.equal(cv, 201, JSON.stringify(planta));
  const [cc, cofre] = await esc.llamar('POST', `/api/plantas/${planta.id}/cofre`, { token: t });
  assert.equal(cc, 200);
  if (nombre) await esc.llamar('PATCH', `/api/plantas/${planta.id}`, { token: t, cuerpo: { nombre } });
  await maceta.sync();
  return { maceta, token: t, planta, cofre };
}
