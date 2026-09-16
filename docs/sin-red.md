# Sin red: local primero, la cola de cambios, la insignia y los atajos

## Local primero (`lib/almacen.mjs`, `lib/api.mjs`)

La app abre en menos de 100 ms con lo último que vio —las caras, las
tareas, los números— aunque no haya red, y después se pone al día:

1. El service worker sirve el armazón (HTML, CSS, módulos, el renderer de
   caras, las imágenes de las caras) desde su caché.
2. `app.js` lee de **IndexedDB** la última respuesta de `/api/cuenta`,
   `/api/estado` y `/api/config` y pinta con eso, antes de tocar la red.
3. Después pide lo de verdad. Si hay red, se repinta sólo si cambió algo.
   Si no, queda lo guardado con la píldora **Sin conexión**.

Cada lectura que sale bien se guarda (`get:<ruta>`): el estado, el
historial y la charla de cada planta, el álbum, el cuidador, la previsión,
la vista del cuidador. Cualquier pantalla que ya se abrió una vez abre sin
red. IndexedDB y no localStorage porque es asincrónica, grande y guarda
objetos; si no está (algún modo privado), un Map en memoria: la app nunca se
rompe por no poder guardar. Al cerrar la sesión se vacía todo: lo guardado
es de esa cuenta.

**Los datos nunca se muestran como frescos**: sin red, la píldora está y las
lecturas dicen su edad ("hace 3 h"). La regla del service worker sigue:
`/api/` no se cachea ahí; la app sabe qué guardó y cuándo.

## La cola de cambios (`lib/cola.mjs`)

Sin red, la app no se traba ni pierde lo que la persona hizo. Los pedidos
que se pueden repetir sin daño esperan en una cola (en IndexedDB) y salen
solos, en orden, cuando vuelve la conexión (`online`) o con el próximo
pedido que sale bien:

| Se encola | No (dice "sin conexión", como siempre) |
|---|---|
| renombrar, brillo, pantalla de una planta (`PATCH /api/plantas/:id`) | la charla, reconocer, diagnosticar (necesitan la respuesta) |
| nombre, ciudad, paleta (`PATCH /api/cuenta`) | vincular, abrir el cofre, desvincular, borrar la cuenta |
| "ya regué" del cuidador (`POST /api/sitter/:token/riego`) | crear o revocar enlaces de cuidador |
| una foto para el álbum (`POST …/fotos`), borrar una foto | |

Dos cambios a la misma planta se funden (el último manda en cada campo).
Lo encolado se aplica a lo que se ve (`aplicarLocal`) para que la pantalla
no desmienta lo que la persona acaba de hacer, y la barra muestra **N por
mandar** hasta que salen. Un pedido que el servidor rechaza al mandarlo
(400, 409...) se descarta: ya no tiene sentido. Tope: 50.

## La insignia (Badging API)

El ícono de la app instalada muestra el número de **tareas de hoy**
(`navigator.setAppBadge`) y se borra cuando no hay ninguna o no hay sesión.
Con la app cerrada, cada notificación trae `pendientes` (cuántas plantas
necesitan algo) y el service worker pone ese número. Donde la API no existe,
no pasa nada.

## Los atajos del ícono (manifest `shortcuts`)

Mantener apretado el ícono ofrece **Regar** (las tareas de hoy), **Ver
cámara** (diagnosticar la primera planta con la foto) y **Charla** (hablar
con la primera planta que tiene especie). `#camara` y `#charla` se resuelven
en `app.js` a la planta que corresponda.

## Pruebas

`test/local.test.mjs`: el almacén guarda, lee con fecha, borra y vacía por
prefijo, y no tira con un respaldo roto; la cola sólo acepta lo que se puede
repetir, funde cambios a la misma planta, respeta el orden y el tope, y lo
encolado se ve en la pantalla. `test/http.test.mjs`: los atajos del
manifest.
