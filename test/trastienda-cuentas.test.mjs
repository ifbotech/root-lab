/* Quién entra a la trastienda, y qué puede hacer con las cuentas.
 *
 * Son dos cosas delicadas juntas: una puerta que se abre con un código de seis
 * dígitos que llega por email, y la única pantalla del sistema que muestra los
 * emails de la gente. Las pruebas de acá son sobre todo de lo que NO tiene que
 * pasar.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { escenario, cuenta, aparato, conRooti } from './ayudas.mjs';
import { ADMIN_CODIGO_MS, ADMIN_CODIGO_INTENTOS, ADMIN_SESION_MS } from '../server/api.mjs';

const ADMIN = 'una-clave-de-administracion-bien-larga';
const DUENIO = 'duenio@ifbotech.com';
const panel = (op = {}) => escenario({ opciones: { adminClave: ADMIN, adminsDeArranque: [DUENIO], ...op } });
const admin = (esc, metodo, ruta, cuerpo = null, token = ADMIN) => esc.llamar(metodo, ruta, { cuerpo, token });

/** Pide el código y lo saca del email que se mandó (como haría quien lo lee). */
async function codigoDe(esc, email) {
  const [c] = await esc.llamar('POST', '/api/admin/codigo', { cuerpo: { email } });
  assert.equal(c, 202);
  const mail = esc.correo.enviados.at(-1);
  if (!mail || mail.tipo !== 'trastienda') return null;
  return mail.asunto.match(/^(\d{6})/)?.[1] || null;
}

