/* Recuperar la contraseña, verificar el email y la paleta de la cuenta. */
import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { RESTABLECER_VENCE_MS } from '../server/api.mjs';
import { escenario, cuenta, conRooti, aparato } from './ayudas.mjs';

const enlaceDe = (m, tipo) => {
  const r = m.texto.match(new RegExp(`https://rootlab\\.test/#${tipo}/([A-Za-z0-9_-]+)`));
  assert.ok(r, `el email trae el enlace de ${tipo}`);
  return r[1];
};

describe('olvidé mi contraseña', () => {
  let esc;
  beforeEach(() => { esc = escenario(); });
  const olvide = (email, ip) => esc.llamar('POST', '/api/cuenta/olvide', { cuerpo: { email }, ip });
  const entrar = (email, clave) => esc.llamar('POST', '/api/cuenta/entrar', { cuerpo: { email, clave } });

  test('la respuesta es la misma exista o no la cuenta, y sólo sale un email si existe', async () => {
    await cuenta(esc, { email: 'ana@ejemplo.com' });
    await esc.correo.esperar();
    const antes = esc.correo.enviados.length;
    const [c1, r1] = await olvide('ANA@ejemplo.com');
    const [c2, r2] = await olvide('nadie@ejemplo.com');
    await esc.correo.esperar();
    assert.equal(c1, 202);
    assert.deepEqual([c1, r1], [c2, r2], 'no se puede averiguar quién tiene cuenta');
    const nuevos = esc.correo.enviados.slice(antes);
    assert.equal(nuevos.length, 1);
    assert.equal(nuevos[0].para, 'ana@ejemplo.com');
    assert.equal(nuevos[0].tipo, 'restablecer');
  });

  test('el enlace restablece, cierra todas las sesiones y abre una nueva', async () => {
    const vieja = await cuenta(esc, { email: 'beto@ejemplo.com', clave: 'la clave vieja' });
    await olvide('beto@ejemplo.com');
    await esc.correo.esperar();
    const token = enlaceDe(esc.correo.enviados.at(-1), 'clave');

    assert.deepEqual((await esc.llamar('GET', '/api/cuenta/restablecer', { query: { token } }))[1], { valido: true });
    const [corta] = await esc.llamar('POST', '/api/cuenta/restablecer', { cuerpo: { token, clave: 'corta' } });
    assert.equal(corta, 400);
    assert.deepEqual((await esc.llamar('GET', '/api/cuenta/restablecer', { query: { token } }))[1], { valido: true },
      'una contraseña corta no gasta el enlace');

    const [c, r] = await esc.llamar('POST', '/api/cuenta/restablecer', { cuerpo: { token, clave: 'la clave nueva' } });
    assert.equal(c, 200);
    assert.ok(r.token);
    assert.equal(r.cuenta.email_verificado, true, 'usar el enlace prueba que el email es suyo');
    assert.equal((await esc.llamar('GET', '/api/estado', { token: vieja }))[0], 401, 'la sesión vieja se cerró');
    assert.equal((await esc.llamar('GET', '/api/estado', { token: r.token }))[0], 200);
    assert.equal((await entrar('beto@ejemplo.com', 'la clave vieja'))[0], 401);
    assert.equal((await entrar('beto@ejemplo.com', 'la clave nueva'))[0], 200);

    const [otraVez, err] = await esc.llamar('POST', '/api/cuenta/restablecer', { cuerpo: { token, clave: 'otra clave más' } });
    assert.equal(otraVez, 400, 'el enlace sirve una vez');
    assert.match(err.error, /venció o ya se usó/);
    await esc.correo.esperar();
    assert.equal(esc.correo.enviados.at(-1).tipo, 'clave-cambiada', 'y avisa por email del cambio');
  });

  test('el enlace vence a los 30 minutos', async () => {
    await cuenta(esc, { email: 'caro@ejemplo.com' });
    await olvide('caro@ejemplo.com');
    await esc.correo.esperar();
    const token = enlaceDe(esc.correo.enviados.at(-1), 'clave');
    esc.reloj.t += RESTABLECER_VENCE_MS + 1000;
    assert.equal((await esc.llamar('POST', '/api/cuenta/restablecer', { cuerpo: { token, clave: 'una clave nueva' } }))[0], 400);
  });

  test('pedir otro enlace anula el anterior', async () => {
    await cuenta(esc, { email: 'dani@ejemplo.com' });
    await olvide('dani@ejemplo.com');
    await esc.correo.esperar();
    const primero = enlaceDe(esc.correo.enviados.at(-1), 'clave');
    await olvide('dani@ejemplo.com');
    await esc.correo.esperar();
    const segundo = enlaceDe(esc.correo.enviados.at(-1), 'clave');
    assert.equal((await esc.llamar('POST', '/api/cuenta/restablecer', { cuerpo: { token: primero, clave: 'una clave nueva' } }))[0], 400);
    assert.equal((await esc.llamar('POST', '/api/cuenta/restablecer', { cuerpo: { token: segundo, clave: 'una clave nueva' } }))[0], 200);
  });

  test('pedir enlaces tiene límite por email y por IP', async () => {
    await cuenta(esc, { email: 'eli@ejemplo.com' });
    let ultimo;
    for (let i = 0; i < 4; i++) [ultimo] = await olvide('eli@ejemplo.com', `10.1.1.${i}`);
    assert.equal(ultimo, 429);
    for (let i = 0; i < 11; i++) [ultimo] = await olvide(`x${i}@ejemplo.com`, '10.9.9.9');
    assert.equal(ultimo, 429);
  });

  test('un token inventado no sirve', async () => {
    assert.deepEqual((await esc.llamar('GET', '/api/cuenta/restablecer', { query: { token: 'inventado' } }))[1], { valido: false });
    assert.equal((await esc.llamar('POST', '/api/cuenta/restablecer', { cuerpo: { token: 'inventado', clave: 'una clave nueva' } }))[0], 400);
  });
});

