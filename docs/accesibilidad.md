# Accesibilidad

ROOTLAB lo usa alguien que llega del QR con una mano ocupada sosteniendo una
maceta, alguien que agranda la letra del teléfono, alguien que no distingue el
verde del rojo y alguien que no mira la pantalla. La meta es **WCAG 2.1 nivel
AA**, y hoy la app pasa una auditoría completa sin una sola violación.

## Lo que ya está resuelto por diseño

**El color nunca es la única señal.** Un estado urgente va con el texto
("URGENTE", "con sed"), un ícono y un color; nunca sólo con el color. Las
rarezas del cofre llevan su nombre. Ver [paletas.md](paletas.md).

**El contraste lo garantiza el motor, no el ojo.** `lib/paletas.mjs` convierte
la paleta de la cuenta en unas 40 variables de CSS y ajusta lo que no llega:
7:1 el texto principal, 4,5:1 el secundario y el de color, 3:1 las series de
los gráficos. `test/paletas.test.mjs` recorre las veinte paletas de día y de
noche y falla si alguna no cumple.

Los **chips de estado** son un caso aparte: son texto de un color sobre un
fondo teñido con ese mismo color, una superficie que no es ninguna de las
cuatro contra las que se garantiza el resto. El motor calcula ese fondo
(`--bien-chip`, `--atencion-chip`, `--urgente-chip`) y asegura el texto contra
él; la hoja de estilos usa ese token en vez de teñir por su cuenta, que es lo
que hacía cuando una paleta clara dejaba "bien" por debajo de 4,5:1.

**Nada se mueve si pidieron que no se mueva.** `prefers-reduced-motion`
apaga la animación de las secciones, las transiciones de paleta y los
latidos.

**De día y de noche.** Las veinte paletas tienen su versión nocturna, con el
mismo contraste garantizado, y se eligen en Ajustes (o *Auto*, con la hora).

## Lo que se arregló en la auditoría

| Qué estaba mal | Cómo quedó |
|---|---|
| El botón de volver era un carácter `‹` suelto en ocho vistas, a veces sin decir qué hacía: un lector de pantalla lo lee "menor que" | `botonVolver()` en `lib/ui.mjs`: la flecha dibujada de los íconos, siempre con su nombre |
| La ronda de caras y el estante del invernadero eran `<div role="list">` con `<button role="listitem">` adentro: ni lista ni botones | `<ul>` con `<li>`, y el botón adentro del `<li>` |
| Cada fila de "Mis plantas" era un `<li role="button">`, así que el `<ul>` se quedaba sin ítems válidos | El `<li>` vuelve a ser ítem y lo que se toca es el bloque de adentro, con su `aria-label` |
| La ficha de la planta abría con un `<h2>` vacío | El encabezado es el nombre de la planta (`.oculto-visual`: se lee, no se ve) |
| El campo para elegir una foto del álbum estaba escondido y sin nombre | Lleva `aria-label`; los otros dos ya vivían dentro de un `<label>` |
| No había ningún `<h1>`: nada decía dónde empieza la página | El nombre del producto en la barra es el `<h1>` |

## Cómo se vigila

**En cada `npm test`** (`test/accesibilidad.test.mjs`): las invariantes que se
pueden mirar en el código fuente —un solo `<h1>`, ningún `role` de lista
puesto a mano, ningún `‹` como botón, los campos de archivo con nombre, los
botones que son sólo un ícono con `aria-label`, el tinte del chip igual en el
motor y en la hoja, el foco visible y el respeto por `prefers-reduced-motion`.
Son las que una vez estuvieron mal.

**La auditoría completa** necesita un navegador, así que no corre en `npm
test` —este proyecto no tiene dependencias de desarrollo y no vale la pena
sumarle un navegador entero— pero sí está guardada, en
[`analisis/accesibilidad.mjs`](../analisis/README.md):

```bash
cd analisis && npm install && npx playwright install chromium
cd .. && node analisis/accesibilidad.mjs
BASE_URL=https://ifbotech.com/rootkit node analisis/accesibilidad.mjs
```

Por dentro es esto, contra la app andando:

```js
import { readFileSync } from 'node:fs';
const AXE = readFileSync('node_modules/axe-core/axe.min.js', 'utf8');
await pagina.evaluate(AXE);
const r = await pagina.evaluate(() => window.axe.run(document, {
  runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] },
}));
```

Hay que recorrer las nueve pantallas (hoy, plantas, ficha, invernadero,
colección, ajustes, chat, álbum y agregar), **de día y de noche**, y con las
secciones plegables abiertas (`localStorage['rootlab:secciones']`): lo que está
cerrado igual está en la página. Conviene repetirlo antes de cada versión que
toque la interfaz.

## Lo que falta

- Probarla con un lector de pantalla de verdad (VoiceOver en iPhone,
  TalkBack en Android): axe encuentra lo que es mecánico, no si el orden en
  que se lee una pantalla tiene sentido.
- Mirarla con el teléfono en horizontal. (Con la letra del sistema al doble y
  a 320 px de ancho ya se probó: `analisis/letra-y-ancho.mjs`, todo entra.)
- Revisar el emulador, que hoy queda afuera de la auditoría: es una
  herramienta de desarrollo, no parte del producto.