describe('entrar con un código por email', () => {
  test('el código llega, abre una vez y no sirve dos', async () => {
    const esc = panel();
    const codigo = await codigoDe(esc, DUENIO);
    assert.match(codigo || '', /^\d{6}$/, 'seis dígitos');

    const [c, s] = await esc.llamar('POST', '/api/admin/sesion', { cuerpo: { email: DUENIO, codigo } });
    assert.equal(c, 201);
    assert.match(s.token, /^[0-9a-f]{64}$/);
    assert.equal(s.email, DUENIO);
    assert.equal((await admin(esc, 'GET', '/api/admin/estado', null, s.token))[0], 200);

    const [otra] = await esc.llamar('POST', '/api/admin/sesion', { cuerpo: { email: DUENIO, codigo } });
    assert.equal(otra, 401, 'el mismo código no entra dos veces');
  });

  test('pedir un código no dice quién es administrador', async () => {
    /* Si contestara distinto, esta ruta sería una forma de averiguar qué
       email administra el servidor. */
    const esc = panel();
    const [a] = await esc.llamar('POST', '/api/admin/codigo', { cuerpo: { email: DUENIO } });
    const [b] = await esc.llamar('POST', '/api/admin/codigo', { cuerpo: { email: 'cualquiera@ejemplo.com' } });
    const [c] = await esc.llamar('POST', '/api/admin/codigo', { cuerpo: { email: 'no-es-un-email' } });
    assert.deepEqual([a, b, c], [202, 202, 202]);
    assert.equal(esc.correo.enviados.filter((m) => m.tipo === 'trastienda').length, 1, 'pero el email sale uno solo');
  });

  test('un código de otro email no abre nada', async () => {
    const esc = panel();
    const codigo = await codigoDe(esc, DUENIO);
    const t = await cuenta(esc, { email: 'otra@ejemplo.com' });
    assert.ok(t);
    const [c] = await esc.llamar('POST', '/api/admin/sesion', { cuerpo: { email: 'otra@ejemplo.com', codigo } });
    assert.equal(c, 401);
  });

  test('a los cinco intentos el código se quema', async () => {
    const esc = panel();
    await codigoDe(esc, DUENIO);
    let ultimo = 0;
    for (let i = 0; i < ADMIN_CODIGO_INTENTOS; i++) {
      [ultimo] = await esc.llamar('POST', '/api/admin/sesion', { cuerpo: { email: DUENIO, codigo: '000000' } });
      assert.equal(ultimo, 401);
    }
    [ultimo] = await esc.llamar('POST', '/api/admin/sesion', { cuerpo: { email: DUENIO, codigo: '000000' } });
    assert.equal(ultimo, 429, 'el sexto intento lo quema');
    const [despues] = await esc.llamar('POST', '/api/admin/sesion', { cuerpo: { email: DUENIO, codigo: '000000' } });
    assert.equal(despues, 401, 'y después ya no hay código');
  });

  test('el código vence', async () => {
    const esc = panel();
    const codigo = await codigoDe(esc, DUENIO);
    esc.reloj.t += ADMIN_CODIGO_MS + 1000;
    const [c] = await esc.llamar('POST', '/api/admin/sesion', { cuerpo: { email: DUENIO, codigo } });
    assert.equal(c, 401);
  });

  test('pedir códigos sin parar se corta', async () => {
    const esc = panel();
    let ultimo = 0;
    for (let i = 0; i < 11; i++) {
      [ultimo] = await esc.llamar('POST', '/api/admin/codigo', { cuerpo: { email: DUENIO } });
    }
    assert.equal(ultimo, 429);
  });

  test('si le sacan el rol entre que pide el código y lo usa, no entra', async () => {
    const esc = panel({ adminsDeArranque: [] });
    const t = await cuenta(esc, { email: 'jefa@ejemplo.com' });
    assert.ok(t);
    const lista = (await admin(esc, 'GET', '/api/admin/cuentas'))[1].cuentas;
    const jefa = lista.find((c) => c.email === 'jefa@ejemplo.com');
    await admin(esc, 'PATCH', `/api/admin/cuentas/${jefa.id}`, { rol: 'admin' });

    const codigo = await codigoDe(esc, 'jefa@ejemplo.com');
    assert.ok(codigo, 'ahora sí le llega');
    await admin(esc, 'PATCH', `/api/admin/cuentas/${jefa.id}`, { rol: 'persona' });
    const [c] = await esc.llamar('POST', '/api/admin/sesion', { cuerpo: { email: 'jefa@ejemplo.com', codigo } });
    assert.equal(c, 401, 'el rol se mira al entrar, no al pedir');
  });

  test('la clave del servidor sigue entrando, para las herramientas', async () => {
    const esc = panel();
    const [c, s] = await esc.llamar('POST', '/api/admin/sesion', { cuerpo: { clave: ADMIN } });
    assert.equal(c, 201);
    assert.equal(s.email, '');
    esc.reloj.t += ADMIN_SESION_MS + 1000;
    assert.equal((await admin(esc, 'GET', '/api/admin/estado', null, s.token))[0], 401, 'y también vence');
  });
});

