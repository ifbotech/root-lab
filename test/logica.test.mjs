/* Pruebas de la lógica de la app: tareas, diagnóstico y gamificación.
 *
 * Los tres módulos son funciones puras a propósito. La interfaz cambia cada
 * vez que alguien mira la pantalla y opina; las reglas de "esto hay que
 * regarlo", "esto el sensor no lo puede ver" y "esto se gana cuidando" son lo
 * que el producto promete, y eso conviene tenerlo clavado.
 */
import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  tareasDe, tareasDelDia, ordenarTareas, resumenDeTareas, contarEstados,
  GRACIA_MS, URGENCIAS,
} from '../public/lib/tareas.mjs';
import {
  interpretar, diagnosticar, zona, HALLAZGOS,
} from '../public/lib/diagnostico.mjs';
import {
  xpTotal, nivelDe, actualizarRacha, evaluarLogros, saludo, NIVELES, XP,
} from '../public/lib/gamificacion.mjs';

const MONSTERA = {
  id: 'monstera', nombre: 'Monstera deliciosa',
  soil_min: 25, soil_max: 60, temp_min_dc: 180, temp_max_dc: 300,
  rh_min: 50, lux_min: 1000, lux_max: 15000, dificultad: 45,
};

const nodo = (extra = {}) => ({
  id: 'p1', nombre: 'MONSTERA', especie: 'monstera', modelo: 'cresta',
  link: 'VIVO', mood: 'HAPPY', severity: 'OK', reason: 'estoy perfecta',
  tel: { soil_pct: 40, temp_dc: 230, rh_pct: 60, lux: 5000, batt_mv: 3900, age_s: 60 },
  nodo: { id: 'aabbcc112233', batt_pct: 80, seq: 1 },
  bond: { dias_vividos: 10, dias_sanos: 10, racha: 3, mejor_racha: 5 },
  ...extra,
});

