/* rooties-stl.mjs — saca las carcasas en STL desde el mismo modelo que la app.
 *
 * El Rooti que gira en el teléfono y la carcasa que sale de la impresora son
 * la misma malla: lib/rooti3d/formas.mjs, en milímetros. Este script la
 * escribe en STL binario y, de paso, deja al lado un informe con lo que hay
 * que saber antes de laminar (tamaño, voladizos, dónde entra la celda).
 *
 *   node tools/rooties-stl.mjs [carpeta]
 *
 * Por defecto escribe en ../rootkit/carcasas/, que es el repo del hardware:
 * los STL viven con el firmware y las carcasas, no con la app.
 *
 * NO hay un modelo "de impresión" aparte del de pantalla. Si alguna vez hay
 * dos, el que se imprime deja de estar probado, y entonces las pruebas de
 * voladizos y de hardware que corren en cada commit no dicen nada del objeto
 * que el usuario tiene en la mano.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ROOTIES, construir, ENVOLVENTE } from '../public/lib/rooti3d/formas.mjs';
import { analizar, stlBinario, CAMA } from '../public/lib/rooti3d/imprimible.mjs';
import { MODELOS } from '../public/lib/rooties.mjs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const destino = path.resolve(aqui, '..', process.argv[2] || '../rootkit/carcasas');

await mkdir(destino, { recursive: true });

const filas = [];
for (const id of ROOTIES) {
  const figura = construir(id);
  const modelo = MODELOS.find((m) => m.id === id);
  const a = analizar(figura);
  const stl = stlBinario(figura, modelo?.nombre || id);
  await writeFile(path.join(destino, `${id}.stl`), stl);
  filas.push({ id, nombre: modelo?.nombre || id, a, kb: Math.round(stl.length / 1024) });
  const problema = [
    a.entraEnLaCama ? null : 'no entra en la cama',
    a.voladizos.length ? `voladizos: ${a.voladizos.map((v) => `${v.parte} ${v.grados}°`).join(', ')}` : null,
    a.sinApoyo.length ? `en el aire: ${a.sinApoyo.map((s) => s.parte).join(', ')}` : null,
    a.hardware.bateria ? null : 'no entra la celda',
    a.hardware.pantalla ? null : 'no entra la pantalla',
  ].filter(Boolean);
  console.log(`${id.padEnd(9)} ${a.tamano.join(' × ').padEnd(22)} ${String(a.triangulos).padStart(6)} tri  ${String(Math.round(stl.length / 1024)).padStart(4)} KB  ${problema.length ? `⚠ ${problema.join('; ')}` : 'ok'}`);
}

const md = `# Las carcasas, en STL

<!-- GENERADO por root-lab/tools/rooties-stl.mjs. No editar a mano: los STL y
     esta tabla salen del mismo modelo que dibuja la app, así que para cambiar
     una figura se edita root-lab/public/lib/rooti3d/formas.mjs y se vuelve a
     correr el script. -->

Estos cinco archivos son los mismos Rooties que se ven girando en ROOTLAB. No
hay una versión "para imprimir" y otra "para la pantalla": es una sola malla,
en milímetros, y por eso lo que se prueba en cada commit
(\`root-lab/test/rooti3d.test.mjs\`) vale para el objeto que vas a tener en la
mano.

## Cómo se imprimen

Sin soportes, sin balsa y sin ajustes raros:

* **Orientación**: como vienen. La base plana apoya en la cama y ningún
  voladizo pasa de 45°.
* **Boquilla** 0,4 mm, **capa** 0,2 mm. Nada de la figura es más fino que
  2 mm, o sea cinco hilos.
* **Relleno** 15 % giroide. La celda va adentro: no hace falta más.
* **Perímetros** 3, que es lo que aguanta una caída de la mesa.
* **Material** PLA o PETG. El PETG aguanta mejor el sol de una ventana, que
  es donde va a vivir.

## Qué tiene que entrar adentro

| Pieza | Medida | Dónde |
| --- | --- | --- |
| Celda 18650 con portapilas | ${ENVOLVENTE.bateria.ancho} × ${ENVOLVENTE.bateria.alto} × ${ENVOLVENTE.bateria.fondo} mm | parada, desde ${ENVOLVENTE.bateria.desdeY} mm del piso, centrada y ${Math.abs(ENVOLVENTE.bateria.z)} mm hacia atrás |
| Módulo TFT 1,44" | ${ENVOLVENTE.pantalla.ancho} × ${ENVOLVENTE.pantalla.alto} × ${ENVOLVENTE.pantalla.fondo} mm | detrás de la cara, a ${ENVOLVENTE.pantalla.detras} mm del frente plano |
| Pared mínima | ${ENVOLVENTE.pared} mm | en todo el contorno |

La cama de referencia es de ${CAMA.join(' × ')} mm (una Ender 3 o parecida).

## Los cinco

| Rooti | Archivo | Tamaño (mm) | Triángulos | Base | Centro de masa | Hueco del módulo |
| --- | --- | --- | --- | --- | --- | --- |
${filas.map((f) => `| ${f.nombre} | \`${f.id}.stl\` | ${f.a.tamano.join(' × ')} | ${f.a.triangulos} | ${Math.round(f.a.base.proporcion * 100)} % del ancho | ${Math.round((f.a.centroDeMasa / f.a.tamano[1]) * 100)} % del alto | ${f.a.hueco.mm.toFixed(1)} mm |`).join('\n')}

El **centro de masa** es de la carcasa vacía; con la celda puesta baja todavía
más, porque la celda es lo más pesado y va abajo. El **hueco del módulo** es
cuánto hay que rebajar el frente para que el TFT, que es una plaquita rígida y
plana, apoye derecho.

## Lo que falta por hacer a mano

Los STL son el cuerpo. Todavía hay que modelar, y se hace en el CAD del
hardware, no acá:

* la tapa de abajo con sus tornillos y el hueco del USB-C;
* los pilares del PCB y los agarres del portapilas;
* el pasaje de la sonda de tierra;
* los agujeros del sensor de luz y del de temperatura.
`;

await writeFile(path.join(destino, 'README.md'), md);
console.log(`\n${filas.length} carcasas y un README en ${destino}`);
