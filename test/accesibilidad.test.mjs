/* Accesibilidad: las reglas que se pueden mirar en el código fuente.
 *
 * La auditoría de verdad se hace con axe-core sobre la app andando, de día y
 * de noche y con todas las secciones abiertas (docs/accesibilidad.md). Eso
 * necesita un navegador, y este proyecto no tiene dependencias de desarrollo:
 * lo que queda acá son las invariantes que una vez estuvieron mal y que un
 * archivo de texto alcanza para vigilar, para que no vuelvan sin que nadie se
 * entere.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';

const RAIZ = resolve(fileURLToPath(new URL('..', import.meta.url)));
const leer = (p) => readFileSync(join(RAIZ, p), 'utf8');
const VISTAS = readdirSync(join(RAIZ, 'public/vistas')).filter((f) => f.endsWith('.mjs'));
const LIBS = readdirSync(join(RAIZ, 'public/lib')).filter((f) => f.endsWith('.mjs'));
const FUENTES = [
  ...VISTAS.map((f) => [`vistas/${f}`, leer(`public/vistas/${f}`)]),
  ...LIBS.map((f) => [`lib/${f}`, leer(`public/lib/${f}`)]),
  ['app.js', leer('public/app.js')],
];

describe('la estructura de la página', () => {
  test('hay un solo encabezado de nivel 1, y es el nombre del producto', () => {
    const html = leer('public/index.html');
    const h1 = html.match(/<h1[\s>]/g) || [];
    assert.equal(h1.length, 1, 'ni cero (el lector no sabe dónde está) ni dos');
    assert.match(html, /<h1[^>]*>[\s\S]*?ROOT<span>LAB<\/span>[\s\S]*?<\/h1>/);
  });

  test('la página tiene sus regiones y el idioma declarado', () => {
    const html = leer('public/index.html');
    assert.match(html, /<html lang="es"/);
    assert.match(html, /<main /);
    assert.match(html, /<nav [^>]*aria-label=/);
  });

  test('existe la clase para lo que se lee pero no se ve', () => {
    /* Un encabezado que ordena la pantalla sin dibujarse. Con `display:none`
       desaparecería también del lector, que es justo lo contrario. */
    const css = leer('public/style.css');
    assert.match(css, /\.oculto-visual\s*\{[^}]*clip-path/);
    assert.doesNotMatch(css, /\.oculto-visual\s*\{[^}]*display:\s*none/);
  });
});

describe('listas y roles', () => {
  test('ningún elemento se disfraza de ítem de lista', () => {
    /* Un <button role="listitem"> no es ni un botón ni un ítem: el lector de
       pantalla deja de contar "1 de 3" y el <ul> queda sin hijos válidos. Las
       listas se escriben como listas. */
    for (const [nombre, src] of FUENTES) {
      assert.doesNotMatch(src, /role:\s*'listitem'/, `${nombre} pone role listitem a mano`);
      assert.doesNotMatch(src, /role:\s*'list'/, `${nombre} pone role list a mano: usá <ul>`);
    }
  });

  test('lo que va dentro de un <ul> son <li>', () => {
    /* `h('ul', {...}, algo.map(...))`: lo que devuelve el map tiene que ser
       un <li>. Se mira que la función que arma cada hijo lo empiece con li. */
    const plantas = leer('public/vistas/plantas.mjs');
    assert.match(plantas, /return h\('li', \{\}, h\('div', \{/, 'la fila de la lista es un <li> con el bloque adentro');
    const hoy = leer('public/vistas/hoy.mjs');
    assert.match(hoy, /h\('ul', \{ class: 'ronda' \}/);
    assert.doesNotMatch(hoy, /class: 'ronda', role/);
  });
});

describe('cada control dice qué hace', () => {
  test('el botón de volver es uno solo, con su nombre', () => {
    const ui = leer('public/lib/ui.mjs');
    assert.match(ui, /export function botonVolver/);
    assert.match(ui, /'aria-label': etiqueta/);
    for (const [nombre, src] of FUENTES) {
      /* El carácter suelto que se usaba antes: el navegador lo dibuja como
         quiere y el lector lo lee "menor que". */
      if (nombre === 'lib/ui.mjs') continue;
      assert.ok(!src.includes("'‹'"), `${nombre} todavía usa «‹» como botón`);
    }
  });

  test('los campos de archivo escondidos tienen nombre o etiqueta', () => {
    for (const [nombre, src] of FUENTES) {
      const re = /h\('input', \{([^}]*type: 'file'[^}]*)\}/g;
      for (const m of src.matchAll(re)) {
        const atributos = m[1];
        const enEtiqueta = src.slice(Math.max(0, m.index - 400), m.index).includes("h('label'");
        assert.ok(
          atributos.includes('aria-label') || enEtiqueta,
          `${nombre}: un campo de archivo sin nombre ni <label> alrededor`,
        );
      }
    }
  });

  test('un botón que es sólo un ícono lleva aria-label', () => {
    /* Un ícono es `aria-hidden`: sin nombre, el botón no existe para quien no
       lo ve. */
    for (const [nombre, src] of FUENTES) {
      const re = /h\('button', \{([^}]*)\},\s*icono\([^)]*\)\)/g;
      for (const m of src.matchAll(re)) {
        assert.ok(m[1].includes('aria-label'), `${nombre}: botón sólo con ícono y sin aria-label`);
      }
    }
  });
});

describe('el motor de color', () => {
  test('el tinte del chip de estado es el mismo en el motor y en la hoja', () => {
    /* El chip es texto de color sobre un fondo teñido con ese color: si el
       CSS tiñe distinto que el motor, el contraste que el motor garantiza no
       es el que se ve. Por eso el fondo sale del motor, como token. */
    const css = leer('public/style.css');
    for (const estado of ['bien', 'atencion', 'urgente']) {
      assert.match(css, new RegExp(`\\.sev-${estado} \\.chip-estado \\{[^}]*background: var\\(--${estado}-chip\\)`));
    }
    assert.doesNotMatch(css, /\.chip-estado \{[^}]*color-mix\(in srgb, var\(--(bien|atencion|urgente)\)/);
  });
});

describe('movimiento y foco', () => {
  test('quien pide menos movimiento recibe menos movimiento', () => {
    const css = leer('public/style.css');
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  });

  test('el foco del teclado se ve', () => {
    const css = leer('public/style.css');
    assert.match(css, /:focus-visible/);
  });
});