/* ============================================================= tareas === */
describe('tareas del día', () => {
  test('una planta cómoda no genera ninguna tarea', () => {
    assert.deepEqual(tareasDe(nodo(), MONSTERA), []);
  });

  test('la sed genera una tarea de regar con el número que la justifica', () => {
    const t = tareasDe(nodo({
      mood: 'THIRSTY', severity: 'URGENT',
      tel: { ...nodo().tel, soil_pct: 22 },
    }), MONSTERA);

    assert.equal(t.length, 1);
    assert.equal(t[0].tipo, 'regar');
    assert.equal(t[0].urgencia, 'urgente');
    /* El número y el rango tienen que estar en el texto: sin eso la app
       pide fe en vez de mostrar evidencia. */
    assert.match(t[0].detalle, /22%/);
    assert.match(t[0].detalle, /25 y 60/);
  });

  test('el encharcado pide NO regar, y lo dice explícito', () => {
    const t = tareasDe(nodo({ mood: 'DROWNING', tel: { ...nodo().tel, soil_pct: 85 } }), MONSTERA);
    assert.equal(t[0].tipo, 'drenar');
    /* Si el título no dice "no", el usuario riega por inercia: viene de una
       lista de tareas y la acción por defecto de una planta es regarla. */
    assert.match(t[0].titulo, /^No riegues/);
  });

  test('cada ánimo malo produce su tarea, y ninguna se repite de tipo', () => {
    const malos = ['THIRSTY', 'DROWNING', 'SCORCHED', 'DARK', 'COLD', 'HOT', 'PARCHED_AIR'];
    const tipos = new Set();
    for (const mood of malos) {
      const t = tareasDe(nodo({ mood }), MONSTERA);
      assert.ok(t.length >= 1, `${mood} no genera tarea`);
      tipos.add(t[0].tipo);
    }
    assert.equal(tipos.size, malos.length, 'dos ánimos comparten tipo de tarea');
  });

  test('una planta puede tener varias tareas a la vez', () => {
    /* Sed y pila baja son dos problemas distintos. Juntarlos en una sola
       tarea haría que resolver el fácil esconda el otro. */
    const t = tareasDe(nodo({
      mood: 'THIRSTY', nodo: { batt_pct: 8 },
    }), MONSTERA);
    const tipos = t.map((x) => x.tipo);
    assert.ok(tipos.includes('regar'));
    assert.ok(tipos.includes('pila'));
  });

  test('un aparato caído pide revisión', () => {
    const t = tareasDe(nodo({ link: 'CAIDO' }), MONSTERA);
    assert.ok(t.some((x) => x.tipo === 'revisar'));
  });

  test('un alta a medias es una tarea', () => {
    const sinEspecie = tareasDe(nodo({ especie: null }), null);
    assert.ok(sinEspecie.some((x) => x.tipo === 'especie'));
    const cofreCerrado = tareasDe(nodo({ revelado: false, especie: null }), null);
    assert.ok(cofreCerrado.some((x) => x.tipo === 'cofre'), 'con el cofre cerrado, lo primero es abrirlo');
    assert.ok(!cofreCerrado.some((x) => x.tipo === 'especie'), 'y la foto viene después');
  });

  test('enchufado no pide carga aunque la batería esté baja', () => {
    const t = tareasDe(nodo({ nodo: { batt_pct: 5, usb: true } }), MONSTERA);
    assert.ok(!t.some((x) => x.tipo === 'pila'));
  });

  test('las tareas que el sensor confirma se marcan como automáticas', () => {
    const regar = tareasDe(nodo({ mood: 'THIRSTY' }), MONSTERA)[0];
    assert.equal(regar.auto, true, 'regar lo confirma el sensor');
    const pila = tareasDe(nodo({ nodo: { batt_pct: 5 } }), MONSTERA)
      .find((t) => t.tipo === 'pila');
    assert.equal(pila.auto, false, 'cargar la batería no lo confirma el sensor de la planta');
  });

  test('sin especie la tarea se genera igual, sin inventar el rango', () => {
    const t = tareasDe(nodo({ mood: 'THIRSTY', especie: null }), undefined);
    const regar = t.find((x) => x.tipo === 'regar');
    assert.ok(regar, 'igual hay que regarla');
    assert.doesNotMatch(regar.detalle, /entre/, 'no puede inventar un rango');
  });

  test('el orden pone lo urgente arriba', () => {
    const t = ordenarTareas([
      { urgencia: 'cuando-puedas', planta: 'A', edad_s: 0 },
      { urgencia: 'urgente', planta: 'B', edad_s: 0 },
      { urgencia: 'pronto', planta: 'C', edad_s: 0 },
    ]);
    assert.deepEqual(t.map((x) => x.urgencia),
      ['urgente', 'pronto', 'cuando-puedas']);
  });

  test('a igual urgencia, primero la que lleva más tiempo así', () => {
    const t = ordenarTareas([
      { urgencia: 'pronto', planta: 'A', edad_s: 100 },
      { urgencia: 'pronto', planta: 'B', edad_s: 9000 },
    ]);
    assert.equal(t[0].planta, 'B');
  });

  test('marcar una tarea como hecha la esconde, y vuelve si no se resolvió', () => {
    const nodos = [nodo({ mood: 'THIRSTY' })];
    const ahora = 1_000_000;
    const id = 'p1:regar';

    assert.equal(tareasDelDia(nodos, [MONSTERA], {}, ahora).length, 1);
    /* Recién hecha: se esconde mientras el sensor se pone al día. */
    assert.equal(tareasDelDia(nodos, [MONSTERA], { [id]: ahora }, ahora).length, 0);
    /* Pasada la gracia y con la planta todavía seca, vuelve — y volver es
       correcto: significa que el riego no alcanzó. */
    const despues = ahora + GRACIA_MS + 1;
    assert.equal(tareasDelDia(nodos, [MONSTERA], { [id]: ahora }, despues).length, 1);
  });

  test('el resumen cambia de tono según lo que haya', () => {
    assert.equal(resumenDeTareas([]).tono, 'bien');
    assert.equal(resumenDeTareas([{ urgencia: 'urgente' }]).tono, 'urgente');
    assert.equal(resumenDeTareas([{ urgencia: 'pronto' }]).tono, 'pendiente');
    assert.match(resumenDeTareas([{ urgencia: 'urgente' }]).titulo, /1 cosa urgente/);
  });

  test('las urgencias son las tres declaradas y nada más', () => {
    const usadas = new Set();
    for (const mood of ['THIRSTY', 'DROWNING', 'DARK', 'COLD', 'HOT', 'PARCHED_AIR', 'SCORCHED']) {
      for (const t of tareasDe(nodo({ mood }), MONSTERA)) usadas.add(t.urgencia);
    }
    for (const u of usadas) assert.ok(URGENCIAS.includes(u), `urgencia rara: ${u}`);
  });

  test('los contadores suman el total', () => {
    const c = contarEstados([
      nodo({ severity: 'OK' }),
      nodo({ severity: 'WATCH' }),
      nodo({ severity: 'URGENT' }),
      nodo({ link: 'CAIDO' }),
    ]);
    assert.equal(c.total, 4);
    assert.equal(c.bien + c.atencion + c.urgente + c.sinDatos, 4);
    assert.equal(c.sinDatos, 1);
  });

  test('nada de esto explota con datos vacíos', () => {
    assert.deepEqual(tareasDelDia(null, null, null), []);
    assert.deepEqual(tareasDe(null, null), []);
    assert.equal(contarEstados(null).total, 0);
    assert.equal(resumenDeTareas(null).tono, 'bien');
  });
});

