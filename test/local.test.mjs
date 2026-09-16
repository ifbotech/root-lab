/* Local primero: el almacén del teléfono y la cola de cambios sin red. */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { crearAlmacen, backendMemoria } from '../public/lib/almacen.mjs';
import {
  encolable, agregar, quitar, siguiente, aplicarLocal, aplicarCola, MAXIMO, ENCOLABLES,
} from '../public/lib/cola.mjs';

describe('el almacén', () => {
  test('guarda, lee con fecha, borra y vacía por prefijo', async () => {
    const a = crearAlmacen(backendMemoria());
    assert.equal(a.tipo, 'memoria');
    assert.equal(await a.leer('nada'), null);
    assert.equal(await a.guardar('get:/api/estado', { nodes: [1] }, 1234), true);
    const g = await a.leer('get:/api/estado');
    assert.deepEqual(g, { t: 1234, valor: { nodes: [1] } });
    await a.guardar('get:/api/config', { v: 1 });
    await a.guardar('cola', []);
    assert.deepEqual((await a.claves('get:')).sort(), ['get:/api/config', 'get:/api/estado']);
    await a.vaciar('get:');
    assert.deepEqual(await a.claves('get:'), []);
    assert.deepEqual((await a.leer('cola')).valor, [], 'lo que no tenía el prefijo queda');
    await a.borrar('cola');
    assert.equal(await a.leer('cola'), null);
  });

  test('un respaldo roto no tira: leer da null y guardar da false', async () => {
    const roto = {
      tipo: 'roto',
      async leer() { throw new Error('cuota'); },
      async guardar() { throw new Error('cuota'); },
      async borrar() { throw new Error('cuota'); },
      async claves() { throw new Error('cuota'); },
    };
    const a = crearAlmacen(roto);
    assert.equal(await a.leer('x'), null);
    assert.equal(await a.guardar('x', 1), false);
    assert.equal(await a.borrar('x'), false);
    assert.deepEqual(await a.claves(), []);
    await a.vaciar();
  });
});

describe('la cola de cambios sin red', () => {
  test('sólo se encolan los pedidos que se pueden repetir sin daño', () => {
    assert.ok(encolable('PATCH', '/api/plantas/p1abc'));
    assert.ok(encolable('PATCH', '/api/cuenta'));
    assert.ok(encolable('POST', '/api/sitter/abcDEF123_-/riego'));
    assert.ok(encolable('POST', '/api/plantas/p1/fotos'));
    assert.equal(encolable('POST', '/api/plantas/p1/chat'), null, 'la charla necesita la respuesta');
    assert.equal(encolable('POST', '/api/identificar'), null);
    assert.equal(encolable('DELETE', '/api/plantas/p1'), null, 'desvincular sin red no');
    assert.equal(encolable('GET', '/api/estado'), null);
    assert.ok(ENCOLABLES.length >= 4);
  });

  test('dos cambios a la misma planta se funden; los demás se acumulan en orden', () => {
    let cola = agregar([], { metodo: 'PATCH', ruta: '/api/plantas/p1', cuerpo: { nombre: 'Rulo' } }, 1);
    cola = agregar(cola, { metodo: 'PATCH', ruta: '/api/plantas/p1', cuerpo: { brillo: 40 } }, 2);
    cola = agregar(cola, { metodo: 'PATCH', ruta: '/api/plantas/p1', cuerpo: { nombre: 'Rulito' } }, 3);
    cola = agregar(cola, { metodo: 'POST', ruta: '/api/sitter/tok_1/riego', cuerpo: {} }, 4);
    cola = agregar(cola, { metodo: 'POST', ruta: '/api/sitter/tok_1/riego', cuerpo: {} }, 5);
    assert.equal(cola.length, 3);
    assert.deepEqual(cola[0].cuerpo, { nombre: 'Rulito', brillo: 40 }, 'el último manda en cada campo');
    assert.equal(cola[0].t, 3);
    assert.equal(cola[1].metodo, 'POST');
    assert.equal(agregar(cola, { metodo: 'POST', ruta: '/api/identificar', cuerpo: {} }).length, 3, 'lo no encolable no entra');
    const s = siguiente(cola);
    assert.equal(s.ruta, '/api/plantas/p1');
    const resto = quitar(cola, s.id);
    assert.equal(resto.length, 2);
    assert.equal(siguiente(resto).metodo, 'POST');
    assert.equal(siguiente([]), null);
  });

  test('la cola tiene tope', () => {
    let cola = [];
    for (let i = 0; i < MAXIMO + 10; i++) cola = agregar(cola, { metodo: 'POST', ruta: `/api/plantas/p${i}/fotos`, cuerpo: {} }, i);
    assert.equal(cola.length, MAXIMO);
    assert.equal(cola[0].ruta, '/api/plantas/p10/fotos', 'se van los más viejos');
  });

  test('lo encolado se ve en la pantalla antes de que salga', () => {
    const estado = { cuenta: { nombre: 'Ana', paleta: 'vibrant' }, nodes: [{ id: 'p1', nombre: 'Rulo', brillo: 80 }, { id: 'p2', nombre: 'Mochi' }] };
    const e2 = aplicarLocal(estado, { metodo: 'PATCH', ruta: '/api/plantas/p1', cuerpo: { nombre: '  Rulito  ', brillo: 30 } });
    assert.equal(e2.nodes[0].nombre, 'Rulito');
    assert.equal(e2.nodes[0].brillo, 30);
    assert.equal(e2.nodes[1].nombre, 'Mochi');
    assert.equal(estado.nodes[0].nombre, 'Rulo', 'sin tocar el viejo');
    const e3 = aplicarLocal(estado, { metodo: 'PATCH', ruta: '/api/cuenta', cuerpo: { nombre: 'Rocío' } });
    assert.equal(e3.cuenta.nombre, 'Rocío');
    assert.equal(aplicarLocal(estado, { metodo: 'POST', ruta: '/api/sitter/x/riego', cuerpo: {} }), estado, 'lo que no cambia la pantalla, no la toca');
    assert.equal(aplicarLocal(null, {}), null);
    const cola = [
      { metodo: 'PATCH', ruta: '/api/plantas/p2', cuerpo: { nombre: 'Mochito' } },
      { metodo: 'PATCH', ruta: '/api/cuenta', cuerpo: { paleta: 'oled' } },
    ];
    const e4 = aplicarCola(estado, cola);
    assert.equal(e4.nodes[1].nombre, 'Mochito');
    assert.equal(e4.cuenta.paleta, 'oled');
  });
});
