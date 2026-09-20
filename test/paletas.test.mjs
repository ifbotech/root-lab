/* Las paletas: que cada una se lea (WCAG AA) y que la lógica de Rooties y
 * desbloqueos sea la prometida.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PALETAS, PALETA_POR_DEFECTO, paletaPorId, paletaDeRooti, paletasDisponibles, cumpleRequisito,
  temaDesdePaleta, temaNocheDePaleta, contraste, mezclar, asegurarContraste, luminancia, declaraciones,
} from '../public/lib/paletas.mjs';
import { esModoNoche, MODOS, MODO_ES, MODO_POR_DEFECTO } from '../public/lib/reloj.mjs';
import { MODELOS, RAREZAS } from '../server/catalogo.mjs';
import { escenario, conRooti } from './ayudas.mjs';

const HEX = /^#[0-9a-f]{6}$/;

describe('color', () => {
  test('contraste de WCAG en los extremos conocidos', () => {
    assert.equal(Math.round(contraste('#000000', '#ffffff') * 10) / 10, 21);
    assert.equal(contraste('#777777', '#777777'), 1);
    assert.equal(luminancia('#ffffff'), 1);
  });

  test('mezclar en OKLab respeta las puntas', () => {
    assert.equal(mezclar('#f94144', '#277da1', 0), '#f94144');
    assert.equal(mezclar('#f94144', '#277da1', 1), '#277da1');
    assert.match(mezclar('#f94144', '#277da1', 0.5), HEX);
  });

  test('asegurarContraste aclara lo justo', () => {
    const c = asegurarContraste('#0353a4', ['#001233'], 4.5);
    assert.ok(contraste(c, '#001233') >= 4.5);
    assert.equal(asegurarContraste('#ffffff', ['#000000'], 4.5), '#ffffff', 'lo que ya cumple no se toca');
  });
});

describe('paletas', () => {
  test('la de ROOTLAB es clara, de libro de cuentos; Vibrant Tones queda como cosmética libre', () => {
    const r = paletaPorId(PALETA_POR_DEFECTO);
    assert.equal(r.id, 'rootlab');
    assert.equal(r.claro, true);
    assert.ok(luminancia(temaDesdePaleta(r).fondo) > 0.8, 'papel');
    assert.ok(r.noche, 'con su versión de noche');
    const v = paletaPorId('vibrant');
    assert.deepEqual(v.colores.map((c) => c.hex), ['#f94144', '#f3722c', '#f8961e', '#f9844a', '#f9c74f', '#90be6d', '#43aa8b', '#4d908e', '#577590', '#277da1']);
    assert.equal(paletasDisponibles([]).find((p) => p.id === 'vibrant').bloqueada, false);
  });

  test('cada piel de cada Rooti es una paleta clara, con los cinco colores del firmware', () => {
    assert.equal(PALETAS.filter((x) => x.rooti).length, MODELOS.length * RAREZAS.length);
    for (const m of MODELOS) {
      for (const r of RAREZAS) {
        const p = paletaDeRooti(m.id, r);
        assert.ok(p, `${m.id}-${r}`);
        assert.equal(p.id, `${m.id}-${r}`);
        assert.equal(p.claro, true);
        const piel = m.pieles[r];
        assert.deepEqual(p.colores.map((c) => c.hex), [piel.escena, piel.piel, piel.ojos, piel.acento, piel.rubor]);
        /* El fondo de la app es el tinte claro, no el color del cuerpo: el
           cuerpo es brillante y una pantalla entera de ese color no se lee. */
        assert.equal(p.roles.fondo, piel.escena);
        assert.equal(p.roles.base, piel.piel);
      }
    }
    assert.equal(paletaDeRooti('kip').id, 'kip-comun', 'sin rareza, la común');
    assert.equal(paletaDeRooti('kawaii'), null, 'los Rooties de antes ya no pintan');
    assert.equal(paletaPorId('chico-malo'), null);
  });

  test('las pieles se desbloquean abriendo su cofre', () => {
    const sin = paletasDisponibles([]);
    assert.equal(sin.find((p) => p.id === 'vibrant').bloqueada, false);
    assert.equal(sin.find((p) => p.id === 'kip-comun').bloqueada, true);
    assert.match(sin.find((p) => p.id === 'kip-comun').porque, /Kip/);
    const con = paletasDisponibles(['kip-comun']);
    assert.equal(con.find((p) => p.id === 'kip-comun').bloqueada, false);
    assert.equal(con.find((p) => p.id === 'kip-raro').bloqueada, true, 'cada piel por separado');
  });

  test('las cosméticas se ganan cuidando: OLED libre, Cristal con una épica o 60 días, Solar con 180', () => {
    const nada = paletasDisponibles([]);
    assert.equal(nada.find((p) => p.id === 'oled').bloqueada, false);
    assert.equal(nada.find((p) => p.id === 'cristal').bloqueada, true);
    assert.match(nada.find((p) => p.id === 'cristal').porque, /épica/);
    assert.equal(nada.find((p) => p.id === 'solar').bloqueada, true);
    assert.equal(paletasDisponibles(['kip-epico']).find((p) => p.id === 'cristal').bloqueada, false);
    assert.equal(paletasDisponibles([], { diasSanos: 60 }).find((p) => p.id === 'cristal').bloqueada, false);
    assert.equal(paletasDisponibles([], { diasSanos: 59 }).find((p) => p.id === 'cristal').bloqueada, true);
    assert.equal(paletasDisponibles([], { diasSanos: 180 }).find((p) => p.id === 'solar').bloqueada, false);
    assert.equal(paletasDisponibles(['kip-epico']).find((p) => p.id === 'solar').bloqueada, true, 'una épica no alcanza para Solar');
    assert.equal(cumpleRequisito(null), true);
    for (const p of PALETAS.filter((x) => x.requisito)) assert.ok(p.desbloqueo, `${p.id} dice cómo se gana`);
    for (const p of PALETAS.filter((x) => x.estilo)) assert.match(p.estilo, /^[a-z]+$/);
    assert.equal(paletaPorId('oled').roles.fondo, '#000000', 'OLED es negro absoluto');
  });

  for (const paleta of PALETAS) {
    test(`${paleta.nombre}: todo el texto se lee (WCAG AA)`, () => {
      const t = temaDesdePaleta(paleta);
      for (const [k, v] of Object.entries(t)) {
        if (k !== 'fondo-rgb') assert.match(v, HEX, k);
      }
      const superficies = ['fondo', 'fondo-alto', 'panel', 'panel-alto'];
      for (const s of superficies) {
        assert.ok(contraste(t.tinta, t[s]) >= 7, `tinta sobre ${s}: ${contraste(t.tinta, t[s]).toFixed(2)}`);
        for (const k of ['tinta-2', 'tinta-3', 'primario-texto', 'secundario-texto', 'destacado-texto', 'acento-texto', 'bien-texto', 'atencion-texto', 'urgente-texto']) {
          assert.ok(contraste(t[k], t[s]) >= 4.5, `${k} sobre ${s}: ${contraste(t[k], t[s]).toFixed(2)}`);
        }
      }
      for (const k of ['primario', 'secundario', 'destacado', 'acento', 'bien', 'atencion', 'urgente']) {
        assert.ok(contraste(t[`sobre-${k}`], t[k]) >= 4.5, `texto sobre ${k}: ${contraste(t[`sobre-${k}`], t[k]).toFixed(2)}`);
      }
      for (const k of ['dato-tierra', 'dato-temperatura', 'dato-luz', 'dato-humedad']) {
        assert.ok(contraste(t[k], t.panel) >= 3, `${k} sobre panel`);
      }
      /* El chip de estado es su color sobre un fondo teñido con ese mismo
         color: una superficie más, que hay que mirar aparte. */
      for (const k of ['bien', 'atencion', 'urgente']) {
        assert.ok(contraste(t[`${k}-texto`], t[`${k}-chip`]) >= 4.5,
          `chip ${k}: ${contraste(t[`${k}-texto`], t[`${k}-chip`]).toFixed(2)}`);
      }
      if (paleta.claro) assert.ok(luminancia(t.fondo) > 0.6, 'tema claro, pastel');
      else assert.ok(luminancia(t.fondo) < 0.05, 'tema oscuro');
      assert.ok(contraste(t['sobre-globo'], t.globo) >= 7, 'lo que dice el globo se lee');
      assert.ok(declaraciones(t).every(([n]) => n.startsWith('--')));
    });

    test(`${paleta.nombre}, de noche: oscura y todo el texto se lee (WCAG AA)`, () => {
      const t = temaNocheDePaleta(paleta);
      assert.deepEqual(Object.keys(t).sort(), Object.keys(temaDesdePaleta(paleta)).sort(), 'los mismos tokens que de día');
      assert.ok(luminancia(t.fondo) < 0.05, 'fondo profundo');
      for (const k of ['bien', 'atencion', 'urgente']) {
        assert.ok(contraste(t[`${k}-texto`], t[`${k}-chip`]) >= 4.5,
          `chip ${k} de noche: ${contraste(t[`${k}-texto`], t[`${k}-chip`]).toFixed(2)}`);
      }
      for (const s of ['fondo', 'fondo-alto', 'panel', 'panel-alto']) {
        assert.ok(contraste(t.tinta, t[s]) >= 7, `tinta sobre ${s}`);
        for (const k of ['tinta-2', 'tinta-3', 'primario-texto', 'secundario-texto', 'destacado-texto', 'acento-texto', 'bien-texto', 'atencion-texto', 'urgente-texto']) {
          assert.ok(contraste(t[k], t[s]) >= 4.5, `${k} sobre ${s}: ${contraste(t[k], t[s]).toFixed(2)}`);
        }
      }
      for (const k of ['primario', 'secundario', 'destacado', 'acento', 'bien', 'atencion', 'urgente']) {
        assert.ok(contraste(t[`sobre-${k}`], t[k]) >= 4.5, `texto sobre ${k}`);
      }
      assert.ok(contraste(t['sobre-globo'], t.globo) >= 7);
      if (!paleta.claro) assert.deepEqual(t, temaDesdePaleta(paleta), 'una paleta oscura es igual a toda hora');
    });
  }

  test('de día o de noche: el modo decide', () => {
    assert.deepEqual(MODOS, ['auto', 'sistema', 'dia', 'noche']);
    assert.equal(MODO_POR_DEFECTO, 'auto');
    for (const m of MODOS) assert.ok(MODO_ES[m]);
    assert.equal(esModoNoche('auto', 23), true, 'como el Rooti: de 22 a 8');
    assert.equal(esModoNoche('auto', 7), true);
    assert.equal(esModoNoche('auto', 8), false);
    assert.equal(esModoNoche('auto', 21, true), false, 'en auto no mira el sistema');
    assert.equal(esModoNoche('sistema', 12, true), true);
    assert.equal(esModoNoche('sistema', 23, false), false);
    assert.equal(esModoNoche('dia', 3, true), false);
    assert.equal(esModoNoche('noche', 12, false), true);
    assert.equal(esModoNoche('inventado', 23), true, 'un modo desconocido es auto');
  });
});

