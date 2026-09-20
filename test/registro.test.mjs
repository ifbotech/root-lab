/* Lo que el servidor deja escrito: útil para operar, inútil para espiar. */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { crearRegistro, patron } from '../server/registro.mjs';

const nuevo = (op = {}) => {
  const lineas = [];
  let t = 0;
  const r = crearRegistro({ escribir: (l) => lineas.push(l), reloj: () => t, ...op });
  return { r, lineas, avanzar: (ms) => { t += ms; } };
};

describe('la forma de una ruta', () => {
  test('borra todo lo que identifica a alguien', () => {
    assert.equal(patron('/api/plantas/pb36ad8a90534/historial?horas=48'), '/api/plantas/:id/historial');
    assert.equal(patron('/api/plantas/pb36ad8a90534'), '/api/plantas/:id');
    assert.equal(patron('/api/admin/aparatos/A1B2C3D4E5F6'), '/api/admin/aparatos/:id');
    assert.equal(patron('/api/sitter/9f8e7d6c5b4a3928'), '/api/sitter/:id');
    assert.equal(patron('/api/cuenta/restablecer/abc123def456'), '/api/cuenta/restablecer/:token');
    assert.equal(patron('/api/d/firmware/12'), '/api/d/firmware/:id');
  });

  test('lo que no es de nadie queda tal cual', () => {
    assert.equal(patron('/api/estado'), '/api/estado');
    assert.equal(patron('/api/d/sync'), '/api/d/sync');
    assert.equal(patron('/api/cuenta/entrar'), '/api/cuenta/entrar');
  });

  test('lo estático es una sola cosa', () => {
    assert.equal(patron('/style.css'), 'estático');
    assert.equal(patron('/caras/kip-comun-HAPPY.png'), 'estático');
    assert.equal(patron('/v/K7Q2M9XA'), 'estático', 'la app entra por acá, sin API');
  });

  test('aguanta cualquier cosa sin romperse', () => {
    assert.equal(patron(''), 'estático');
    assert.equal(patron(null), 'estático');
    assert.ok(patron(`/api/${'x'.repeat(500)}`).length <= 80, 'no escribe media pantalla');
  });
});

describe('qué se anota', () => {
  test('un pedido normal no ensucia el journal', () => {
    const { r, lineas } = nuevo();
    for (let i = 0; i < 50; i++) r.anotar({ metodo: 'POST', ruta: '/api/d/sync', codigo: 200, ms: 4 });
    assert.deepEqual(lineas, []);
  });

  test('los errores del servidor, siempre', () => {
    const { r, lineas } = nuevo();
    r.anotar({ metodo: 'GET', ruta: '/api/plantas/pabc123def456', codigo: 500, ms: 12 });
    assert.equal(lineas.length, 1);
    assert.match(lineas[0], /error 500 · GET \/api\/plantas\/:id · 12 ms/);
    assert.ok(!lineas[0].includes('pabc123def456'), 'el id no entra');
  });

  test('un freno se ve, porque alguien está golpeando la puerta', () => {
    const { r, lineas } = nuevo();
    r.anotar({ metodo: 'POST', ruta: '/api/cuenta/entrar', codigo: 429, ms: 2 });
    assert.match(lineas[0], /freno 429 · POST \/api\/cuenta\/entrar/);
  });

  test('lo que tarda de más, también', () => {
    const { r, lineas } = nuevo({ lento: 1000 });
    r.anotar({ metodo: 'GET', ruta: '/api/plantas/p1/historial', codigo: 200, ms: 2400 });
    r.anotar({ metodo: 'GET', ruta: '/api/estado', codigo: 200, ms: 999 });
    assert.equal(lineas.length, 1);
    assert.match(lineas[0], /lento 2400 ms/);
  });

  test('la IA tarda segundos por diseño: no es una alarma', () => {
    const { r, lineas } = nuevo({ lento: 1000, lentoIA: 20000 });
    r.anotar({ metodo: 'POST', ruta: '/api/plantas/p1/chat', codigo: 200, ms: 4200 });
    r.anotar({ metodo: 'POST', ruta: '/api/plantas/p1/diagnostico', codigo: 200, ms: 9000 });
    assert.deepEqual(lineas, [], 'cuatro y nueve segundos son normales hablando con Claude');
    r.anotar({ metodo: 'POST', ruta: '/api/plantas/p1/chat', codigo: 200, ms: 21000 });
    assert.match(lineas[0], /lento 21000 ms/, 'veintiuno ya no');
  });

  test('un 503 de la IA apagada no es una falla del servidor', () => {
    /* Con la IA apagada, las rutas de IA contestan 503 a propósito: llenar el
       journal de "error 503" esconde los errores de verdad. */
    const { r, lineas } = nuevo();
    r.anotar({ metodo: 'POST', ruta: '/api/plantas/p1/identificar', codigo: 503, ms: 1 });
    assert.deepEqual(lineas, []);
    r.anotar({ metodo: 'GET', ruta: '/api/estado', codigo: 503, ms: 1 });
    assert.match(lineas[0], /error 503 · GET \/api\/estado/, 'un 503 en otra ruta sí');
  });

  test('un 404 no merece su propia línea, pero se cuenta', () => {
    const { r, lineas } = nuevo();
    r.anotar({ metodo: 'GET', ruta: '/api/nada', codigo: 404, ms: 1 });
    assert.deepEqual(lineas, []);
    r.cerrar();
    assert.match(lineas[0], /4xx 1/);
  });
});

