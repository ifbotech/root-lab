# Arquitectura

**Nombres.** ROOTKIT es el hardware (la maceta con su placa y su carcasa).
Cada personaje que vive en un ROOTKIT es un **Rooti** (plural: Rooties).
**ROOTLAB** es la app y la nube: este repositorio.

```
   Rooti (placa o emulador)                   ROOTLAB (root-lab)
  ┌─────────────────────────┐  HTTPS        ┌──────────────────────────────────┐
  │ firmware: sensores,     │ /api/d/sync   │ server/api.mjs                   │
  │ ánimo, QR, ojos         │ ────────────► │  cuentas · plantas · lecturas    │
  │ (verifica el certificado│ ◄──────────── │  cofre · chat · paletas          │
  │  de la nube)            │  vínculo,     │                                  │
  └─────────────────────────┘  especie...   │ db.mjs ──► SQLite (datos cifrados)│
                                            │ avisos.mjs ─► push.mjs ──────────│──► Web Push
                                            │ ia.mjs + presupuesto.mjs ────────│──► Claude
                                            │ correo.mjs ──────────────────────│──► SMTP (Brevo)
                                            └───────────────▲──────────────────┘
                                                            │ /api/...
                                            ┌───────────────┴──────────────────┐
                                            │ public/ (PWA)                     │
                                            │ alta · tablero · chat · Rooties   │
                                            │ paletas · caras: firmware en WASM │
                                            └───────────────────────────────────┘
```

## Tres reglas

**1. El Rooti decide su cara.** El ánimo lo evalúa el firmware con los
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
`node:sqlite` de Node 24 (sin dependencias nativas que compilar). Los datos
personales van cifrados: ver [seguridad.md](seguridad.md).
`server/db.mjs` es el único archivo que escribe SQL; el resto del servidor
llama funciones como `plantasDe(cuenta)` o `lecturaInsertar(...)`.

Por qué SQLite y no un servidor de base de datos: un solo proceso escribe,
las lecturas llegan de a una por aparato cada pocos minutos y el respaldo es
copiar un archivo. Con WAL aguanta miles de macetas en el VPS actual. Si algún
día hace falta más de un servidor, las tablas pasan tal cual a PostgreSQL y
sólo cambia `db.mjs`.

| Tabla | Clave | Qué guarda |
|---|---|---|
| `cuentas` | id | email **cifrado** + índice ciego (único), nombre **cifrado**, hash Argon2id, zona horaria, colección de Rooties, paleta, plan, email verificado, ciudad **cifrada** (para el pronóstico) |
| `sesiones` | SHA-256 del token | cuenta, creada, último uso, navegador |
| `tokens_cuenta` | SHA-256 del token | enlaces de un uso: restablecer la contraseña, verificar el email; vencimiento |
| `dispositivos` | id del aparato | hash del token, último estado, código actual y su época, última lectura |
| `plantas` | id | cuenta, aparato, época del vínculo, Rooti, cofre, nombre, especie, días sanos, pantalla, `desvinculada`, **ficha** de cuidados, **prompt** del chat, último reconocimiento |
| `lecturas` | id | planta, aparato, hora, suelo, temperaturas, humedad, luz, batería, ánimo y severidad |
| `chat` | id | planta, cuenta, hora, quién habla, mensaje **cifrado** |
| `ia_uso` | id | cada llamada a la IA: tipo, modelo, tokens, costo en micro-dólares, día local |
| `suscripciones` | endpoint | cuenta y suscripción Web Push (hasta 10 teléfonos por cuenta) |
| `avisos` | planta + tipo | cuándo se mandó cada tipo de aviso |
| `clima` | cuenta | el último pronóstico pedido a Open-Meteo para la ciudad de la cuenta (6 h) |
| `cuidadores` | SHA-256 del token | planta, cuenta, nombre, hasta cuándo vale, usos: el enlace `/sitter/<token>` |
| `riegos` | id | planta, hora, origen, quién: los riegos anotados a mano |
| `meta` | clave | versión del esquema (4), marcas de alertas de gasto |

**Migraciones.** `db.mjs` sabe llevar una base v1 (email en claro, scrypt) a
v2: reconstruye `cuentas` cifrando cada email con la receta de 12 pasos de
SQLite, agrega las columnas y tablas nuevas y verifica las claves foráneas,
todo en una transacción. Las contraseñas scrypt se rehacen con Argon2id la
próxima vez que la persona entra.

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
| `/v/<CÓDIGO>` | el alta de ese Rooti (o su planta, si ya es tuyo) |
| `/desk/<id>`, `/#desk/<id>` | el modo escritorio: la cara sola, a pantalla completa |
| `/sitter/<token>` | lo que ve el cuidador, sin sesión: la cara, qué necesita, "ya regué" |
| `/#hoy` | caras, tareas, contadores, nivel |
| `/#plantas`, `/#planta/<id>` | lista y detalle (con la ficha de cuidados) |
| `/#chat/<id>` | charla con la planta |
| `/#diagnostico/<id>`, `/#especie/<id>` | cámara |
| `/#coleccion` | los Rooties |
| `/#ajustes`, `/#agregar` | |
| `/#entrar` | crear cuenta o entrar; es lo que se ve sin sesión |
| `/#clave/<token>`, `/#verificar/<token>` | los enlaces de los emails |

**Paletas.** La interfaz no tiene colores escritos: todo son variables de CSS
que arma `lib/paletas.mjs` a partir de la paleta de la cuenta, con contraste
garantizado. Ver [paletas.md](paletas.md).

**Lo que el teléfono le agrega a la cara.** La luz de la planta sobre la
cara, la caricia, la voz al escribir y el modo escritorio son sólo de la app:
la maceta no los tiene. Ver [sensorial.md](sensorial.md).

**Nada de terceros.** Fuentes, íconos y módulos se sirven desde la app, bajo
una política de contenido estricta. Ver [seguridad.md](seguridad.md). Lo único
que el **servidor** consulta afuera, además de la IA y el correo, es
Open-Meteo, con el nombre de la ciudad de la cuenta y nada más
([clima.md](clima.md)).

## Cuentas

Email y contraseña. Al crear la cuenta o entrar, el servidor devuelve un token
de sesión que el teléfono guarda (`localStorage`, `rootkit:token`) y manda en
cada pedido. Entrar con el mismo email en otro teléfono muestra las mismas
plantas; salir en uno no cierra los otros; cambiar la contraseña sí.

Olvidar la contraseña se resuelve por email con un enlace de un solo uso
([correo.md](correo.md)); al crear la cuenta llega otro para confirmar el
email.

Sin sesión, la app sólo muestra el alta (que tiene su propio paso de cuenta),
la carga de un código a mano y `#entrar`. Si el servidor responde `401` en
cualquier momento, la app borra el token y vuelve a pedir entrar.

Detalles de contraseñas, sesiones y límites en [api.md](api.md#cuenta).
