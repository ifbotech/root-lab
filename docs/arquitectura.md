# Arquitectura

```
   ROOTKIT (placa o emulador)                 root-lab
  ┌─────────────────────────┐  POST        ┌──────────────────────────────┐
  │ firmware: sensores,     │ /api/d/sync  │ server/api.mjs               │
  │ ánimo, QR, ojos         │ ───────────► │  dispositivos · plantas ·    │
  │                         │ ◄─────────── │  cuentas · lecturas · cofre  │
  └─────────────────────────┘  vínculo,    │                              │
                               especie...  │ server/avisos.mjs ─► push.mjs│──► Web Push
                                           │ server/ia.mjs ─────► Claude  │
                                           └──────────────▲───────────────┘
                                                          │ /api/...
                                           ┌──────────────┴───────────────┐
                                           │ public/ (PWA)                 │
                                           │ alta · tablero · colección    │
                                           │ caras: firmware en WASM       │
                                           └───────────────────────────────┘
```

## Tres reglas

**1. La maceta decide su cara.** El ánimo lo evalúa el firmware con los
umbrales de la especie, y llega ya resuelto en cada lectura (`animo`, `sev`).
El servidor no lo recalcula: si lo hiciera, la maceta y el teléfono podrían
mostrar caras distintas de la misma planta.

**2. La nube decide lo que necesita ver el día entero.** Días sanos, racha,
cuándo avisar, si un aparato dejó de reportar. La maceta duerme la mayor parte
del tiempo; la nube no.

**3. Las caras se dibujan una sola vez.** `public/caras/rootkit_caras.wasm` es
el firmware compilado. La app, el emulador y las imágenes de las
notificaciones salen de ahí. `npm run firmware` lo actualiza desde root-kit.

## Datos

Una base SQLite en el servidor (`<ROOTLAB_DATOS>/rootkit.db`), con el módulo
`node:sqlite` que trae Node 22.13+ (sin dependencias nativas que compilar).
`server/db.mjs` es el único archivo que escribe SQL; el resto del servidor
llama funciones como `plantasDe(cuenta)` o `lecturaInsertar(...)`.

Por qué SQLite y no un servidor de base de datos: un solo proceso escribe,
las lecturas llegan de a una por aparato cada pocos minutos y el respaldo es
copiar un archivo. Con WAL aguanta miles de macetas en el VPS actual. Si algún
día hace falta más de un servidor, las tablas pasan tal cual a PostgreSQL y
sólo cambia `db.mjs`.

| Tabla | Clave | Qué guarda |
|---|---|---|
| `cuentas` | id | email (único, sin distinguir mayúsculas), nombre, hash scrypt de la contraseña, zona horaria, colección |
| `sesiones` | SHA-256 del token | cuenta, creada, último uso, navegador |
| `dispositivos` | id del aparato | hash del token, último estado, código actual y su época, última lectura |
| `plantas` | id | cuenta, aparato, época del vínculo, personaje, cofre, nombre, especie, días sanos, pantalla, `desvinculada` |
| `lecturas` | id | planta, aparato, hora, suelo, temperaturas, humedad, luz, batería, ánimo y severidad |
| `suscripciones` | endpoint | cuenta y suscripción Web Push (hasta 10 teléfonos por cuenta) |
| `avisos` | planta + tipo | cuándo se mandó cada tipo de aviso |
| `meta` | clave | versión del esquema |

**Cada cuenta ve sólo lo suyo.** Toda consulta de la app parte de la cuenta
de la sesión: `plantasDe(cuenta)`, y una planta pedida por id se compara con
esa cuenta antes de devolverla. Una planta ajena responde `404`, igual que una
inexistente, para no confirmar que existe.

**Una planta es un vínculo.** Existe desde que una cuenta reclama un aparato
hasta que se desvincula. Cada lectura se guarda con la planta a la que
pertenecía en ese momento: lo que midió el aparato para el dueño anterior no
es de nadie más.

**Las lecturas no se borran.** Una por cada muestra del aparato (cada 15
minutos en uso normal: ~35.000 por maceta por año, unos 3 MB). Desvincular
marca la planta con `desvinculada` y la saca del tablero, pero su historial
queda en la cuenta. Sólo borrar la cuenta borra sus lecturas.

**Respaldos.** `tools/respaldar.mjs` hace `VACUUM INTO` (copia consistente
aunque el servidor esté escribiendo) en `<datos>/respaldos/` y conserva 14
días. En el VPS lo corre un timer de systemd todos los días, y
`deploy/instalar.sh` hace uno antes de cada actualización.

## La app

PWA sin build: HTML, CSS y módulos ES. Se instala desde el QR, abre a
pantalla completa y se actualiza sola. El service worker cachea el armazón y
**nunca** los datos: una lectura vieja mostrada como actual hace regar una
planta mojada.

Todas las rutas son relativas a la base donde está montada la app (en el
VPS, `/rootkit`). El servidor escribe `<base href>` en cada página y el
cliente arma lo demás con `lib/base.mjs`, así el mismo código anda en la raíz
de un dominio o debajo de una ruta.

| Ruta | Vista |
|---|---|
| `/v/<CÓDIGO>` | el alta de ese ROOTKIT (o su planta, si ya es tuyo) |
| `/#hoy` | caras, tareas, contadores, nivel |
| `/#plantas`, `/#planta/<id>` | lista y detalle |
| `/#diagnostico/<id>`, `/#especie/<id>` | cámara |
| `/#coleccion`, `/#ajustes`, `/#agregar` | |
| `/#entrar` | crear cuenta o entrar; es lo que se ve sin sesión |

## Cuentas

Email y contraseña. Al crear la cuenta o entrar, el servidor devuelve un token
de sesión que el teléfono guarda (`localStorage`, `rootkit:token`) y manda en
cada pedido. Entrar con el mismo email en otro teléfono muestra las mismas
plantas; salir en uno no cierra los otros; cambiar la contraseña sí.

Sin sesión, la app sólo muestra el alta (que tiene su propio paso de cuenta),
la carga de un código a mano y `#entrar`. Si el servidor responde `401` en
cualquier momento, la app borra el token y vuelve a pedir entrar.

Detalles de contraseñas, sesiones y límites en [api.md](api.md#cuenta).
