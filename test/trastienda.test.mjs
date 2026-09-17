/* La trastienda: el panel de quien hace el producto.
 *
 * Lo que se prueba acá es que conteste lo que hay que saber (cuántos aparatos
 * en la calle, si están midiendo, qué se usa de la app), que el vivero de
 * ideas aguante a un agente que da vueltas para siempre, y —sobre todo— que
 * no se pueda entrar sin la clave.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

import { escenario, aparato, cuenta, H } from './ayudas.mjs';
import { huellaDeIdea, AREAS, ADMIN_SESION_MS } from '../server/api.mjs';
import { abrirBase, VERSION_ESQUEMA } from '../server/db.mjs';

const ADMIN = 'una-clave-de-administracion-bien-larga';
const DIA = 24 * H;
const trastienda = (op = {}) => escenario({ opciones: { adminClave: ADMIN, ...op } });
const admin = (esc, metodo, ruta, cuerpo = null, token = ADMIN) => esc.llamar(metodo, ruta, { cuerpo, token });

describe('la puerta', () => {
  test('sin la clave del servidor, la trastienda no existe', async () => {
    const esc = escenario();
    assert.equal((await esc.llamar('POST', '/api/admin/sesion', { cuerpo: { clave: 'lo que sea' } }))[0], 404);
    assert.equal((await esc.llamar('GET', '/api/admin/flota'))[0], 404);
  });

  test('se entra una vez con la clave y queda un token', async () => {
    const esc = trastienda();
    const [c, s] = await esc.llamar('POST', '/api/admin/sesion', { cuerpo: { clave: ADMIN } });
    assert.equal(c, 201);
    assert.match(s.token, /^[0-9a-f]{64}$/);
    assert.ok(s.vence > esc.reloj.t);
    assert.equal((await admin(esc, 'GET', '/api/admin/estado', null, s.token))[0], 200, 'el token abre');
    assert.notEqual(s.token, ADMIN, 'el token no es la clave maestra');
  });

  test('una clave equivocada no entra, y a la décima se corta', async () => {
    const esc = trastienda();
    let ultimo = 0;
    for (let i = 0; i < 11; i++) {
      [ultimo] = await esc.llamar('POST', '/api/admin/sesion', { cuerpo: { clave: `intento-${i}` } });
    }
    assert.equal(ultimo, 429, 'probar claves desde una IP se corta');
  });

  test('el token vence, y salir lo cierra antes', async () => {
    const esc = trastienda();
    const [, s] = await esc.llamar('POST', '/api/admin/sesion', { cuerpo: { clave: ADMIN } });
    esc.reloj.t += ADMIN_SESION_MS + 1000;
    assert.equal((await admin(esc, 'GET', '/api/admin/estado', null, s.token))[0], 401, 'a las doce horas se cierra sola');

    const [, s2] = await esc.llamar('POST', '/api/admin/sesion', { cuerpo: { clave: ADMIN } });
    assert.equal((await admin(esc, 'DELETE', '/api/admin/sesion', null, s2.token))[0], 204);
    assert.equal((await admin(esc, 'GET', '/api/admin/estado', null, s2.token))[0], 401, 'salir la cierra');
    assert.equal((await admin(esc, 'GET', '/api/admin/estado'))[0], 200, 'la clave maestra sigue valiendo');
  });
});

describe('la flota', () => {
  test('cuenta lo que hay en la calle y lo reparte por lote y versión', async () => {
    const esc = trastienda();
    const uno = aparato(esc, { id: 'AA0000000001', fw: '0.6.0' });
    const dos = aparato(esc, { id: 'AA0000000002', fw: '0.6.0' });
    const tres = aparato(esc, { id: 'AA0000000003', fw: '0.5.0' });
    await uno.sync({ lote: 'L1' });
    await dos.sync({ lote: 'L1' });
    await tres.sync({ lote: 'L2' });

    const t = await cuenta(esc);
    await esc.llamar('POST', '/api/vinculo', { token: t, cuerpo: { codigo: uno.codigo } });

    const [c, f] = await admin(esc, 'GET', '/api/admin/flota');
    assert.equal(c, 200);
    assert.equal(f.resumen.total, 3);
    assert.equal(f.resumen.vinculados, 1);
    assert.equal(f.resumen.estrenados, 1, 'estrenado: alguien lo vinculó alguna vez');
    assert.equal(f.resumen.activos, 3);
    assert.equal(f.resumen.callados, 0);

    const lotes = Object.fromEntries(f.por.lote.map((x) => [x.valor, x.total]));
    assert.deepEqual(lotes, { L1: 2, L2: 1 });
    const versiones = Object.fromEntries(f.por.fw.map((x) => [x.valor, x.total]));
    assert.deepEqual(versiones, { '0.6.0': 2, '0.5.0': 1 });
    assert.equal(f.aparatos.length, 3);
  });

  test('un aparato vinculado que se calla se ve como callado', async () => {
    const esc = trastienda();
    const a = aparato(esc, { id: 'BB0000000001' });
    await a.sync();
    const t = await cuenta(esc);
    await esc.llamar('POST', '/api/vinculo', { token: t, cuerpo: { codigo: a.codigo } });

    esc.reloj.t += 5 * DIA;
    const [, aLos5] = await admin(esc, 'GET', '/api/admin/flota');
    assert.equal(aLos5.resumen.callados, 1, 'a los tres días ya está callado');
    assert.equal(aLos5.resumen.activos, 1, 'pero habló esta semana: las dos ventanas se pisan a propósito');

    esc.reloj.t += 5 * DIA;
    const [, f] = await admin(esc, 'GET', '/api/admin/flota');
    assert.equal(f.resumen.callados, 1);
    assert.equal(f.resumen.activos, 0, 'a los diez días ya no habló ni esta semana');
    assert.equal(f.aparatos[0].callado, true);
  });

  test('no dice nada de la cuenta ni de la planta', async () => {
    const esc = trastienda();
    const a = aparato(esc, { id: 'CC0000000001' });
    await a.sync();
    const t = await cuenta(esc, { email: 'rocio@ejemplo.com' });
    const [, planta] = await esc.llamar('POST', '/api/vinculo', { token: t, cuerpo: { codigo: a.codigo } });
    await esc.llamar('PATCH', `/api/plantas/${planta.id}`, { token: t, cuerpo: { nombre: 'Monsterita' } });

    const [, f] = await admin(esc, 'GET', '/api/admin/flota');
    const texto = JSON.stringify(f);
    assert.ok(!texto.includes('rocio@ejemplo.com'), 'ningún email');
    assert.ok(!texto.includes('Monsterita'), 'ningún nombre de planta');
    assert.ok(!texto.includes(planta.id), 'ni el id de la planta');
    assert.equal(f.aparatos[0].vinculado, true, 'pero sí que está vinculado');
    assert.ok(!('token_hash' in f.aparatos[0]), 'ni el hash del token');
  });
});

describe('las lecturas', () => {
  test('dice cuántas llegan y qué sensores no contestan', async () => {
    const esc = trastienda();
    const a = aparato(esc, { id: 'DD0000000001' });
    await a.sync();
    const t = await cuenta(esc);
    await esc.llamar('POST', '/api/vinculo', { token: t, cuerpo: { codigo: a.codigo } });

    /* Diez lecturas: tres sin humedad del aire (un AHT20 que no responde) y
       dos con el capacitivo en el techo (el sensor desconectado). El aparato
       las mide y las manda como lo haría de verdad: el reloj tiene que
       avanzar, o el servidor las toma por repetidas. */
    for (let i = 0; i < 10; i++) {
      a.medir({
        suelo: 40, temp: 220, lux: 3000,
        hr: i < 3 ? null : 55,
        suelo_raw: i < 2 ? 4095 : 2000,
        animo: 'HAPPY', sev: 'OK',
      });
      a.pasar(900);
    }
    await a.sync();

    const [c, l] = await esc.llamar('GET', '/api/admin/lecturas', { token: ADMIN, query: { dias: 7 } });
    assert.equal(c, 200);
    assert.equal(l.total, 10);
    assert.equal(l.sensores.n, 10);
    assert.equal(l.sensores.sin_hr, 3, 'tres lecturas sin humedad del aire');
    assert.equal(l.sensores.sin_temp, 0);
    assert.equal(l.sensores.crudo_extremo, 2, 'dos con el capacitivo en el techo');
    assert.equal(l.esperadas_por_dia, 96, 'una cada quince minutos');
    assert.ok(l.por_dia.length >= 1);
  });

  test('sin lecturas contesta ceros, no nulos', async () => {
    const esc = trastienda();
    const [, l] = await admin(esc, 'GET', '/api/admin/lecturas');
    assert.equal(l.total, 0);
    assert.deepEqual(l.sensores, { n: 0, sin_suelo: 0, sin_temp: 0, sin_hr: 0, sin_lux: 0, crudo_extremo: 0, bateria_baja: 0 });
    assert.deepEqual(l.por_dia, []);
  });
});

