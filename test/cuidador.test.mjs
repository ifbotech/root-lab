/* El cuidador: el enlace /sitter/<token>, lo que ve, el "ya regué" y el push
 * al dueño; y que nada de la cuenta se filtre por ahí.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { escenario, conRooti, aparato, cuenta, H } from './ayudas.mjs';
import { tareasDelDia, GRACIA_MS } from '../public/lib/tareas.mjs';
import { CUIDADOR_DIAS } from '../server/api.mjs';

const DIA = 24 * H;

async function conSed(esc) {
  const r = await conRooti(esc);
  await esc.llamar('PATCH', `/api/plantas/${r.planta.id}`, { token: r.token, cuerpo: { especie: 'monstera' } });
  r.maceta.medir({ suelo: 15, temp: 230, hr: 55, lux: 3000, animo: 'THIRSTY', sev: 'URGENT' });
  await r.maceta.sync();
  return r;
}

describe('el cuidador', () => {
  test('el dueño crea el enlace; quien lo abre ve la planta y nada de la cuenta', async () => {
    const esc = escenario();
    const { token, planta } = await conSed(esc);
    let [c, r] = await esc.llamar('POST', `/api/plantas/${planta.id}/cuidador`, { token, cuerpo: { dias: 7, nombre: 'Ana' } });
    assert.equal(c, 201);
    assert.match(r.url, /^https:\/\/rootlab\.test\/sitter\/[A-Za-z0-9_-]{20,}$/);
    assert.equal(r.dias, 7);
    assert.equal(r.vence, esc.reloj.t + 7 * DIA);
    const enlace = r.url.split('/sitter/')[1];

    [c, r] = await esc.llamar('GET', `/api/sitter/${enlace}`);
    assert.equal(c, 200, 'sin sesión');
    assert.equal(r.planta.nombre, 'Rulo');
    assert.equal(r.planta.id, 'cuidada', 'el id real no viaja');
    assert.equal(r.planta.mood, 'THIRSTY');
    assert.equal(r.planta.tel.soil_pct, 15);
    assert.equal(r.planta.especie_info.nombre, 'Monstera deliciosa');
    assert.ok(r.planta.ficha.cuidados.riego.length > 10);
    assert.equal(r.dueno, 'Persona');
    assert.equal(r.cuidador, 'Ana');
    const crudo = JSON.stringify(r);
    assert.doesNotMatch(crudo, /@ejemplo\.com/, 'ni el email');
    assert.doesNotMatch(crudo, new RegExp(planta.id), 'ni el id de la planta');
    assert.equal(r.planta.nodo, undefined, 'ni el aparato');
    assert.equal(r.planta.bond.dias_sanos, 0);
    assert.deepEqual(r.riegos, []);

    /* Con el nodo del cuidador, las tareas salen igual que para el dueño. */
    const tareas = tareasDelDia([r.planta], [r.planta.especie_info], {}, esc.reloj.t);
    assert.equal(tareas[0].tipo, 'regar');
  });

  test('"ya regué" queda anotado, esconde la tarea y le avisa al dueño', async () => {
    const esc = escenario();
    const { token, planta } = await conSed(esc);
    await esc.llamar('POST', '/api/push/suscripcion', {
      token, cuerpo: { suscripcion: { endpoint: 'https://fcm.googleapis.com/fcm/send/dueno', keys: { p256dh: 'k', auth: 'a' } } },
    });
    const [, creado] = await esc.llamar('POST', `/api/plantas/${planta.id}/cuidador`, { token, cuerpo: { dias: 3, nombre: 'Ana' } });
    const enlace = creado.url.split('/sitter/')[1];
    const antes = esc.push.enviados.length;

    let [c, r] = await esc.llamar('POST', `/api/sitter/${enlace}/riego`, { cuerpo: {} });
    assert.equal(c, 201);
    assert.equal(r.t, esc.reloj.t);
    assert.equal(esc.push.enviados.length, antes + 1);
    const a = esc.push.enviados.at(-1);
    assert.equal(a.titulo, 'Ana regó a Rulo');
    assert.equal(a.url, `#planta/${planta.id}`);
    assert.equal(a.icono, 'caras/brote-comun-HAPPY.png');

    /* El dueño lo ve en su planta y la tarea de regar se esconde un rato. */
    [c, r] = await esc.llamar('GET', `/api/plantas/${planta.id}`, { token });
    assert.deepEqual(r.riego, { t: esc.reloj.t, origen: 'cuidador', quien: 'Ana' });
    const [, especies] = await esc.llamar('GET', '/api/especies');
    assert.equal(tareasDelDia([r], especies, {}, esc.reloj.t).some((t) => t.tipo === 'regar'), false, 'recién regada');
    assert.equal(tareasDelDia([r], especies, {}, esc.reloj.t + GRACIA_MS + 1).some((t) => t.tipo === 'regar'), true, 'si sigue seca, vuelve');

    /* El cuidador también lo ve, y la lista del dueño. */
    [, r] = await esc.llamar('GET', `/api/sitter/${enlace}`);
    assert.equal(r.riegos.length, 1);
    assert.equal(r.riegos[0].quien, 'Ana');
    assert.equal(r.planta.riego.quien, 'Ana');
    [, r] = await esc.llamar('GET', `/api/plantas/${planta.id}/cuidador`, { token });
    assert.equal(r.enlaces.length, 1);
    assert.equal(r.enlaces[0].usos, 1);
    assert.equal(r.enlaces[0].nombre, 'Ana');
    assert.equal(r.riegos.length, 1);

    /* Sin nombre en el enlace, el que riega puede decir el suyo. */
    const [, otro] = await esc.llamar('POST', `/api/plantas/${planta.id}/cuidador`, { token, cuerpo: { dias: 3 } });
    await esc.llamar('POST', `/api/sitter/${otro.url.split('/sitter/')[1]}/riego`, { cuerpo: { quien: 'Beto' } });
    assert.equal(esc.push.enviados.at(-1).titulo, 'Beto regó a Rulo');
    await esc.llamar('POST', `/api/sitter/${otro.url.split('/sitter/')[1]}/riego`, { cuerpo: {} });
    assert.equal(esc.push.enviados.at(-1).titulo, 'Tu cuidador regó a Rulo');
  });

  test('vence, se revoca y no acepta cualquier cosa', async () => {
    const esc = escenario();
    const { token, planta } = await conSed(esc);
    let [c, r] = await esc.llamar('POST', `/api/plantas/${planta.id}/cuidador`, { token, cuerpo: { dias: 5 } });
    assert.equal(c, 400, 'sólo 3, 7 o 15 días');
    assert.deepEqual(CUIDADOR_DIAS, [3, 7, 15]);
    [c, r] = await esc.llamar('POST', `/api/plantas/${planta.id}/cuidador`, { token, cuerpo: { dias: 15 } });
    const enlace = r.url.split('/sitter/')[1];
    esc.reloj.t += 15 * DIA + 1;
    [c] = await esc.llamar('GET', `/api/sitter/${enlace}`);
    assert.equal(c, 404, 'vencido');
    [c] = await esc.llamar('POST', `/api/sitter/${enlace}/riego`, { cuerpo: {} });
    assert.equal(c, 404);

    [, r] = await esc.llamar('POST', `/api/plantas/${planta.id}/cuidador`, { token, cuerpo: { dias: 3 } });
    const nuevo = r.url.split('/sitter/')[1];
    [c] = await esc.llamar('GET', `/api/sitter/${nuevo}`);
    assert.equal(c, 200);
    [c] = await esc.llamar('DELETE', `/api/plantas/${planta.id}/cuidador`, { token });
    assert.equal(c, 204);
    [c] = await esc.llamar('GET', `/api/sitter/${nuevo}`);
    assert.equal(c, 404, 'revocado');
    [c] = await esc.llamar('GET', '/api/sitter/nadaquever1234567890');
    assert.equal(c, 404);
    [c] = await esc.llamar('GET', '/api/sitter/x');
    assert.equal(c, 404, 'ni siquiera tiene forma de token');

    /* Otra cuenta no puede crear enlaces de esta planta. */
    const ajena = await conRooti(esc);
    [c] = await esc.llamar('POST', `/api/plantas/${planta.id}/cuidador`, { token: ajena.token, cuerpo: { dias: 3 } });
    assert.equal(c, 404);
  });

  test('con el cofre cerrado no hay cuidador, y desvincular borra los enlaces', async () => {
    const esc = escenario();
    /* Una planta recién vinculada, sin abrir el cofre. */
    const maceta = aparato(esc, { id: 'C0FFEE00DEAD' });
    const token = await cuenta(esc);
    await maceta.sync();
    const [cv, dormida] = await esc.llamar('POST', '/api/vinculo', { token, cuerpo: { codigo: maceta.codigo } });
    assert.equal(cv, 201);
    let [c] = await esc.llamar('POST', `/api/plantas/${dormida.id}/cuidador`, { token, cuerpo: { dias: 7 } });
    assert.equal(c, 409, 'primero el cofre');

    const { token: t2, planta } = await conSed(esc);
    const [, creado] = await esc.llamar('POST', `/api/plantas/${planta.id}/cuidador`, { token: t2, cuerpo: { dias: 7 } });
    const enlace = creado.url.split('/sitter/')[1];
    await esc.llamar('DELETE', `/api/plantas/${planta.id}`, { token: t2 });
    [c] = await esc.llamar('GET', `/api/sitter/${enlace}`);
    assert.equal(c, 404, 'desvinculada: el enlace muere con ella');
  });
});