describe('el resumen', () => {
  test('sale cada tanto, con lo que hay que saber', () => {
    const { r, lineas, avanzar } = nuevo({ cada: 600000 });
    for (let i = 0; i < 100; i++) r.anotar({ metodo: 'GET', ruta: '/api/estado', codigo: 200, ms: i });
    r.anotar({ metodo: 'POST', ruta: '/api/plantas/p1/chat', codigo: 200, ms: 3000 });  /* la IA tarda y está bien */
    assert.deepEqual(lineas, [], 'todavía no pasaron los diez minutos');

    avanzar(600001);
    r.anotar({ metodo: 'GET', ruta: '/api/config', codigo: 200, ms: 1 });
    assert.equal(lineas.length, 1);
    assert.match(lineas[0], /102 pedidos en 600 s/);
    assert.match(lineas[0], /2xx 102/);
    assert.match(lineas[0], /mediana \d+ ms, p95 \d+ ms/);
    assert.match(lineas[0], /el más lento: POST \/api\/plantas\/:id\/chat 3000 ms/);
  });

  test('sin pedidos no dice nada', () => {
    const { r, lineas, avanzar } = nuevo({ cada: 1000 });
    avanzar(5000);
    r.cerrar();
    assert.deepEqual(lineas, []);
  });

  test('apagar el servidor no se lleva lo que iba contando', () => {
    const { r, lineas } = nuevo();
    r.anotar({ metodo: 'GET', ruta: '/api/estado', codigo: 200, ms: 5 });
    r.cerrar();
    assert.match(lineas[0], /1 pedidos/);
    r.cerrar();
    assert.equal(lineas.length, 1, 'y no lo repite');
  });

  test('el resumen empieza de cero cada vez', () => {
    const { r, lineas, avanzar } = nuevo({ cada: 1000 });
    r.anotar({ metodo: 'GET', ruta: '/api/estado', codigo: 200, ms: 5 });
    avanzar(1001);
    r.anotar({ metodo: 'GET', ruta: '/api/estado', codigo: 200, ms: 5 });
    avanzar(1001);
    r.anotar({ metodo: 'GET', ruta: '/api/estado', codigo: 200, ms: 5 });
    assert.equal(lineas.length, 2);
    assert.match(lineas[1], /^1 pedidos/, 'el segundo resumen no arrastra el primero');
  });
});