describe('verificar el email', () => {
  test('al registrarse llega el enlace; usarlo verifica; reenviar tiene límite', async () => {
    const esc = escenario();
    const token = await cuenta(esc, { email: 'fede@ejemplo.com', nombre: 'Fede' });
    await esc.correo.esperar();
    const m = esc.correo.enviados.find((x) => x.tipo === 'verificar');
    assert.equal(m.para, 'fede@ejemplo.com');
    assert.match(m.texto, /Hola, Fede\./);
    let [, yo] = await esc.llamar('GET', '/api/cuenta', { token });
    assert.equal(yo.email_verificado, false);

    const t = enlaceDe(m, 'verificar');
    assert.equal((await esc.llamar('POST', '/api/cuenta/verificar', { cuerpo: { token: t } }))[0], 200);
    assert.equal((await esc.llamar('POST', '/api/cuenta/verificar', { cuerpo: { token: t } }))[0], 400, 'una sola vez');
    [, yo] = await esc.llamar('GET', '/api/cuenta', { token });
    assert.equal(yo.email_verificado, true);
    const [, ya] = await esc.llamar('POST', '/api/cuenta/verificar/reenviar', { token });
    assert.equal(ya.verificado, true);

    const otro = await cuenta(esc, { email: 'gabi@ejemplo.com' });
    let ultimo;
    for (let i = 0; i < 4; i++) [ultimo] = await esc.llamar('POST', '/api/cuenta/verificar/reenviar', { token: otro });
    assert.equal(ultimo, 429);
  });

  test('cambiar la contraseña manda un aviso por email', async () => {
    const esc = escenario();
    const token = await cuenta(esc, { email: 'hugo@ejemplo.com', clave: 'una clave segura' });
    await esc.llamar('POST', '/api/cuenta/clave', { token, cuerpo: { actual: 'una clave segura', nueva: 'otra clave segura' } });
    await esc.correo.esperar();
    assert.equal(esc.correo.enviados.at(-1).tipo, 'clave-cambiada');
  });
});

describe('paleta', () => {
  test('arranca en la paleta ROOTLAB y cada piel se desbloquea abriendo su cofre', async () => {
    const esc = escenario();
    const token = await cuenta(esc);
    let [, yo] = await esc.llamar('GET', '/api/cuenta', { token });
    assert.equal(yo.paleta, 'rootlab');
    const [c, r] = await esc.llamar('PATCH', '/api/cuenta', { token, cuerpo: { paleta: 'blink-comun' } });
    assert.equal(c, 403);
    assert.match(r.error, /Blink/);
    assert.equal((await esc.llamar('PATCH', '/api/cuenta', { token, cuerpo: { paleta: 'inventada' } }))[0], 400);

    const { cofre } = await conRooti(esc, { persona: 'blink', token });
    assert.equal(cofre.id, 'blink');
    assert.equal(cofre.paleta, 'blink-comun');
    assert.equal(cofre.pinta, true, 'abrir el cofre pinta la app');
    [, yo] = await esc.llamar('GET', '/api/cuenta', { token });
    assert.equal(yo.paleta, 'blink-comun', 'y queda en la cuenta, para todos sus teléfonos');

    assert.equal((await esc.llamar('PATCH', '/api/cuenta', { token, cuerpo: { paleta: 'vibrant' } }))[1].paleta, 'vibrant');
    assert.equal((await esc.llamar('PATCH', '/api/cuenta', { token, cuerpo: { paleta: 'blink-comun' } }))[1].paleta, 'blink-comun');
    assert.equal((await esc.llamar('PATCH', '/api/cuenta', { token, cuerpo: { paleta: 'blink-epico' } }))[0], 403, 'la épica no salió');
  });

  test('cada cofre nuevo pinta con su piel; reabrir uno ya abierto no', async () => {
    const esc = escenario();
    const token = await cuenta(esc);
    await conRooti(esc, { persona: 'nori', token });
    const { cofre, planta } = await conRooti(esc, { persona: 'kip', token });
    assert.equal(cofre.pinta, true);
    let [, yo] = await esc.llamar('GET', '/api/cuenta', { token });
    assert.equal(yo.paleta, 'kip-comun');
    await esc.llamar('PATCH', '/api/cuenta', { token, cuerpo: { paleta: 'nori-comun' } });
    const [, otraVez] = await esc.llamar('POST', `/api/plantas/${planta.id}/cofre`, { token });
    assert.equal(otraVez.pinta, false);
    [, yo] = await esc.llamar('GET', '/api/cuenta', { token });
    assert.equal(yo.paleta, 'nori-comun', 'lo que eligió la persona se respeta');
  });

  test('la colección dice qué paleta pinta cada piel y cuánto sale', async () => {
    const esc = escenario();
    const { token } = await conRooti(esc, { persona: 'plum' });
    const [, col] = await esc.llamar('GET', '/api/coleccion', { token });
    const plum = col.catalogo.find((m) => m.id === 'plum');
    assert.equal(plum.pieles.find((p) => p.rareza === 'raro').paleta, 'plum-raro');
    assert.equal(plum.tengo, true);
    assert.equal(col.catalogo.find((m) => m.id === 'kip').tengo, false);
    assert.equal(col.total, 12, 'cuatro Rooties por tres pieles');
    assert.deepEqual(col.probabilidades, { comun: 700, raro: 250, epico: 50 });
    aparato(esc);
  });
});
