# Recuerdos: el álbum y el pasaporte botánico

Dos cosas para verla crecer: el **álbum de fotos** de cada planta y el
**pasaporte**, una hoja A4 con quién es y cómo estuvo. Los dos se llegan
desde la planta, panel **Recuerdos**.

## El álbum (`vistas/album.mjs`)

Las fotos se guardan en la cuenta, con la planta (tabla `fotos`: los bytes,
la fecha, una nota y de dónde vino). Hasta **60 por planta**, de hasta
**450 KB**: la app las achica a 1024 px antes de mandarlas. Las de
**reconocer** y **diagnosticar** entran solas (`origen`
`reconocimiento` / `diagnostico`): la primera foto de una planta suele ser
esa.

Tres cosas que una carpeta de fotos no hace:

- **El fantasma.** Al sacar una foto nueva, la última se ve al 30 % encima
  de la cámara en vivo (`getUserMedia`, cámara trasera): se encuadra igual
  que la vez anterior y las fotos se comparan de verdad. Donde no hay
  cámara en vivo (o se niega el permiso), la de la galería o la del
  teléfono, como siempre.
- **Antes / después.** La primera y la última foto superpuestas con un
  deslizador (`clip-path`), con sus fechas.
- **Exportar evolución.** Un GIF con todas las fotos, cada una con su fecha,
  escrito en el teléfono (`lib/gif.mjs`: cuantización a 256 colores con
  tramado, LZW y los bloques de GIF89a; sin librerías). Se comparte con Web
  Share donde hay archivos, o se descarga.

Las fotos bajan con la sesión (`fetch` con el token, no `<img src>`) y se
recuerdan como URLs de objeto mientras dura la página; el servidor las manda
como bytes con `cache-control: immutable`. Sin red, una foto nueva espera en
la cola (docs/sin-red.md) y sale sola.

### La API

| | |
|---|---|
| `GET /api/plantas/:id/fotos` | `{ fotos: [{ id, t, mime, ancho, alto, nota, origen, peso }], maximo }`, de la más nueva a la más vieja |
| `POST /api/plantas/:id/fotos` | `{ image_b64, mime, nota? }` → `201 { id, t }` · `400` tipo o vacía · `413` más de 450 KB · `409` álbum lleno |
| `GET /api/plantas/:id/fotos/:fid` | los bytes, con su `content-type` |
| `DELETE /api/plantas/:id/fotos/:fid` | `204` |

## El pasaporte (`vistas/pasaporte.mjs`, `lib/pasaporte.mjs`)

Una hoja de papel (fondo blanco, tinta oscura aunque la app sea nocturna):

1. **Identidad**: nombre, especie con su nombre científico, el Rooti con su
   cara, un número de pasaporte estable (`RL-nnnnnn`, del id), cuándo llegó,
   la edad en la app, los días sanos y la etapa, la mejor racha.
2. **El último mes**: tierra, temperatura, humedad y luz con media, mínimo
   y máximo, **al lado de lo que pide la especie** (para que los números se
   lean), cuánto tiempo estuvo cómoda y lo que más le pasó.
3. **Cómo se cuida**: riego, luz, temperatura, humedad de la ficha.
4. **Fotos**: la primera y la última del álbum.

**Guardar PDF** es la impresión del navegador (`window.print()`): el CSS de
impresión (`@page { size: A4 }`) arma la página y esconde la app. Sin
librerías ni servicios.

## Pruebas

`test/album.test.mjs`: subir, listar sin bytes, bajar los bytes con su tipo,
borrar, los límites (tipo, vacía, tamaño, álbum lleno), sólo la cuenta dueña,
y las fotos de reconocer y diagnosticar que entran solas.
`test/gif.test.mjs`: la paleta, la cuantización, LZW ida y vuelta y un GIF
de dos cuadros decodificado entero. `test/pasaporte.test.mjs`: el resumen
del mes, la edad y el número. `test/http.test.mjs`: las respuestas binarias.
