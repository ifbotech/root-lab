# Análisis

Herramientas para mirar la app andando: lo que no se puede saber leyendo el
código ni con `npm test`. **No son pruebas**: no corren en CI, no fallan el
build y no hay que mantenerlas al día con cada cambio. Se sacan del cajón
cuando hace falta contestar una pregunta.

Cada una encontró algo de verdad, y por eso están acá y no en el olvido:

| Herramienta | Qué contesta | Qué encontró |
|---|---|---|
| `accesibilidad.mjs` | ¿pasa WCAG 2.1 AA, de día y de noche, con todo abierto? | seis violaciones reales (listas falsas, un `<h2>` vacío, un campo sin nombre, sin `<h1>`, el chip de estado sin contraste) |
| `red.mjs` | ¿cuántos bytes pasan de verdad por el cable? | que nada se comprimía: primera carga 257 KB, segunda 6 KB |
| `cpu.mjs` | ¿cuánto trabaja la app quieta, por pantalla? | 4–6 % con caras animadas; los lienzos fuera de pantalla ya no se dibujan |
| `sin-red.mjs` | ¿abre, deja hacer y sincroniza cuando vuelve? | que sí: abre en 20 ms y la cola sale sola |
| `letra-y-ancho.mjs` | ¿aguanta 320 px de ancho y la letra al doble? | que sí, sin nada cortado ni fuera de pantalla |
| `primera-pintada.mjs` | ¿en cuánto aparece algo, con red y sin red? | 28 ms y 20 ms |
| `pantallas.mjs` | una captura de cada pantalla, a lo alto | la ficha de 4077 px y Ajustes de 3901 px que hoy son 2196 y 1484 |
| `trastienda.mjs` | el panel entero: las cinco vistas y el vivero | — |
| `trastienda-puerta.mjs` | entrar con el código del email y el ABM de cuentas | — |
| `emulador.mjs` | ¿el emulador levanta y dibuja con el firmware real? | — |
| `sembrar-flota.mjs` | llena la base local con una flota de mentira | que el servidor rechaza lecturas con el reloj del aparato mal, y hace bien |
| `preparar.mjs` | el ayudante que usan las demás: cuenta, Rooti y planta | — |

## Cómo se corren

Necesitan **Playwright**, que el proyecto **no** trae como dependencia (root-lab
tiene dos dependencias y ninguna de desarrollo, y eso es a propósito). Se
instala aparte, una vez, donde sea:

```bash
cd analisis && npm install && npx playwright install chromium
```

`analisis/` tiene **su propio `package.json`** a propósito: si se instalara
desde la raíz, Playwright quedaría como dependencia del producto y el VPS se
bajaría un navegador entero en cada despliegue. Acá las dependencias pesadas
están de este lado de la pared.

Con el servidor local andando (`npm start` desde la raíz):

```bash
node analisis/pantallas.mjs
node analisis/accesibilidad.mjs
node analisis/red.mjs
```

Contra producción:

```bash
BASE_URL=https://ifbotech.com/rootkit node analisis/accesibilidad.mjs
```

Las que crean cuentas de prueba **las borran al terminar**. Las capturas quedan
en `analisis/capturas/`, que no va a git.

## Cuándo conviene sacarlas del cajón

- **Antes de una versión que toca la interfaz**: `accesibilidad.mjs`,
  `letra-y-ancho.mjs` y `pantallas.mjs`.
- **Si algo se siente lento**: `red.mjs` y `cpu.mjs` dan números, no
  impresiones.
- **Después de tocar el service worker o el almacén**: `sin-red.mjs`.
- **Después de tocar el panel**: `trastienda.mjs` y `trastienda-puerta.mjs`.

Y si una de estas encuentra algo que debería vigilarse siempre, lo que
corresponde es bajarlo a una prueba de `npm test` —como se hizo con
`test/accesibilidad.test.mjs`, que vigila en cada corrida las invariantes que
`accesibilidad.mjs` descubrió una vez.