describe('las cosméticas por la API', () => {
  test('el servidor verifica lo ganado: OLED libre, Cristal con 60 días sanos o una épica, Solar con 180', async () => {
    const esc = escenario();
    const { token, planta } = await conRooti(esc);
    let [c, r] = await esc.llamar('PATCH', '/api/cuenta', { token, cuerpo: { paleta: 'oled' } });
    assert.equal(c, 200);
    assert.equal(r.paleta, 'oled');
    [c, r] = await esc.llamar('PATCH', '/api/cuenta', { token, cuerpo: { paleta: 'cristal' } });
    assert.equal(c, 403);
    assert.match(r.error, /60 días/);
    [c] = await esc.llamar('PATCH', '/api/cuenta', { token, cuerpo: { paleta: 'solar' } });
    assert.equal(c, 403);
    /* Una planta que llegó a los 60 días sanos. */
    const p = esc.db.planta(planta.id);
    p.vinculo = { ...(p.vinculo || {}), dias_sanos: 60 };
    esc.db.plantaGuardar(p);
    [c, r] = await esc.llamar('PATCH', '/api/cuenta', { token, cuerpo: { paleta: 'cristal' } });
    assert.equal(c, 200);
    assert.equal(r.paleta, 'cristal');
    [c] = await esc.llamar('PATCH', '/api/cuenta', { token, cuerpo: { paleta: 'solar' } });
    assert.equal(c, 403, 'Solar pide 180');
    p.vinculo.dias_sanos = 180;
    esc.db.plantaGuardar(p);
    [c] = await esc.llamar('PATCH', '/api/cuenta', { token, cuerpo: { paleta: 'solar' } });
    assert.equal(c, 200);
    /* Y una piel épica abre Cristal aunque no haya días. */
    const otra = await conRooti(esc);
    esc.db.cuentaActualizar(esc.db.planta(otra.planta.id).cuenta, { coleccion: ['kip-comun', 'plum-epico'] });
    [c] = await esc.llamar('PATCH', '/api/cuenta', { token: otra.token, cuerpo: { paleta: 'cristal' } });
    assert.equal(c, 200);
  });
});