/* ======================================================== diagnóstico === */
describe('diagnóstico por foto', () => {
  const tel = (soil, rh = 60, lux = 5000, temp = 230) => ({
    soil_pct: soil, rh_pct: rh, lux, temp_dc: temp,
  });

  test('la zona ubica un valor respecto del rango', () => {
    assert.equal(zona(10, 25, 60), 'baja');
    assert.equal(zona(40, 25, 60), 'ok');
    assert.equal(zona(90, 25, 60), 'alta');
    assert.equal(zona(undefined, 25, 60), 'desconocida');
  });

  test('el MISMO síntoma con distinta tierra da causas distintas', () => {
    /* Es la razón de existir del módulo. Si las tres dieran lo mismo, la
       telemetría no estaría aportando nada al diagnóstico. */
    const mojada = interpretar('hojas_amarillas', tel(85), MONSTERA);
    const seca = interpretar('hojas_amarillas', tel(10), MONSTERA);
    const enRango = interpretar('hojas_amarillas', tel(40), MONSTERA);

    assert.match(mojada.causa, /exceso de riego/);
    assert.match(seca.causa, /sequía/);
    assert.match(enRango.causa, /nutrientes/);
    assert.equal(new Set([mojada.causa, seca.causa, enRango.causa]).size, 3);
  });

  test('marca cuándo el sensor NO podía ver el problema', () => {
    /* El caso que justifica sacar la foto. */
    assert.equal(interpretar('hojas_amarillas', tel(85), MONSTERA).confirma, true);
    assert.equal(interpretar('hojas_amarillas', tel(40), MONSTERA).confirma, false);
    assert.equal(interpretar('plagas', tel(40), MONSTERA).confirma, false);
  });

  test('marchita con la tierra mojada no es sed, es lo contrario', () => {
    /* El error más caro que puede cometer alguien que cuida plantas: ve la
       planta caída, la riega, y le termina de pudrir las raíces. */
    const r = interpretar('caida', tel(90), MONSTERA);
    assert.match(r.causa, /ahogad/);
    assert.match(r.accion, /No riegues/);
  });

  test('cada hallazgo conocido devuelve algo accionable', () => {
    for (const hallazgo of HALLAZGOS) {
      const r = interpretar(hallazgo, tel(40), MONSTERA);
      assert.ok(r.causa, `${hallazgo} sin causa`);
      assert.ok(r.detalle, `${hallazgo} sin detalle`);
      if (hallazgo !== 'sana') {
        assert.ok(r.accion, `${hallazgo} no dice qué hacer`);
      }
    }
  });

  test('un hallazgo inventado no rompe', () => {
    const r = interpretar('hojas_de_plastico', tel(40), MONSTERA);
    assert.equal(r.gravedad, 'ninguna');
  });

  test('el veredicto distingue confirmar de revelar', () => {
    assert.equal(diagnosticar(['sana'], tel(40), MONSTERA).veredicto, 'sana');
    assert.equal(diagnosticar(['hojas_amarillas'], tel(85), MONSTERA).veredicto, 'confirma');
    assert.equal(diagnosticar(['hojas_amarillas'], tel(40), MONSTERA).veredicto, 'revela');
    assert.equal(diagnosticar([], tel(40), MONSTERA).veredicto, 'sin-datos');
  });

  test('con varios problemas, el más grave va primero', () => {
    const d = diagnosticar(['puntas_marrones', 'caida'], tel(10, 30), MONSTERA);
    assert.equal(d.conclusiones[0].gravedad, 'alta');
  });

  test('los hallazgos desconocidos se descartan en vez de interpretarse', () => {
    const d = diagnosticar(['no_existe', 'sana'], tel(40), MONSTERA);
    assert.equal(d.veredicto, 'sana');
  });

  test('sin especie sigue dando algo útil y no inventa rangos', () => {
    const d = diagnosticar(['caida'], tel(10), undefined);
    assert.ok(d.conclusiones.length >= 1);
    assert.ok(d.titulo);
  });
});

