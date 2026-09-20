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
| `cuentas` | id | email **cifrado** + índice ciego (único), nombre **cifrado**, hash Argon2id, zona horaria, colección de pieles (`kip-epico`...), paleta, plan, email verificado, ciudad **cifrada** (para el pronóstico) |
| `sesiones` | SHA-256 del token | cuenta, creada, último uso, navegador |
| `tokens_cuenta` | SHA-256 del token | enlaces de un uso: restablecer la contraseña, verificar el email; vencimiento |
| `dispositivos` | id del aparato | hash del token, último estado, código actual y su época, última lectura, **canal** de firmware, estado de su última actualización, **lote**, **origen** (fábrica, tofu o emulador) y si está deshabilitado |
| `plantas` | id | cuenta, aparato, época del vínculo, Rooti (`persona`), cofre, **rareza** de la piel, **mascota** (felicidad, polvo, gotas de rocío), **calibración** del sensor, **maceta**, nombre, especie, días sanos, pantalla, `desvinculada`, **ficha** de cuidados, **prompt** del chat, último reconocimiento |
| `lecturas` | id | planta, aparato, hora, suelo, temperaturas, humedad, luz, batería, ánimo y severidad |
| `chat` | id | planta, cuenta, hora, quién habla, mensaje **cifrado** |
| `ia_uso` | id | cada llamada a la IA: tipo, modelo, tokens, costo en micro-dólares, día local |
| `suscripciones` | endpoint | cuenta y suscripción Web Push (hasta 10 teléfonos por cuenta) |
| `avisos` | planta + tipo | cuándo se mandó cada tipo de aviso |
| `clima` | cuenta | el último pronóstico pedido a Open-Meteo para la ciudad de la cuenta (6 h) |
| `cuidadores` | SHA-256 del token | planta, cuenta, nombre, hasta cuándo vale, usos: el enlace `/sitter/<token>` |
| `riegos` | id | planta, hora, origen, quién: los riegos anotados a mano |
| `fotos` | id | planta, cuenta, hora, tipo, **los bytes** (hasta 450 KB, 60 por planta), nota, origen: el álbum |
| `firmware` | id | versión, placa, canal, SHA-256, **firma**, tamaño, notas, el binario; retirado |
| `eventos` | día + evento | contadores anónimos: cuántas veces pasó cada cosa cada día, sin cuenta ni planta |
| `meta` | clave | versión del esquema (7), marcas de alertas (gasto, vigía) |

**Migraciones.** `db.mjs` sabe llevar una base v1 (email en claro, scrypt) a
v2: reconstruye `cuentas` cifrando cada email con la receta de 12 pasos de
SQLite, agrega las columnas y tablas nuevas y verifica las claves foráneas,
todo en una transacción. Las contraseñas scrypt se rehacen con Argon2id la
próxima vez que la persona entra. De v5 a v6 llegan los cinco Rooties
botánicos: se agregan `rareza` y `mascota` a `plantas`, los Rooties de la
primera tanda pasan al más parecido de los nuevos con una rareza equivalente
(`LEGADO` en `server/cofre.mjs`: el secreto pasa a Plum épico) en plantas,
aparatos y colecciones, y las paletas de Chico Malo y Chica Chill pasan a la
piel común del Blink y del Nori. De v6 a v7 (actualizaciones por aire,
fábrica, calibración y métricas) sólo se agregan columnas y tablas; los
aparatos que se presentaron como emulador quedan marcados como tales.

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

## Lo que el teléfono no gasta

Muchas macetas están en casas con datos móviles medidos, y la app se abre
muchas veces por día. Dos piezas en `server/estatico.mjs`, sin dependencias:

**Comprimido.** Todo lo que es texto —el HTML, la hoja de estilos, los 44
módulos, el JSON de la API, el renderer en WebAssembly— sale con brotli o
gzip, el que entienda el cliente. Lo que ya viene comprimido (las caras en
PNG, las fuentes) no se toca, ni lo que no encoge. Cada cuerpo se comprime una
vez y queda guardado en memoria, con su etiqueta de clave. El armazón pasó de
281 KB a 89 KB.

**Revalidado.** Cada respuesta lleva su `ETag`. El armazón se sirve con
`no-cache` —el service worker maneja su caché y el navegador siempre
pregunta—, y esa pregunta ahora termina en un `304` vacío en vez de bajar todo
otra vez: la segunda carga de la app son 6 KB.

