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

Todas con `Authorization: Bearer <token de la cuenta>`, salvo las marcadas.

### Cuenta

| | |
|---|---|
| `POST /api/cuenta` *(sin sesión)* | `{ tz }` → `201 { token, id }` |
| `GET /api/cuenta` | `{ id, tz, coleccion, avisos, plantas }` |
| `PATCH /api/cuenta` | `{ tz }` |
| `POST /api/cuenta/transferir` | `201 { codigo, vence }`: 6 caracteres, 10 minutos, un uso |
| `POST /api/cuenta/recuperar` *(sin sesión)* | `{ codigo }` → `{ token, id }` |

### Vínculo

| | |
|---|---|
| `GET /api/vinculo/:codigo` *(sesión opcional)* | `{ codigo, legible, ssid, visto, en_linea, libre, mio, planta, estado }` |
| `POST /api/vinculo` | `{ codigo }` → `201` planta · `409` si la maceta no se conectó o es de otra cuenta |

El código se normaliza como lo tipea una persona (minúsculas, guiones, O→0,
I/L→1). La consulta tiene límite de 90 por minuto por IP: son 40 bits, pero
no hace falta regalar intentos.

### Plantas

| | |
|---|---|
| `GET /api/estado` | `{ nodes, especies, coleccion, avisos, hora }` |
| `GET /api/plantas/:id` | la planta |
| `PATCH /api/plantas/:id` | `{ nombre?, especie?, pantalla?, brillo? }` |
| `DELETE /api/plantas/:id` | desvincula: la maceta vuelve al QR con código nuevo |
| `POST /api/plantas/:id/cofre` | abre el cofre: `{ id, nombre, rareza, lema, fondo, nuevo, probabilidad, de_fabrica, planta }` |
| `GET /api/plantas/:id/historial?horas=48` | `{ puntos: [{ t, soil_pct, temp_dc, rh_pct, lux, mood }] }`, hasta 240 puntos |

`especie` acepta un id del catálogo o un objeto completo
(`{ id, nombre, cientifico, soil_min, soil_max, temp_min_dc, temp_max_dc, rh_min, lux_min, lux_max }`),
que se valida y se acota igual que en el firmware.

Una planta en `nodes`:

```json
{
  "id": "p3f2a...", "nombre": "Rulo", "modelo": "kawaii", "revelado": true,
  "especie": "monstera", "especie_info": { "...": "..." },
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

### Fotos

| | |
|---|---|
| `POST /api/identificar` | `{ image_b64, mime }` → `{ especie, catalogo, confianza, alternativas, fuente }` |
| `POST /api/diagnosticar` | `{ planta, image_b64, mime }` → `{ hallazgos, confianza, observacion, fuente }` |

30 por hora por cuenta. Ver [ia.md](ia.md).

### Colección y avisos

| | |
|---|---|
| `GET /api/coleccion` | `{ tengo, total, probabilidades, catalogo }` (el secreto no aparece hasta que sale) |
| `GET /api/push/clave` | `{ clave }` VAPID pública |
| `POST /api/push/suscripcion` | `{ suscripcion }` |
| `DELETE /api/push/suscripcion` | `{ endpoint }` |
| `POST /api/push/probar` | manda una de prueba: `{ enviados }` |
| `GET /api/config` *(sin sesión)* | `{ version, ia, push, url_publica, probabilidades }` |