describe('el vivero', () => {
  const idea = (extra = {}) => ({
    area: 'infraestructura', titulo: 'Mover los respaldos cifrados fuera del VPS',
    impacto: 'alto', esfuerzo: 'bajo', autor: 'agente-infra', ...extra,
  });

  test('un agente propone y queda anotada', async () => {
    const esc = trastienda();
    const [c, r] = await admin(esc, 'POST', '/api/admin/ideas', idea({ detalle: 'la copia queda en el mismo disco', evidencia: 'docs/operacion.md' }));
    assert.equal(c, 201);
    assert.equal(r.repetida, false);
    assert.equal(r.idea.estado, 'nueva');
    assert.equal(r.idea.area, 'infraestructura');
    assert.equal(r.idea.autor, 'agente-infra');
    assert.equal(r.idea.vista, 1);
  });

  test('el mismo agente dando vueltas no llena la lista de repetidas', async () => {
    /* Es LA prueba del vivero: un agente que mira el proyecto para siempre va
       a volver a encontrar lo mismo, con otras palabras. */
    const esc = trastienda();
    const [, primera] = await admin(esc, 'POST', '/api/admin/ideas', idea());
    const variantes = [
      'mover los respaldos cifrados fuera del VPS',
      'Mover, los respaldos cifrados, fuera del VPS!',
      'Fuera del VPS mover los respaldos cifrados',
    ];
    for (const titulo of variantes) {
      const [c, r] = await admin(esc, 'POST', '/api/admin/ideas', idea({ titulo }));
      assert.equal(c, 200, titulo);
      assert.equal(r.repetida, true, titulo);
      assert.equal(r.id, primera.idea.id);
    }
    const [, lista] = await admin(esc, 'GET', '/api/admin/ideas');
    assert.equal(lista.ideas.length, 1, 'una sola idea');
    assert.equal(lista.ideas[0].vista, 4, 'pero contada cuatro veces: eso es señal');
  });

  test('si dos ideas distintas caen en la misma huella, no se pierde ninguna', async () => {
    /* Ordenar las palabras hace que dos títulos con las mismas palabras caigan
       juntos. El precio se paga guardando lo que trae la segunda. */
    const esc = trastienda();
    await admin(esc, 'POST', '/api/admin/ideas', idea({ titulo: 'Mostrar el agua antes de la luz', detalle: 'la primera' }));
    const [c, r] = await admin(esc, 'POST', '/api/admin/ideas', idea({ titulo: 'Mostrar la luz antes del agua', detalle: 'la segunda' }));
    assert.equal(c, 200, 'cae en la misma huella');
    const guardada = (await admin(esc, 'GET', '/api/admin/ideas'))[1].ideas.find((x) => x.id === r.id);
    assert.match(guardada.detalle, /la primera/);
    assert.match(guardada.detalle, /la segunda/, 'lo que traía la segunda quedó');
    assert.match(guardada.detalle, /Mostrar la luz antes del agua/, 'y su título también');
  });

  test('la misma idea en otra área es otra idea', async () => {
    const esc = trastienda();
    await admin(esc, 'POST', '/api/admin/ideas', idea());
    const [c] = await admin(esc, 'POST', '/api/admin/ideas', idea({ area: 'seguridad' }));
    assert.equal(c, 201);
    assert.equal((await admin(esc, 'GET', '/api/admin/ideas'))[1].ideas.length, 2);
  });

  test('valida lo que le mandan', async () => {
    const esc = trastienda();
    assert.equal((await admin(esc, 'POST', '/api/admin/ideas', idea({ area: 'magia' })))[0], 400);
    assert.equal((await admin(esc, 'POST', '/api/admin/ideas', idea({ titulo: 'corto' })))[0], 400);
    const [, r] = await admin(esc, 'POST', '/api/admin/ideas', idea({ impacto: 'gigante', esfuerzo: 'x' }));
    assert.equal(r.idea.impacto, 'medio', 'lo que no entiende queda en medio');
    assert.equal(r.idea.esfuerzo, 'medio');
  });

  test('se ordena por lo que más conviene mirar', async () => {
    const esc = trastienda();
    await admin(esc, 'POST', '/api/admin/ideas', idea({ titulo: 'Reescribir el servidor en otro lenguaje', impacto: 'bajo', esfuerzo: 'alto' }));
    await admin(esc, 'POST', '/api/admin/ideas', idea({ titulo: 'Partir la base en dos servidores', impacto: 'alto', esfuerzo: 'alto' }));
    await admin(esc, 'POST', '/api/admin/ideas', idea({ titulo: 'Comprimir las respuestas de la API', impacto: 'alto', esfuerzo: 'bajo' }));
    const [, lista] = await admin(esc, 'GET', '/api/admin/ideas');
    assert.deepEqual(lista.ideas.map((i) => `${i.impacto}/${i.esfuerzo}`), ['alto/bajo', 'alto/alto', 'bajo/alto'],
      'lo que rinde más por lo que cuesta, primero');
  });

  test('se mueve de estado y se puede filtrar', async () => {
    const esc = trastienda();
    const [, a] = await admin(esc, 'POST', '/api/admin/ideas', idea());
    const [, b] = await admin(esc, 'POST', '/api/admin/ideas', idea({ area: 'experiencia', titulo: 'Decir en el alta cuánto falta' }));

    const [c, movida] = await admin(esc, 'PATCH', `/api/admin/ideas/${a.idea.id}`, { estado: 'plantada', motivo: 'se hizo el martes' });
    assert.equal(c, 200);
    assert.equal(movida.estado, 'plantada');
    assert.ok(movida.cerrada, 'queda anotado cuándo se cerró');
    assert.equal(movida.motivo, 'se hizo el martes');

    assert.equal((await esc.llamar('GET', '/api/admin/ideas', { token: ADMIN, query: { estado: 'nueva' } }))[1].ideas.length, 1);
    assert.equal((await esc.llamar('GET', '/api/admin/ideas', { token: ADMIN, query: { area: 'experiencia' } }))[1].ideas[0].id, b.idea.id);
    assert.equal((await admin(esc, 'PATCH', `/api/admin/ideas/${a.idea.id}`, { estado: 'inventado' }))[0], 400);
    assert.equal((await admin(esc, 'PATCH', '/api/admin/ideas/99999', { estado: 'plantada' }))[0], 404);

    assert.equal((await admin(esc, 'DELETE', `/api/admin/ideas/${b.idea.id}`))[0], 204);
    assert.equal((await admin(esc, 'DELETE', `/api/admin/ideas/${b.idea.id}`))[0], 404);
  });

  test('el resumen dice cuántas hay de cada cosa', async () => {
    const esc = trastienda();
    await admin(esc, 'POST', '/api/admin/ideas', idea());
    await admin(esc, 'POST', '/api/admin/ideas', idea({ area: 'firmware', titulo: 'Medir el consumo real en deep sleep' }));
    const [, r] = await admin(esc, 'GET', '/api/admin/ideas');
    assert.deepEqual(r.areas, AREAS);
    assert.equal(r.resumen.por_area.reduce((n, a) => n + a.n, 0), 2);
    assert.equal(r.resumen.por_estado.find((e) => e.estado === 'nueva').n, 2);
  });

  test('sin la clave, el vivero no se lee ni se escribe', async () => {
    const esc = trastienda();
    assert.equal((await esc.llamar('GET', '/api/admin/ideas'))[0], 401);
    assert.equal((await esc.llamar('POST', '/api/admin/ideas', { cuerpo: idea() }))[0], 401);
  });
});