**El tablero que no cambió.** `/api/estado` se relee cada quince segundos y
casi nunca cambia; lo que cambiaba siempre era el tiempo (la edad de la
lectura en segundos, la espera de la caricia). La ruta manda junto a la
respuesta una **firma**: lo mismo que la app usa para decidir si repinta
(`firmaTablero` en `public/lib/model.mjs`), que mide la edad como la muestra
la pantalla ("hace 3 min") y no en segundos. La etiqueta sale de esa firma, y
un tablero igual vuelve como un `304` vacío en vez de once kilobytes. La API
sigue con `no-store` —nada queda en el disco del teléfono—: la etiqueta la
repite la app a mano, desde memoria (`public/lib/api.mjs`).

Comprimir una respuesta con datos personales puede filtrarlos por su tamaño
(BREACH) cuando el atacante puede mezclar su entrada con un secreto y forzar
pedidos desde el navegador de la víctima. Acá no: la API se autentica con
`Authorization`, no con cookies, así que una página ajena no puede pedir nada
en nombre de nadie.

## La app

PWA sin build: HTML, CSS y módulos ES. Se instala desde el QR, abre a
pantalla completa y se actualiza sola. El service worker cachea el armazón y
**nunca** los datos: una lectura vieja mostrada como actual hace regar una
planta mojada. Lo que sí guarda la app, en IndexedDB y sabiendo de cuándo
es, es lo último que vio: abre en menos de 100 ms sin red, con la píldora
"Sin conexión", y los cambios hechos sin red esperan en una cola. Ver
[sin-red.md](sin-red.md).

Todas las rutas son relativas a la base donde está montada la app (en el
VPS, `/rootkit`). El servidor escribe `<base href>` en cada página y el
cliente arma lo demás con `lib/base.mjs`, así el mismo código anda en la raíz
de un dominio o debajo de una ruta.

| Ruta | Vista |
|---|---|
| `/v/<CÓDIGO>` | el alta de ese Rooti (o su planta, si ya es tuyo) |
| `/desk/<id>`, `/#desk/<id>` | el modo escritorio: la cara sola, a pantalla completa |
| `/sitter/<token>` | lo que ve el cuidador, sin sesión: la cara, qué necesita, "ya regué" |
| `/#invernadero` | todos los Rooties en un estante, mirándose |
| `/#album/<id>`, `/#pasaporte/<id>` | el álbum de fotos y el pasaporte botánico de una planta |
| `/#camara`, `/#charla` | los atajos del ícono: van a la primera planta que sirva |
| `/#hoy` | caras, tareas, contadores y el vínculo de cada planta |
| `/#plantas`, `/#planta/<id>` | lista y detalle (con la ficha de cuidados) |
| `/#chat/<id>` | charla con la planta |
| `/#diagnostico/<id>`, `/#especie/<id>` | cámara |
| `/#coleccion` | las quince pieles de los cinco Rooties, y los logros |
| `/#ajustes`, `/#agregar` | |
| `/#entrar` | crear cuenta o entrar; es lo que se ve sin sesión |
| `/#clave/<token>`, `/#verificar/<token>` | los enlaces de los emails |

**Paletas.** La interfaz no tiene colores escritos: todo son variables de CSS
que arma `lib/paletas.mjs` a partir de la paleta de la cuenta, con contraste
garantizado. Ver [paletas.md](paletas.md).

**Lo de todos los días adelante; lo de una vez, plegado.** La ficha de una
planta llegó a ser diez paneles abiertos uno abajo del otro: cuatro pantallas
de teléfono hasta el último. Ahora la cara, cómo está, el gráfico y el botón
de hablar están siempre a la vista, y lo que se toca una vez —la especie y sus
cuidados, el sensor y la maceta, el cuidador, el vínculo, los recuerdos, el
aparato— vive en secciones plegadas (`seccion()` en `lib/ui.mjs`). Ajustes
hace lo mismo con la paleta, la cuenta y el "sobre ROOTLAB". Cada título lleva
al costado lo que se sabría abriendo (si el sensor está calibrado, en qué
etapa va el vínculo, si el Rooti está enchufado), así casi nunca hay que
abrir. Son `<details>` de verdad: el teclado los abre, el lector de pantalla
dice si están abiertos y "buscar en la página" encuentra lo de adentro. Lo que
cada persona deja abierto se recuerda en su teléfono.

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
