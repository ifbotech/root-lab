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
   token (confianza al primer uso) salvo que `ROOTLAB_TOFU=0`.
2. Si el aparato está vinculado pero llega con otra **época**, alguien lo
   reinició con el botón: se rompe el vínculo.
3. Guarda el estado y, si viene, el código actual con su época.
4. Guarda las lecturas nuevas. Lo que no avanza en el reloj del aparato ya se
   había guardado y se ignora; igual cuenta como aceptado para que el aparato
   lo borre.
5. Avanza los días sanos de la planta con el día local de la cuenta.
6. Manda las notificaciones que correspondan.
7. Responde vínculo, cofre, personaje, nombre, especie, días sanos, brillo y
   modo de pantalla.

## De la app

Todas con `Authorization: Bearer <token de sesión>`, salvo las marcadas. Sin
sesión (o con una vencida) responden `401`, y cada una ve sólo las plantas de
su cuenta: pedir la planta de otra cuenta da `404`, igual que si no existiera.

### Cuenta

| | |
|---|---|
| `POST /api/cuenta/registro` *(sin sesión)* | `{ email, clave, nombre?, tz? }` → `201 { token, cuenta }` · `409` si el email ya tiene cuenta. Manda el email de verificación |
| `POST /api/cuenta/entrar` *(sin sesión)* | `{ email, clave }` → `{ token, cuenta }` · `401 Email o contraseña incorrectos.` |
| `POST /api/cuenta/salir` | cierra esta sesión → `204` |
| `GET /api/cuenta` | `cuenta` |
| `PATCH /api/cuenta` | `{ nombre?, tz?, paleta? }` → `cuenta` · `403` si la paleta es de un Rooti que no tenés |
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
| `GET /api/vinculo/:codigo` *(sesión opcional)* | `{ codigo, legible, ssid, visto, en_linea, libre, mio, planta, estado }` |
| `POST /api/vinculo` | `{ codigo }` → `201` planta · `409` si el Rooti no se conectó o es de otra cuenta |

El código se normaliza como lo tipea una persona (minúsculas, guiones, O→0,
I/L→1). La consulta tiene límite de 90 por minuto por IP: son 40 bits, pero
no hace falta regalar intentos.

### Plantas

| | |
|---|---|
| `GET /api/estado` | `{ cuenta, nodes, especies, coleccion, avisos, hora }` |
| `GET /api/plantas/:id` | la planta |
| `PATCH /api/plantas/:id` | `{ nombre?, especie?, pantalla?, brillo? }`. Con la especie nace la ficha de cuidados; con nombre y especie, el prompt del chat |
| `DELETE /api/plantas/:id` | desvincula: la maceta vuelve al QR con código nuevo. La planta y sus lecturas quedan guardadas en la cuenta |
| `POST /api/plantas/:id/cofre` | abre el cofre: `{ id, nombre, rareza, lema, fondo, nuevo, probabilidad, de_fabrica, planta, paleta, pinta }`. `pinta`: el Rooti tiene paleta propia y la cuenta pasó a usarla |
| `GET /api/plantas/:id/historial?horas=48` | `{ total, puntos: [{ t, soil_pct, temp_dc, rh_pct, lux, mood }] }`: `horas` hasta 8784 (un año), promediado en hasta 240 puntos; `total` es la cantidad de lecturas guardadas en esa ventana |

`especie` acepta un id del catálogo o un objeto completo
(`{ id, nombre, cientifico, soil_min, soil_max, temp_min_dc, temp_max_dc, rh_min, lux_min, lux_max }`),
que se valida y se acota igual que en el firmware.

Una planta en `nodes`:

```json
{
  "id": "p3f2a...", "nombre": "Rulo", "modelo": "kawaii", "revelado": true,
  "especie": "monstera", "especie_info": { "...": "..." },
  "ficha": { "cuidados": { "riego": "...", "luz": "...", "sustrato": "..." }, "dificultad": "intermedia", "fuente": "ia" },
  "chat": true,
  "link": "VIVO", "mood": "THIRSTY", "severity": "URGENT", "reason": "tengo sed",
  "tel": { "soil_pct": 12, "temp_dc": 231, "rh_pct": 58, "lux": 5200,
           "suelo_dc": null, "batt_mv": 3900, "usb": false, "age_s": 30 },
  "nodo": { "id": "A1B2...", "batt_pct": 76, "usb": false, "rssi": -60,
            "fw": "0.5.0", "placa": "c3-supermini", "en_linea": true },
  "bond": { "dias_vividos": 40, "dias_sanos": 34, "racha": 8, "mejor_racha": 19 },
  "pantalla": "toque", "brillo": 80
}
```

`link`: `VIVO` (< 45 min), `TIBIO` (< 6 h), `CAIDO`, `NUNCA`. Con `CAIDO` el
ánimo se muestra como `OFFLINE`.

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

### Colección y avisos

| | |
|---|---|
| `GET /api/coleccion` | `{ tengo, total, probabilidades, catalogo }` (el secreto no aparece hasta que sale; cada Rooti trae `paleta` si tiene una) |
| `GET /api/push/clave` | `{ clave }` VAPID pública |
| `POST /api/push/suscripcion` | `{ suscripcion }` |
| `DELETE /api/push/suscripcion` | `{ endpoint }` |
| `POST /api/push/probar` | manda una de prueba: `{ enviados }` |
| `GET /api/config` *(sin sesión)* | `{ version, ia, push, url_publica, probabilidades, clave_min, chat_max, cuotas }` |
| `GET /api/salud` *(sin sesión)* | `{ ok, version, esquema, activo_s, cuentas, dispositivos, plantas, lecturas }` |