describe('las cuentas', () => {
  test('se ven las que hay, con lo que hace falta para escribirles', async () => {
    const esc = panel();
    await cuenta(esc, { email: 'una@ejemplo.com', nombre: 'Una' });
    await cuenta(esc, { email: 'otra@ejemplo.com', nombre: 'Otra' });

    const [c, r] = await admin(esc, 'GET', '/api/admin/cuentas');
    assert.equal(c, 200);
    assert.equal(r.cuentas.length, 2);
    const una = r.cuentas.find((x) => x.email === 'una@ejemplo.com');
    assert.equal(una.nombre, 'Una');
    assert.equal(una.rol, 'persona');
    assert.equal(una.plantas, 0);
    assert.ok(una.creada > 0);
    /* Lo que NO tiene que venir. */
    assert.ok(!('clave_hash' in una), 'ni el hash de la contraseña');
    assert.ok(!('coleccion' in una), 'ni lo que juntó');
    assert.ok(!('ubicacion' in una), 'ni dónde vive');
  });

  test('se da y se saca el rol de administración', async () => {
    const esc = panel();
    await cuenta(esc, { email: 'socia@ejemplo.com' });
    const socia = (await admin(esc, 'GET', '/api/admin/cuentas'))[1].cuentas[0];
    assert.equal(socia.rol, 'persona');

    const [c, r] = await admin(esc, 'PATCH', `/api/admin/cuentas/${socia.id}`, { rol: 'admin' });
    assert.equal(c, 200);
    assert.equal(r.rol, 'admin');
    assert.ok(await codigoDe(esc, 'socia@ejemplo.com'), 'ahora puede pedir código');

    await admin(esc, 'PATCH', `/api/admin/cuentas/${socia.id}`, { rol: 'persona' });
    esc.correo.enviados.length = 0;
    await esc.llamar('POST', '/api/admin/codigo', { cuerpo: { email: 'socia@ejemplo.com' } });
    assert.equal(esc.correo.enviados.filter((m) => m.tipo === 'trastienda').length, 0, 'y después ya no');

    assert.equal((await admin(esc, 'PATCH', `/api/admin/cuentas/${socia.id}`, { rol: 'dios' }))[0], 400);
    assert.equal((await admin(esc, 'PATCH', '/api/admin/cuentas/noexiste', { rol: 'admin' }))[0], 404);
  });

  test('al administrador del entorno no se le saca el rol ni se lo borra', async () => {
    /* Si se pudiera, el panel podría quedarse sin nadie que pueda entrar. */
    const esc = panel();
    await cuenta(esc, { email: DUENIO });
    const duenio = (await admin(esc, 'GET', '/api/admin/cuentas'))[1].cuentas.find((c) => c.email === DUENIO);
    assert.equal(duenio.rol, 'admin', 'es admin aunque su cuenta diga persona');
    assert.equal(duenio.fijo, true);
    assert.equal((await admin(esc, 'PATCH', `/api/admin/cuentas/${duenio.id}`, { rol: 'persona' }))[0], 409);
    assert.equal((await admin(esc, 'DELETE', `/api/admin/cuentas/${duenio.id}`))[0], 409);
  });

  test('borrar una cuenta se lleva todo lo suyo y libera su Rooti', async () => {
    const esc = panel();
    const t = await cuenta(esc, { email: 'sevá@ejemplo.com' });
    const a = aparato(esc, { id: 'AA0000000009' });
    await a.sync();
    await esc.llamar('POST', '/api/vinculo', { token: t, cuerpo: { codigo: a.codigo } });

    const quien = (await admin(esc, 'GET', '/api/admin/cuentas'))[1].cuentas[0];
    assert.equal((await admin(esc, 'DELETE', `/api/admin/cuentas/${quien.id}`))[0], 204);
    assert.equal((await admin(esc, 'GET', '/api/admin/cuentas'))[1].cuentas.length, 0);
    assert.equal((await esc.llamar('GET', '/api/estado', { token: t }))[0], 401, 'la sesión de esa cuenta ya no vale');
    const [, flota] = await admin(esc, 'GET', '/api/admin/flota');
    assert.equal(flota.aparatos[0].vinculado, false, 'el Rooti queda libre');
    assert.equal((await admin(esc, 'DELETE', `/api/admin/cuentas/${quien.id}`))[0], 404);
  });

  test('sin entrar, no se ve ninguna cuenta', async () => {
    const esc = panel();
    await cuenta(esc, { email: 'privada@ejemplo.com' });
    assert.equal((await esc.llamar('GET', '/api/admin/cuentas'))[0], 401);
  });
});