describe('la huella de una idea', () => {
  test('dos formas de decir lo mismo son la misma huella', () => {
    const a = huellaDeIdea('infraestructura', 'Mover los respaldos cifrados fuera del VPS');
    assert.equal(a, huellaDeIdea('infraestructura', 'mover, los respaldos cifrados fuera del VPS!'));
    assert.equal(a, huellaDeIdea('infraestructura', 'Fuera del VPS: mover los respaldos cifrados'));
    assert.equal(a, huellaDeIdea('infraestructura', 'Mover  los  respáldos  cifrados  fuera  del  VPS'));
  });

  test('dos ideas distintas no se confunden', () => {
    const a = huellaDeIdea('infraestructura', 'Mover los respaldos cifrados fuera del VPS');
    assert.notEqual(a, huellaDeIdea('infraestructura', 'Borrar los respaldos viejos del VPS'));
    assert.notEqual(a, huellaDeIdea('seguridad', 'Mover los respaldos cifrados fuera del VPS'));
  });

  test('aguanta cualquier cosa', () => {
    assert.equal(typeof huellaDeIdea('producto', ''), 'string');
    assert.ok(huellaDeIdea('producto', 'x'.repeat(500)).length <= 160);
    assert.equal(typeof huellaDeIdea('producto', null), 'string');
  });
});

describe('la base', () => {
  test('una base de la versión anterior se migra sin perder nada', () => {
    const db = abrirBase();
    assert.equal(db.version(), VERSION_ESQUEMA);
    /* Simular una base v7: la tabla existe pero la versión dice 7. */
    db.metaEscribir('esquema', '7');
    assert.equal(db.version(), 7);
    const otra = abrirBase();
    assert.equal(otra.version(), VERSION_ESQUEMA, 'abrir una v7 la deja en 8');
  });

  test('una idea sobrevive a reabrir la base', () => {
    const db = abrirBase();
    const t = Date.now();
    const r = db.ideaProponer({ area: 'producto', titulo: 'Algo', impacto: 'alto', esfuerzo: 'bajo', huella: `h-${randomBytes(3).toString('hex')}`, t });
    const leida = db.idea(r.id);
    assert.equal(leida.titulo, 'Algo');
    assert.equal(leida.estado, 'nueva');
    assert.equal(leida.vista, 1);
  });
});