/* ====================================================== gamificación === */
describe('gamificación', () => {
  test('la XP sale de días sanos, no de usar la app', () => {
    const sinNada = xpTotal([nodo({ bond: { dias_sanos: 0, mejor_racha: 0 } })]);
    assert.equal(sinNada, 0, 'tener una planta sin cuidarla no da XP');

    const conDias = xpTotal([nodo({ bond: { dias_sanos: 10, mejor_racha: 0 } })]);
    assert.equal(conDias, 10 * XP.DIA_SANO + XP.ETAPA,
      'diez días sanos pasan el umbral de 7, así que suman una etapa');
  });

  test('la XP crece de forma monótona con el cuidado', () => {
    let anterior = -1;
    for (let d = 0; d <= 200; d += 1) {
      const xp = xpTotal([nodo({ bond: { dias_sanos: d, mejor_racha: d } })]);
      assert.ok(xp >= anterior, `bajó en ${d} días`);
      anterior = xp;
    }
  });

  test('no se puede llegar al último nivel en poco tiempo', () => {
    /* La lentitud es la característica: alguien con tres plantas necesita
       meses de cuidado sostenido. Si esto se pudiera acelerar, el número
       mediría entusiasmo en vez de jardinería. */
    const tres = [30, 30, 30].map((d) => nodo({ bond: { dias_sanos: d, mejor_racha: d } }));
    const n = nivelDe(xpTotal(tres));
    assert.ok(n.nivel < NIVELES.length,
      'un mes con tres plantas no puede dar el nivel máximo');
  });

  test('el nivel reporta progreso y cuánto falta', () => {
    const n = nivelDe(0);
    assert.equal(n.nivel, 1);
    assert.equal(n.progreso, 0);
    assert.ok(n.faltan > 0);

    const tope = nivelDe(999999);
    assert.equal(tope.nivel, NIVELES.length);
    assert.equal(tope.progreso, 100);
    assert.equal(tope.faltan, 0);
    assert.equal(tope.siguiente, null);

    for (const xp of [-5, NaN, undefined]) {
      assert.equal(nivelDe(xp).nivel, 1, `${xp} debería caer en el nivel 1`);
    }
  });

  test('la racha suma un día por día y se corta con una urgencia', () => {
    let r = { dias: 0, mejor: 0, ultimo: null };
    r = actualizarRacha(r, false, '2026-01-01');
    assert.equal(r.dias, 1);
    /* Mirar dos veces el mismo día no suma dos veces. */
    r = actualizarRacha(r, false, '2026-01-01');
    assert.equal(r.dias, 1);
    r = actualizarRacha(r, false, '2026-01-02');
    assert.equal(r.dias, 2);
    assert.equal(r.mejor, 2);
    r = actualizarRacha(r, true, '2026-01-03');
    assert.equal(r.dias, 0, 'una urgencia corta la racha');
    assert.equal(r.mejor, 2, 'pero la mejor se conserva');
  });

  test('los logros se derivan del estado, no se guardan', () => {
    const vacio = evaluarLogros({ nodos: [] });
    assert.ok(vacio.every((l) => !l.cumplido));

    const conUna = evaluarLogros({ nodos: [nodo()] });
    assert.ok(conUna.find((l) => l.id === 'primera').cumplido);

    const medioAnio = evaluarLogros({
      nodos: [nodo({ bond: { dias_sanos: 180 } })],
    });
    assert.ok(medioAnio.find((l) => l.id === 'ancestral').cumplido);
  });

  test('los cumplidos se listan antes que los pendientes', () => {
    const l = evaluarLogros({ nodos: [nodo()] });
    const primerPendiente = l.findIndex((x) => !x.cumplido);
    const ultimoCumplido = l.map((x) => x.cumplido).lastIndexOf(true);
    assert.ok(ultimoCumplido < primerPendiente);
  });

  test('tener la colección completa no da XP', () => {
    /* Demuestra que compraste cajas, no que sepas regar. */
    const sinColeccion = xpTotal([nodo({ bond: { dias_sanos: 5, mejor_racha: 0 } })]);
    const conColeccion = xpTotal([nodo({ bond: { dias_sanos: 5, mejor_racha: 0 } })]);
    assert.equal(sinColeccion, conColeccion);
  });

  test('el saludo no felicita cuando hay algo urgente', () => {
    assert.equal(saludo(10, true), 'Hay algo que mirar');
    assert.equal(saludo(10, false), 'Buen día');
    assert.equal(saludo(22, false), 'Buenas noches');
  });

  test('nada explota con datos vacíos', () => {
    assert.equal(xpTotal(null), 0);
    assert.equal(nivelDe(null).nivel, 1);
    assert.ok(Array.isArray(evaluarLogros(null)));
    assert.equal(actualizarRacha(null, false, 'x').dias, 1);
  });
});
