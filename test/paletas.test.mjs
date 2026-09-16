/* Las paletas: que cada una se lea (WCAG AA) y que la lógica de Rooties y
 * desbloqueos sea la prometida.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PALETAS, PALETA_POR_DEFECTO, paletaPorId, paletaDeRooti, paletasDisponibles,
  temaDesdePaleta, contraste, mezclar, asegurarContraste, luminancia, declaraciones,
} from '../public/lib/paletas.mjs';
import { MODELOS } from '../server/catalogo.mjs';

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
  test('la de ROOTLAB es Vibrant Tones con sus diez colores', () => {
    const v = paletaPorId(PALETA_POR_DEFECTO);
    assert.equal(v.nombre, 'Vibrant Tones');
    assert.deepEqual(v.colores.map((c) => c.hex), ['#f94144', '#f3722c', '#f8961e', '#f9844a', '#f9c74f', '#90be6d', '#43aa8b', '#4d908e', '#577590', '#277da1']);
  });

  test('Chico Malo y Chica Chill tienen sus paletas, con sus Rooties en el catálogo', () => {
    assert.equal(paletaDeRooti('chico-malo').colores[0].hex, '#03071e');
    assert.equal(paletaDeRooti('chica-chill').colores[0].hex, '#0466c8');
    for (const p of PALETAS.filter((x) => x.rooti)) {
      assert.ok(MODELOS.some((m) => m.id === p.rooti), `${p.rooti} existe en el firmware`);
    }
    assert.equal(paletaDeRooti('kawaii'), null, 'un Rooti sin paleta no pinta');
  });

  test('las paletas de Rooties se desbloquean teniendo al Rooti', () => {
    const sin = paletasDisponibles([]);
    assert.equal(sin.find((p) => p.id === 'vibrant').bloqueada, false);
    assert.equal(sin.find((p) => p.id === 'chico-malo').bloqueada, true);
    assert.equal(paletasDisponibles(['chico-malo']).find((p) => p.id === 'chico-malo').bloqueada, false);
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
      assert.ok(luminancia(t.fondo) < 0.05, 'tema oscuro');
      assert.ok(declaraciones(t).every(([n]) => n.startsWith('--')));
    });
  }
});
