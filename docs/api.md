# API

Todo lo que responde el servidor está en `server/api.mjs` y se prueba sin
HTTP en `test/api.test.mjs`. Errores: `{ "error": "mensaje para mostrar" }`
con el código HTTP que corresponda.

## Del aparato

### `POST /api/d/sync`

`Authorization: Bearer <token del aparato>`. El cuerpo y la respuesta están
documentados con ejemplos y vectores de prueba en
[root-kit/docs/nube.md](https://github.com/ifbotech/root-kit/blob/main/docs/nube.md).

Lo que hace el servidor con cada pedido:

1. Autentica el token contra el id. Un id desconocido se registra con su
   token (confianza al primer uso) según `ROOTLAB_TOFU`: `1` cualquiera
   (desarrollo), `emulador` sólo los emuladores (producción: las placas las
   registra la fábrica) o `0` nadie. Un aparato deshabilitado recibe `403`.
   Ver [operacion.md](operacion.md).
2. Si el aparato está vinculado pero llega con otra **época**, alguien lo
   reinició con el botón: se rompe el vínculo.
3. Guarda el estado y, si viene, el código actual con su época.
4. Guarda las lecturas nuevas. Lo que no avanza en el reloj del aparato ya se
   había guardado y se ignora; igual cuenta como aceptado para que el aparato
   lo borre.
5. Avanza los días sanos de la planta con el día local de la cuenta, y cada
   tramo con la planta cómoda (`HAPPY` y `OK`) suma tiempo para las gotas de
   rocío de la mascota ([mascota.md](mascota.md)).
6. Manda las notificaciones que correspondan.
   Guarda también lo que el aparato cuenta de su actualización por aire
   (`ota: { version, estado }`) y su lote.
7. Responde vínculo, cofre, qué Rooti es (`persona`, desde que se vincula:
   lo dice la figura), la piel que salió del cofre (`rareza`: `comun`, `raro`
   o `epico`, sólo con el cofre abierto), nombre, especie, días sanos, brillo
   y modo de pantalla; la `calibracion` del sensor si se hizo desde la app, y
   `calibrando: true` mientras la app la está haciendo ([riego.md](riego.md));
   y, si hay una versión nueva para su placa y su canal, el manifiesto
   `firmware: { version, url, sha256, firma, tamano }`.

**Cuánto puede hablar.** Un aparato sano sincroniza cada 15 minutos, o cada 5
segundos mientras la app calibra (10 minutos como mucho). Por encima de **120
pedidos en 5 minutos** se le contesta `429` hasta que se calme: un firmware en
bucle o alguien con un token ajeno no se lleva puesto el servidor, y el de al
lado sigue andando. Perder un sync no pierde lecturas: el aparato las reenvía
hasta que el servidor las acepta. Equivocarse de token desde una misma IP más
de 60 veces en 10 minutos también corta: adivinarlo es imposible, pero cada
intento cuesta un hash y una consulta.

### `GET /api/d/firmware/:id`

El binario de una actualización, con el token del aparato (no es público:
sin token de aparato, `401`). `404` si esa publicación se retiró.

### `POST /api/d/demo`

Sólo para el emulador (`placa: "emulador"`; una placa real recibe `403`),
con el mismo token que el sync: `{ id, accion }` → `{ ok, mascota }`.

| `accion` | Qué hace |
|---|---|
| `tres-dias` | corre hacia atrás el reloj de la mascota 3 días y 1 hora: aparece el polvo y baja la felicidad |
| `gotas` | suma 3 gotas de rocío (hasta 9) |

No toca lecturas, días sanos ni nada que desbloquee algo. `409` con el cofre
cerrado, `400` con otra acción.

## De la app

Todas con `Authorization: Bearer <token de sesión>`, salvo las marcadas. Sin
sesión (o con una vencida) responden `401`, y cada una ve sólo las plantas de
su cuenta: pedir la planta de otra cuenta da `404`, igual que si no existiera.

**Preguntar si cambió.** Cada lectura vuelve con su `ETag` y con
`Cache-Control: no-store` (nada queda en el disco del teléfono). Repitiendo
esa etiqueta en `If-None-Match`, una respuesta que no cambió es un `304` sin
cuerpo. La app lo hace sola, guardando la última en memoria
(`public/lib/api.mjs`).

En `/api/estado` la etiqueta no sale de los bytes sino de una **firma** que
mide la edad de la lectura como la muestra la pantalla ("hace 3 min") en vez
de en segundos: si no, cada consulta sería distinta y nunca habría un `304`.
El cuerpo, cuando llega, trae los segundos exactos como siempre.

**Comprimido.** Lo que pasa de 1 KB sale con brotli o gzip si el cliente lo
acepta (`Accept-Encoding`), con `Vary: accept-encoding`.

### Cuenta

| | |
|---|---|
| `POST /api/cuenta/registro` *(sin sesión)* | `{ email, clave, nombre?, tz? }` → `201 { token, cuenta }` · `409` si el email ya tiene cuenta. Manda el email de verificación |
| `POST /api/cuenta/entrar` *(sin sesión)* | `{ email, clave }` → `{ token, cuenta }` · `401 Email o contraseña incorrectos.` |
| `POST /api/cuenta/salir` | cierra esta sesión → `204` |
| `GET /api/cuenta` | `cuenta` |
| `PATCH /api/cuenta` | `{ nombre?, tz?, paleta?, ubicacion? }` → `cuenta` · `403` si la paleta es de una piel que no te salió o una cosmética que todavía no se ganó ([paletas.md](paletas.md)) · `ubicacion`: una ciudad, que se busca y se guarda cifrada para el pronóstico (`''` la quita; `404` si no existe; ver [clima.md](clima.md)) |
| `POST /api/cuenta/clave` | `{ actual, nueva }` → `{ ok }`; cierra las sesiones de los otros teléfonos y avisa por email |
| `DELETE /api/cuenta` | `{ clave }` → `204`; borra cuenta, plantas, lecturas, charlas y avisos, y libera los Rooties |
| `POST /api/cuenta/olvide` *(sin sesión)* | `{ email }` → `202 { ok }` **siempre**; si hay cuenta, manda el enlace `#clave/<token>` (30 min, un uso) |
| `GET /api/cuenta/restablecer?token=` *(sin sesión)* | `{ valido }`: para no pedir la contraseña nueva con un enlace vencido |
| `POST /api/cuenta/restablecer` *(sin sesión)* | `{ token, clave }` → `{ token, cuenta }`: cierra todas las sesiones, marca el email como verificado, avisa por email y abre una sesión nueva · `400` si el enlace venció o ya se usó |
| `POST /api/cuenta/verificar` *(sin sesión)* | `{ token }` → `{ ok }` · `400` si venció (48 h) o ya se usó |
| `POST /api/cuenta/verificar/reenviar` | `202`; 3 por hora |

`cuenta` es `{ id, email, nombre, tz, coleccion, paleta, plan, email_verificado, ia, avisos, plantas, creada }`,
donde `ia` son las cuotas diarias de su plan (`{ chat, identificar, diagnosticar }`).

- **Email**: se guarda en minúsculas y sin espacios; `Rocio@Ejemplo.com` y
  `rocio@ejemplo.com` son la misma cuenta.
- **Email y nombre**: se guardan cifrados; el email se busca por índice ciego.
- **Contraseña**: al menos 8 caracteres (`clave_min` en `/api/config`),
  como mucho 200. Argon2id con pimienta:
  `argon2id$p1$m=19456,t=2,p=1$<sal>$<hash>`. Nunca vuelve en ninguna
  respuesta. Detalle en [seguridad.md](seguridad.md).
- **Sesión**: token aleatorio de 32 bytes; el servidor guarda sólo su
  SHA-256. Vence a los 180 días sin uso (el uso se anota como mucho una vez por hora). Entrar desde
  otro teléfono abre otra sesión sin cerrar las demás.
- **Errores de entrada**: el mismo mensaje y el mismo tiempo de respuesta si
  el email no existe o la contraseña está mal, para no revelar qué emails
  tienen cuenta.
- **Límites**: registro 10 por hora por IP; entrar 30 cada 15 minutos por IP
  y 10 por email; olvidé mi contraseña 10 por hora por IP y 3 por email;
  cambiar contraseña 10 y borrar la cuenta 5 cada 15 minutos. Pasado el
  límite, `429`.
- Los emails: [correo.md](correo.md).

### Vínculo

| | |
|---|---|
| `GET /api/vinculo/:codigo` *(sesión opcional)* | `{ codigo, legible, ssid, visto, en_linea, libre, mio, planta, estado, persona }`; `persona` es `{ id, nombre, lema }` del Rooti de la figura en cuanto el aparato se conectó |
| `POST /api/vinculo` | `{ codigo }` → `201` planta · `409` si el Rooti no se conectó o es de otra cuenta |

El código se normaliza como lo tipea una persona (minúsculas, guiones, O→0,
I/L→1). La consulta tiene límite de 90 por minuto por IP: son 40 bits, pero
no hace falta regalar intentos.

### Plantas

| | |
|---|---|
| `GET /api/estado` | `{ cuenta, nodes, especies, coleccion, avisos }`. Lo que lee el tablero cada 15 s; si nada cambió, `304` (ver abajo) |
| `GET /api/plantas/:id` | la planta |
| `PATCH /api/plantas/:id` | `{ nombre?, especie?, pantalla?, brillo?, calibracion?, maceta? }`. Con la especie nace la ficha de cuidados; con nombre y especie, el prompt del chat. `calibracion: { seco, mojado }` (o `null` para volver a la de fábrica; `400` con el motivo si no sirve) y `maceta: { diametro_cm, alto_cm? }` (o `null`): ver [riego.md](riego.md) |
| `POST /api/plantas/:id/calibrar` | `{ activo? }`: abre (o cierra, con `false`) la ventana de 10 minutos en la que el Rooti mide y cuenta cada 5 s → la planta |
| `DELETE /api/plantas/:id` | desvincula: la maceta vuelve al QR con código nuevo. La planta y sus lecturas quedan guardadas en la cuenta |
| `POST /api/cofre/abrir` | `{ planta }`: abre el cofre, que sortea la **piel** del Rooti que ya se sabe cuál es (común 70 %, rara 25 %, épica 5 %), una sola vez por vínculo → `{ id, nombre, lema, rareza, piel: { id, nombre, fondo, ojos, piel, rubor, adornos }, fondo, nuevo, probabilidad, de_fabrica, planta, paleta, pinta }`. `nuevo`: la piel no estaba en la colección; `pinta`: la cuenta pasó a usar la paleta de la piel (sólo la primera vez que se abre). Ver [rooties.md](rooties.md) |
| `POST /api/plantas/:id/cofre` | lo mismo, con la planta en la ruta |
| `POST /api/plantas/:id/mascota` | `{ accion: "caricia" \| "limpiar" \| "snack" }` → `{ accion, suma, motivo, mascota }`. La caricia suma 5 una vez cada 4 h (antes, `suma: 0` y `motivo: "espera"`); limpiar suma 10 si hay polvo; el snack suma 15 y gasta una gota · `409` sin polvo, sin gotas o con el cofre cerrado · `400` otra acción. Ver [mascota.md](mascota.md) |
| `GET /api/plantas/:id/historial?horas=48` | `{ total, puntos: [{ t, soil_pct, temp_dc, rh_pct, lux, mood, escurre? }] }`: `horas` hasta 8784 (un año), promediado en hasta 240 puntos; `total` es la cantidad de lecturas guardadas en esa ventana |
| `GET /api/plantas/:id/prevision` | cuándo va a tener sed con el clima que viene: `{ disponible, motivo? , horas_hasta_sed, cuando, tasa_pct_h, factor, clima, ubicacion }`. Ver [clima.md](clima.md) |
| `POST /api/plantas/:id/cuidador` | `{ dias: 3 \| 7 \| 15, nombre? }` → `201 { url, vence, dias, nombre }`: el enlace `/sitter/<token>` para quien cuida la planta · `409` con el cofre cerrado. Ver [cuidador.md](cuidador.md) |
| `GET /api/plantas/:id/cuidador` | `{ enlaces: [{ creado, vence, nombre, usos }], riegos }` |
| `DELETE /api/plantas/:id/cuidador` | revoca todos los enlaces → `204` |
| `GET /api/sitter/:token` *(sin sesión)* | lo que ve el cuidador: `{ planta, dueno, cuidador, vence, riegos, ahora }` · `404` vencido o revocado |
| `POST /api/sitter/:token/riego` *(sin sesión)* | `{ quien? }` → `201 { ok, t }`: anota el riego y le avisa al dueño |
| `GET /api/plantas/:id/fotos` | el álbum: `{ fotos: [{ id, t, mime, ancho, alto, nota, origen, peso }], maximo }`. Ver [album.md](album.md) |
| `POST /api/plantas/:id/fotos` | `{ image_b64, mime, nota? }` → `201 { id, t }` · `413` más de 450 KB · `409` álbum lleno |
| `GET /api/plantas/:id/fotos/:fid` | los bytes de la foto, con su `content-type` |
| `DELETE /api/plantas/:id/fotos/:fid` | `204` |

`especie` acepta un id del catálogo o un objeto completo
(`{ id, nombre, cientifico, soil_min, soil_max, temp_min_dc, temp_max_dc, rh_min, lux_min, lux_max }`),
que se valida y se acota igual que en el firmware.

Una planta en `nodes`:

```json
{
  "id": "p3f2a...", "nombre": "Rulo", "modelo": "brote", "rareza": "raro", "revelado": true,
  "especie": "monstera", "especie_info": { "...": "..." },
  "ficha": { "cuidados": { "riego": "...", "luz": "...", "sustrato": "..." }, "dificultad": "intermedia", "fuente": "ia" },
  "chat": true,
  "link": "VIVO", "mood": "THIRSTY", "severity": "URGENT", "reason": "tengo sed",
  "tel": { "soil_pct": 12, "temp_dc": 231, "rh_pct": 58, "lux": 5200,
           "suelo_dc": null, "batt_mv": 3900, "usb": false, "age_s": 30,
           "escurre": false, "suelo_raw": 2175 },
  "nodo": { "id": "A1B2...", "batt_pct": 76, "usb": false, "rssi": -60,
            "fw": "0.6.0", "placa": "c3-supermini", "en_linea": true,
            "actualizacion": { "version": "0.6.0", "canal": "estable", "disponible": null, "estado": "ok", "intento": "0.6.0" } },
  "bond": { "dias_vividos": 40, "dias_sanos": 34, "racha": 8, "mejor_racha": 19 },
  "pantalla": "toque", "brillo": 80,
  "calibracion": { "seco": 2950, "mojado": 1400, "t": 1789000000000 }, "calibrando": false,
  "maceta": { "diametro_cm": 16 }, "agua_ml": 540,
  "mascota": { "felicidad": 72, "polvo": 0, "gotas": 2, "caricia_en_ms": 0,
               "optimo_pct": 40, "ultima_interaccion": 1789000000000 },
  "salud": 100
}
```

`modelo` es el Rooti de la figura, conocido desde el vínculo; `rareza` es
`null` hasta abrir el cofre. `mascota` es `null` antes del cofre. `salud`
(0 a 100, o `null` sin datos) sale de la severidad y de qué tan centrada
está la tierra en el rango de la especie: la barra biológica, que no se
sube con mimos.

`link`: `VIVO` (< 45 min), `TIBIO` (< 6 h), `CAIDO`, `NUNCA`. Con `CAIDO` el
ánimo se muestra como `OFFLINE`.

`riego`: `{ t, origen, quien }` o `null`: el último riego anotado a mano (hoy,
desde el enlace del cuidador) si es de las últimas 48 h. La app esconde la
tarea de regar dos horas después de uno.

`tel.escurre`: el Rooti detectó que el último riego se escurrió por los
costados sin empapar (viene en cada lectura como `escurre: true` o el bit 16
de `fallas`, ver `root-kit/docs/nube.md`). La app lo convierte en la tarea
"el agua se escurrió" y en un aviso, y el chat lo sabe.

### IA: fotos y chat

| | |
|---|---|
| `POST /api/identificar` | `{ planta, image_b64, mime }` → `{ especie, catalogo, confianza, alternativas, fuente, cuota }` · `403` sin `planta` (hace falta un Rooti) · `409` con el cofre cerrado |
| `POST /api/diagnosticar` | `{ planta, image_b64, mime }` → `{ hallazgos, confianza, observacion, fuente, cuota }` |
| `GET /api/plantas/:id/chat` | `{ disponible, mensajes: [{ t, rol, texto }], cuota, plan, ia }` (hasta 60 mensajes) |
| `POST /api/plantas/:id/chat` | `{ texto }` (1 a 500 caracteres) → `{ mensajes: [persona, planta], cuota, fuente }` · `409` sin nombre o especie |

`cuota` es `{ usados, limite, restantes }` del día, en la zona de la cuenta.
Sin cuota: `429` con `cuota` en el cuerpo. Con el tope de gasto alcanzado:
`503`. Si la IA falla: `502` con un mensaje para la persona. Límites, precios
y el prompt: [ia.md](ia.md).

`chat` es `false` también cuando el servidor no tiene una IA de verdad
(`ia_visible` en `/api/config`): entonces `GET …/chat` responde
`{ disponible: false, motivo: "ia" }` y reconocer, diagnosticar y charlar dan
`503`.

### Colección, avisos y métricas

| | |
|---|---|
| `GET /api/coleccion` | `{ tengo, total, probabilidades, catalogo }`. La colección es de **pieles**: `tengo` son ids como `brote-epico`, `total` es 15, `probabilidades` es `{ comun: 700, raro: 250, epico: 50 }` (milésimas) y cada Rooti del `catalogo` trae `{ id, nombre, lema, carcasa, fondo, tengo, pieles: [{ id, rareza, nombre, fondo, ojos, piel, rubor, adornos, tengo, probabilidad, paleta }] }` |
| `GET /api/push/clave` | `{ clave }` VAPID pública |
| `POST /api/push/suscripcion` | `{ suscripcion }` |
| `DELETE /api/push/suscripcion` | `{ endpoint }` |
| `POST /api/push/probar` | manda una de prueba: `{ enviados }` |
| `POST /api/evento` *(sin sesión)* | `{ evento }`: un contador anónimo, `alta:<paso>` o `vista:<pantalla>` → `204` · `400` si no está en la lista. Ver [operacion.md](operacion.md) |
| `GET /api/config` *(sin sesión)* | `{ version, ia, ia_visible, firmware_publica, push, url_publica, probabilidades, clave_min, chat_max, cuotas }` |
| `GET /api/salud` *(sin sesión)* | `{ ok, version, esquema, activo_s, cuentas, dispositivos, plantas, lecturas }` |

## De la administración

`/api/admin/*`, con `Authorization: Bearer <ROOTLAB_ADMIN_CLAVE>`: estado,
métricas, aparatos (la estación de fábrica, canales, deshabilitar) y firmware
(publicar firmado, listar, retirar). Sin la clave configurada, esas rutas no
existen. La tabla completa y cómo se usa cada una: [operacion.md](operacion.md).