describe('los tokens de los agentes', () => {
  test('un token de agente sólo sirve para el vivero', async () => {
    const esc = panel();
    const [c, a] = await admin(esc, 'POST', '/api/admin/agentes', { nombre: 'agente-infra' });
    assert.equal(c, 201);
    assert.match(a.token, /^agt_[0-9a-f]{48}$/);
    assert.equal(a.alcance, 'vivero');

    const conToken = (metodo, ruta, cuerpo = null) => esc.llamar(metodo, ruta, { cuerpo, token: a.token });
    assert.equal((await conToken('GET', '/api/admin/ideas'))[0], 200, 'puede leer el vivero');
    const [ci] = await conToken('POST', '/api/admin/ideas', {
      area: 'infraestructura', titulo: 'Algo que vale la pena mirar', impacto: 'alto', esfuerzo: 'bajo', autor: 'agente-infra',
    });
    assert.equal(ci, 201, 'y proponer');

    /* Lee cómo anda el producto: recuentos y ritmos, por GET. */
    for (const ruta of ['/api/admin/estado', '/api/admin/flota', '/api/admin/lecturas', '/api/admin/metricas']) {
      assert.equal((await conToken('GET', ruta))[0], 200, `lee ${ruta}`);
    }

    /* Y nada más: ni cuentas, ni aparatos uno por uno, ni firmware, ni agentes. */
    for (const ruta of ['/api/admin/cuentas', '/api/admin/aparatos', '/api/admin/firmware', '/api/admin/agentes', '/api/admin/yo']) {
      assert.equal((await conToken('GET', ruta))[0], 403, ruta);
    }
    assert.equal((await conToken('POST', '/api/admin/agentes', { nombre: 'otro' }))[0], 403, 'ni crear más agentes');
  });

  test('lo que un agente lee no tiene datos de personas', async () => {
    /* Una cuenta con nombre y email, su Rooti y su planta con nombre: nada de
       eso puede aparecer en lo que ve un agente, cuyo token vive en un entorno
       que no controlamos del todo. */
    const esc = panel();
    const email = 'rocio.privada@ejemplo.com';
    const t = await cuenta(esc, { email, nombre: 'Rocío Privada' });
    await conRooti(esc, { token: t, nombre: 'Potus Secreto' });
    const [, a] = await admin(esc, 'POST', '/api/admin/agentes', { nombre: 'agente-producto' });

    for (const ruta of ['/api/admin/estado', '/api/admin/flota', '/api/admin/lecturas', '/api/admin/metricas']) {
      const [c, r] = await esc.llamar('GET', ruta, { token: a.token });
      assert.equal(c, 200, ruta);
      const texto = JSON.stringify(r);
      for (const dato of [email, 'rocio.privada', 'Rocío Privada', 'Potus Secreto']) {
        assert.ok(!texto.includes(dato), `${ruta} no muestra "${dato}"`);
      }
    }
    /* La flota sí dice si un aparato está vinculado, pero no a quién. */
    const flota = (await esc.llamar('GET', '/api/admin/flota', { token: a.token }))[1];
    assert.ok(flota.aparatos.some((d) => d.vinculado === true));
    assert.ok(flota.aparatos.every((d) => !('planta' in d) && !('cuenta' in d)));
  });

  test('el método importa: la misma ruta que se lee no se escribe', async () => {
    /* /api/admin/aparatos por POST registra una placa de fábrica, por PATCH
       la deshabilita y por DELETE la borra. Un permiso que mirara sólo la
       ruta le daría todo eso a quien sólo tenía que leer. */
    const esc = panel();
    const [, a] = await admin(esc, 'POST', '/api/admin/agentes', { nombre: 'jardinero', alcance: 'jardinero' });
    const conToken = (metodo, ruta, cuerpo = null) => esc.llamar(metodo, ruta, { cuerpo, token: a.token });
    const placa = aparato(esc, { id: 'D0D1D2D3D4D5' });

    const escrituras = [
      ['POST', '/api/admin/aparatos', { id: 'D0D1D2D3D4D5', token: placa.token, persona: 'brote' }],
      ['PATCH', '/api/admin/aparatos/D0D1D2D3D4D5', { deshabilitado: true }],
      ['DELETE', '/api/admin/aparatos/D0D1D2D3D4D5'],
      ['PATCH', '/api/admin/lotes/L1', { deshabilitado: true }],
      ['POST', '/api/admin/firmware', { version: '9.9.9' }],
      ['DELETE', '/api/admin/firmware/1'],
      ['POST', '/api/admin/estado'],
      ['DELETE', '/api/admin/metricas'],
      ['PATCH', '/api/admin/cuentas/c1', { rol: 'admin' }],
      ['DELETE', '/api/admin/sesion'],
    ];
    for (const [metodo, ruta, cuerpo] of escrituras) {
      assert.equal((await conToken(metodo, ruta, cuerpo))[0], 403, `${metodo} ${ruta}`);
    }
    assert.ok(!esc.db.dispositivo('D0D1D2D3D4D5'), 'no registró nada');

    /* Las ideas: propone y mueve, pero no borra (eso es de una persona). */
    const [, idea] = await conToken('POST', '/api/admin/ideas', {
      area: 'producto', titulo: 'Una idea para probar el borrado', impacto: 'medio', esfuerzo: 'bajo', autor: 'jardinero',
    });
    assert.equal((await conToken('PATCH', `/api/admin/ideas/${idea.id}`, { estado: 'en_curso' }))[0], 200, 'mueve');
    assert.equal((await conToken('DELETE', `/api/admin/ideas/${idea.id}`))[0], 403, 'no borra');
  });

  test('el jardinero además puede mandar su informe', async () => {
    const esc = panel();
    const [, j] = await admin(esc, 'POST', '/api/admin/agentes', { nombre: 'jardinero', alcance: 'jardinero' });
    assert.equal(j.alcance, 'jardinero');
    const conToken = (metodo, ruta, cuerpo = null) => esc.llamar(metodo, ruta, { cuerpo, token: j.token });

    const [c, r] = await conToken('POST', '/api/admin/informe', {
      asunto: 'Planté una idea del vivero',
      cuerpo: 'Comprimí las respuestas de la API.\n\nLas pruebas pasan: 509.',
    });
    assert.equal(c, 202);
    assert.equal(r.enviado_a, 1, 'le llega a quien administra');
    const mail = esc.correo.enviados.at(-1);
    assert.equal(mail.tipo, 'informe');
    assert.equal(mail.para, DUENIO);
    assert.match(mail.texto, /Compriml?í las respuestas/);
    assert.match(mail.texto, /jardinero/, 'firma quién lo escribió');

    assert.equal((await conToken('GET', '/api/admin/ideas'))[0], 200, 'y sigue viendo el vivero');
    assert.equal((await conToken('GET', '/api/admin/cuentas'))[0], 403, 'pero no las cuentas');
    assert.equal((await admin(esc, 'POST', '/api/admin/informe', { cuerpo: 'corto' }))[0], 400);
  });

  test('un token de vivero no puede mandar informes', async () => {
    const esc = panel();
    const [, a] = await admin(esc, 'POST', '/api/admin/agentes', { nombre: 'agente-ux', alcance: 'vivero' });
    const [c] = await esc.llamar('POST', '/api/admin/informe', {
      token: a.token, cuerpo: 'algo bastante largo para pasar la validación',
    });
    assert.equal(c, 403);
  });

  test('se revoca y deja de servir', async () => {
    const esc = panel();
    const [, a] = await admin(esc, 'POST', '/api/admin/agentes', { nombre: 'agente-ux' });
    assert.equal((await esc.llamar('GET', '/api/admin/ideas', { token: a.token }))[0], 200);
    assert.equal((await admin(esc, 'DELETE', `/api/admin/agentes/${a.id}`))[0], 204);
    assert.equal((await esc.llamar('GET', '/api/admin/ideas', { token: a.token }))[0], 401, 'revocado no entra');
    assert.equal((await admin(esc, 'DELETE', `/api/admin/agentes/${a.id}`))[0], 404);
  });

  test('el token se muestra una sola vez', async () => {
    const esc = panel();
    const [, a] = await admin(esc, 'POST', '/api/admin/agentes', { nombre: 'agente-fw' });
    const [, lista] = await admin(esc, 'GET', '/api/admin/agentes');
    const guardado = lista.agentes.find((x) => x.id === a.id);
    assert.equal(guardado.nombre, 'agente-fw');
    assert.ok(!('token' in guardado) && !('token_hash' in guardado), 'el token no vuelve a salir');
    assert.equal((await admin(esc, 'POST', '/api/admin/agentes', { nombre: 'ab' }))[0], 400, 'y tiene que tener nombre');
  });
});
