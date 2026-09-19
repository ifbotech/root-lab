# Operar ROOTLAB

Lo que hace falta para que el servicio ande cuando nadie lo mira: la clave de
administración, publicar firmware, registrar aparatos de fábrica, respaldos
fuera del servidor que se prueban solos, el vigía y las métricas. Instalar y
actualizar el servidor está en [despliegue.md](despliegue.md).

## La administración (`/api/admin/*`)

Todo lo de esta página que habla con el servidor usa una sola clave:
`ROOTLAB_ADMIN_CLAVE` en `/etc/root-lab.env` (el instalador la genera si
falta; mínimo 24 caracteres). Va como `Authorization: Bearer <clave>`.

- Sin la variable, las rutas **no existen** (404).
- Con una clave equivocada: `401`, y diez intentos fallidos en diez minutos
  bloquean esa IP.
- Una sesión de la app no sirve: son dos mundos.

Leerla (y guardarla en un gestor de contraseñas):

```bash
sudo grep ROOTLAB_ADMIN_CLAVE /etc/root-lab.env
```

| Ruta | Qué hace |
|---|---|
| `GET /api/admin/estado` | versión, esquema, cuentas, aparatos (reales, emuladores, de fábrica, deshabilitados), versiones de firmware en la calle, IA y su gasto, modo de confianza y el vigía |
| `GET /api/admin/metricas?dias=30` | los contadores anónimos, por día y en total |
| `GET /api/admin/aparatos` | todos los aparatos, sin el hash del token |
| `POST /api/admin/aparatos` | la estación de fábrica registra uno: `{ id, token_hash \| token, persona, lote?, canal?, reemplazar? }` |
| `PATCH /api/admin/aparatos/:id` | `{ canal?, deshabilitado?, lote? }` |
| `DELETE /api/admin/aparatos/:id` | da de baja uno que **nunca se vinculó** (un registro equivocado, o lo que entró cuando la confianza al primer uso estaba abierta). Si tiene o tuvo planta: `409`, se deshabilita |
| `PATCH /api/admin/lotes/:lote` | lo mismo para un lote entero (una partida fallada) |
| `GET /api/admin/firmware` | lo publicado |
| `POST /api/admin/firmware` | publica: `{ version, placa, canal, notas?, sha256?, firma, contenido_b64 }` |
| `DELETE /api/admin/firmware/:id` | retira una publicación |

**Las placas de antes de la fábrica.** Mientras la confianza al primer uso
estuvo abierta, cualquiera que se presentara quedaba registrado (`origen:
"tofu"`). Al pasar a `emulador` esos registros siguen valiendo —una placa de
desarrollo ya conocida sigue entrando—, así que conviene mirar la lista una
vez y dar de baja lo que no se reconozca:

```bash
B=https://ifbotech.com/rootkit
curl -s -H "Authorization: Bearer $ROOTLAB_ADMIN_CLAVE" $B/api/admin/aparatos \
  | jq -r '.aparatos[] | select(.origen=="tofu") | [.id, .placa, .fw, .vinculado, .visto] | @tsv'
curl -s -X DELETE -H "Authorization: Bearer $ROOTLAB_ADMIN_CLAVE" $B/api/admin/aparatos/A1B2C3D4E5F6
```

## Qué queda escrito

El servicio escribe a journald (`journalctl -u root-lab`). Además de lo que
cuenta al arrancar, anota **sólo lo que alguien querría leer**: los errores del
servidor, los frenos por límite (`429`), lo que tardó de más —con más paciencia
para las rutas que llaman a la IA, que tardan segundos por diseño— y, cada diez
minutos con tráfico, un renglón de resumen:

```
1240 pedidos en 600 s · 2xx 1230, 4xx 9, 5xx 1 · mediana 3 ms, p95 48 ms · el más lento: POST /api/plantas/:id/chat 4200 ms
```

Los `3xx` del resumen son las revalidaciones que vuelven vacías (`304`): con
la app abierta suelen ser más de la mitad de los pedidos. Y si la IA está
apagada, cada intento de usarla suma un `5xx` a la cuenta —es un `503`, el que
corresponde— pero no escribe una línea de error: es la respuesta correcta, no
una falla.

Una línea por pedido sería ruido —cada aparato habla cada quince minutos y
cada app relee el tablero cada quince segundos— y además una base de datos de
quién hizo qué. **Nunca entran IPs, emails ni ids**: la ruta se anota por su
forma (`/api/plantas/:id/historial`). Está en `server/registro.mjs`, probado
en `test/registro.test.mjs`.

Para mirar:

```bash
journalctl -u root-lab -n 200 --no-pager          # lo último
journalctl -u root-lab --since "1 hour ago" | grep -E 'error|freno|lento'
journalctl -u root-lab --since today | grep pedidos   # sólo los resúmenes
```

**Cuando el servidor frena a alguien** (`429`) la respuesta lleva
`Retry-After` con los segundos que faltan, y el cuerpo `reintentar_en`: un
aparato o un teléfono bien educado espera en vez de insistir.

## Actualizaciones por aire

El lado del aparato está en
[root-kit/docs/ota.md](https://github.com/ifbotech/root-kit/blob/main/docs/ota.md).
Acá, el del servidor.

**La clave de firma.** Cada firmware se firma con ECDSA P-256. El par se
generó una vez:

```bash
node tools/publicar-firmware.mjs generar-clave ~/.rootkit
```

- `firmware.key` es la **privada**: no está en ningún repositorio ni en el
  servidor. La tiene quien publica (y, para publicar desde GitHub, el secreto
  `FIRMWARE_CLAVE` de root-kit). **Si se pierde, los aparatos en la calle no
  se pueden actualizar más por aire**: se guarda como la clave maestra.
- `deploy/firmware-publica.pem` es la pública: con ella el servidor rechaza
  cualquier binario que no venga bien firmado (`403`), y va compilada en el
  firmware (`esp32/ota_clave.h`), que vuelve a verificar. Ni siquiera quien
  tome el servidor puede instalarle algo a una maceta.

**Publicar.**

```bash
cd ../rootkit/firmware && pio run -e c3-144
cd ../../root-lab
export ROOTLAB_ADMIN_CLAVE=...            # nunca en la línea de comandos
node tools/publicar-firmware.mjs publicar ../rootkit/firmware/.pio/build/c3-144/firmware.bin \
     --version 0.6.1 --placa c3-supermini --canal beta \
     --clave ~/.rootkit/firmware.key --publica deploy/firmware-publica.pem \
     --nube https://ifbotech.com/rootkit --notas "qué cambia"
node tools/publicar-firmware.mjs listar --nube https://ifbotech.com/rootkit
```

O desde GitHub: el flujo manual **publicar-firmware** de root-kit compila,
prueba, firma y publica.

**Canales.** Cada aparato está en `estable` (por defecto) o `beta`
(`PATCH /api/admin/aparatos/:id { "canal": "beta" }`, o el lote entero). Beta
recibe lo último de beta o de estable, lo que sea mayor; estable, sólo lo
estable. El camino de una versión: beta → una semana en el piloto →
publicarla de nuevo en estable.

**Volver atrás.** Publicar en el canal una versión anterior: los aparatos
instalan "la vigente del canal", no "la mayor". Retirar una publicación
(`retirar <id>`) hace que deje de ofrecerse; quien ya la instaló se queda
con ella.

**Qué ve la app.** En la ficha, "Firmware": la versión, si hay una nueva, si
la está bajando o si falló. El aparato lo cuenta en cada sync (`ota`).

**Probarlo sin placa.** Publicar cualquier archivo para la placa `emulador`:
el emulador lo baja con su token, verifica SHA-256 y firma (WebCrypto) y
"reinicia" con la versión nueva.

## Fábrica y confianza

`ROOTLAB_TOFU` decide quién puede registrarse solo la primera vez que habla
con la nube:

| Valor | Quién entra | Para |
|---|---|---|
| `1` | cualquier aparato | desarrollo |
| `emulador` | sólo los emuladores (20 nuevos por IP por día; los que nadie usa se borran a los 30 días) | **producción** |
| `0` | nadie | si se quiere cerrar también el emulador público |

En producción, una placa de verdad entra sólo si la registró la estación de
fábrica (`tools/fabrica.py` en root-kit,
[docs/fabrica.md](https://github.com/ifbotech/root-kit/blob/main/docs/fabrica.md)):
graba el secreto y el Rooti en el aparato por el puerto serie y registra acá
el **hash** de su token, con el lote. Lo que grabó la fábrica manda sobre lo
que diga el aparato (el Rooti y el lote no se pueden cambiar desde el
firmware), y un aparato o un lote se pueden deshabilitar (`403` en el sync).

## Respaldos que salen del servidor, y se prueban

| Qué | Cuándo | Dónde |
|---|---|---|
| Copia local (`VACUUM INTO`) | todos los días 4:30, y antes de cada actualización | `/var/lib/root-lab/respaldos/rootkit-<fecha>.db`, 14 días |
| Copia cifrada entera | con cada copia local, si hay `ROOTLAB_RESPALDO_CLAVE` | `…/rootkit-<fecha>.db.enc` |
| Copia en casa y en la nube | todos los días 9:15, la trae la computadora | `OneDrive\Respaldos\ROOTLAB`, 30 copias |
| Copia afuera (opcional) | si además hay `ROOTLAB_RESPALDO_DESTINO` | un remoto de rclone o un destino de scp |
| Prueba de restauración | el 1 de cada mes, 5:30 | descifra, abre, `integrity_check`, cuenta, y manda el resultado a `ROOTLAB_ADMIN_EMAIL` |

El `.db.enc` es AES-256-GCM con una clave derivada por scrypt de
`ROOTLAB_RESPALDO_CLAVE` (`server/respaldo.mjs`). No es la clave maestra a
propósito: quien custodia los respaldos no puede leer producción, y al revés.
El instalador la genera; **las dos tienen que estar fuera del servidor** —en
la caja fuerte, abajo—: sin ellas, un respaldo no se recupera.

### Tres copias, dos soportes, una afuera

La copia que hace el VPS está en **el mismo disco que la base**: protege de un
borrado o de una migración que sale mal, no de perder el servidor. Las otras
dos las junta una sola pasada desde casa:

| Copia | Dónde | De qué protege |
|---|---|---|
| 1 | el disco del VPS | un error nuestro, una actualización que rompe algo |
| 2 | la computadora de casa | que el VPS se pierda, que Hostinger cierre la cuenta |
| 3 | OneDrive (la misma carpeta, sincronizada) | que se rompa o se robe la computadora |

**La computadora las trae; el servidor no las manda.** Es la diferencia que
importa: el VPS no sabe que la computadora existe y no tiene credenciales para
llegar a ella, así que quien entre al servidor —y pueda borrar `/var/lib`—
no puede tocar las copias de afuera. Si fuera al revés (el VPS empujando a
OneDrive), tendría que haber ahí un token con permiso de escritura, y ese
token borra tan bien como escribe.

```powershell
# Una vez, desde root-lab en la computadora:
.\deploy\traer-respaldos.ps1 -Instalar      # tarea diaria a las 9:15
.\deploy\traer-respaldos.ps1                # y para probarla ahora
```

Trae sólo los `.db.enc` y la caja fuerte (las copias sin cifrar se quedan en
el VPS, no tienen por qué andar dando vueltas), comprueba que cada archivo
empiece con la marca `RKR1`, borra las que pasan de 30 y avisa fuerte si hace
más de tres días que no llega una nueva o si falta la caja. Termina con código
2 si no llegó ninguna copia sana y 3 si falta la caja, así que el historial
del Programador de tareas dice la verdad.

Si la carpeta está adentro de OneDrive, las copias 2 y 3 salen de la misma
pasada. Con otro destino: `-Destino D:\Respaldos\ROOTLAB`.

### La caja fuerte: que el respaldo se pueda abrir

Un `.db.enc` sin `ROOTLAB_RESPALDO_CLAVE` es ruido, y la base de adentro sin
`ROOTLAB_SECRETO` no tiene emails ni nombres. Las dos vivían sólo en
`/etc/root-lab.env`. `tools/caja-fuerte.mjs` las saca a un archivo cifrado con
una frase que no está en ninguna máquina ([seguridad.md](seguridad.md)):

```bash
sudo /opt/root-lab-node/bin/node /opt/root-lab/tools/caja-fuerte.mjs \
  sellar --salida /root/caja-fuerte.rkc
```

Después la baja `traer-respaldos.ps1` con los respaldos, y queda al lado de
ellos. **La frase no se guarda en ningún lado**: va en la cabeza y en el
gestor de contraseñas.

Dos cosas apenas baja, y una sola vez, desde la computadora:

```powershell
# 1. Que abra. Una caja que nadie abrió nunca no es una caja. `listar` pide la
#    frase y muestra los nombres de las claves y su largo, nunca los valores.
node tools\caja-fuerte.mjs listar "$env:USERPROFILE\OneDrive\Respaldos\ROOTLAB\caja-fuerte.rkc"

# 2. Sacarla del VPS. Existe para el día que el servidor no esté, y ese día la
#    copia que está EN el servidor tampoco está: ahí no protege de nada, y sí
#    le deja a quien lo tome un archivo contra el que probar frases sin apuro.
ssh -i ~\.ssh\rootkit_vps root@31.97.31.58 'rm -f /root/caja-fuerte.rkc'
```

`traer-respaldos.ps1` avisa mientras la caja siga en el VPS.

### Levantar todo de cero, sin el VPS

El día que no haya servidor, esto es lo que hay que tener y en qué orden:

```bash
# 1. Las claves salen de la caja (pide la frase).
node tools/caja-fuerte.mjs abrir caja-fuerte.rkc
# 2. El respaldo se descifra con ROOTLAB_RESPALDO_CLAVE.
node tools/restaurar.mjs --a rootkit.db rootkit-<fecha>.db.enc
# 3. El servidor nuevo arranca con ROOTLAB_SECRETO en su entorno, y los
#    emails y las charlas se vuelven a leer. El VAPID de la caja evita que
#    cada teléfono tenga que activar los avisos otra vez.
```

Lo único que **no** sale de ahí es la clave privada del firmware, que nunca
estuvo en el servidor y se guarda aparte ([seguridad.md](seguridad.md)).

**Configurar un destino más** (opcional). Con rclone, por ejemplo a Backblaze
B2 o a un Storage Box por SFTP:

```bash
sudo apt install rclone
sudo rclone config --config /etc/root-lab-rclone.conf      # crear el remoto "afuera"
sudo chgrp rootlab /etc/root-lab-rclone.conf && sudo chmod 640 /etc/root-lab-rclone.conf
sudo tee -a /etc/root-lab.env <<'EOF'
RCLONE_CONFIG=/etc/root-lab-rclone.conf
ROOTLAB_RESPALDO_DESTINO=afuera:rootlab-respaldos
EOF
sudo systemctl start root-lab-respaldo && journalctl -u root-lab-respaldo -n 5
```

Si el envío falla, el servicio termina con error (la copia local queda) y
`systemctl --failed` lo muestra.

**Probar ya, y restaurar.**

```bash
sudo systemctl start root-lab-verificar-respaldo && journalctl -u root-lab-verificar-respaldo -n 5

# Restaurar producción desde un respaldo (cifrado o no):
sudo systemctl stop root-lab
sudo mv /var/lib/root-lab/rootkit.db /var/lib/root-lab/rootkit.db.roto
# (el .env lo lee root: se carga primero y recién después se baja a rootlab,
#  así la clave no queda a la vista en la lista de procesos)
sudo bash -c 'set -a; . /etc/root-lab.env; set +a; runuser -p -u rootlab -- \
  /opt/root-lab-node/bin/node /opt/root-lab/tools/restaurar.mjs \
  --a /var/lib/root-lab/rootkit.db <archivo>'
sudo systemctl start root-lab
```

## El vigía

Un Rooti que deja de reportar es asunto de su dueño. **Muchos** que se callan
casi a la vez es el servidor, el dominio o el certificado
(`server/vigia.mjs`): si al menos 3 Rooties de verdad (no emuladores) —y la
mitad o más de los activos— no reportan hace más de 45 minutos y se callaron
dentro de la misma media hora, sale un email a `ROOTLAB_ADMIN_EMAIL`, como
mucho uno cada 6 horas.

Eso avisa mientras el servidor esté vivo. Para cuando **no** lo está:
`ROOTLAB_LATIDO_URL`. El servidor le hace un GET cada 5 minutos, sin datos, a
esa URL (un "dead man's switch": healthchecks.io, o uno propio). Si deja de
latir, avisa el que dejó de oír.

## Métricas, sin terceros

`eventos` es una tabla de contadores por día: el nombre del evento y cuántas
veces. **Ni cuenta, ni planta, ni IP.** La app manda dos familias
(`POST /api/evento`, una vez por sesión cada una): `alta:<paso>` (a qué paso
del alta se llegó) y `vista:<pantalla>` (pasaporte, álbum, gif, escritorio,
invernadero, colección, botánica, chat, diagnóstico, calibrar, cuidador). El
servidor cuenta lo demás: `vinculo`, `cofre:<rareza>`, `mascota:<gesto>`,
`chat`, `identificar`, `diagnosticar`, `cuidador`, `calibracion`, `fabrica`,
`ota:<estado>`.

```bash
curl -s -H "Authorization: Bearer $ROOTLAB_ADMIN_CLAVE" https://ifbotech.com/rootkit/api/admin/metricas?dias=30 | jq .totales
```

Para qué: saber dónde se abandona el alta, y decidir con datos qué pantallas
se quedan (el pasaporte y el GIF están a prueba: ver el roadmap).

## La IA, de verdad o escondida

Sin una `ANTHROPIC_API_KEY` válida la IA es simulada. En desarrollo eso sirve
(`ROOTLAB_IA_DEMO=1` la muestra, y la app lo avisa); en producción **se
esconde**: la app no ofrece charlar ni diagnosticar, y la especie se elige de
la lista. `/api/config` lo dice en `ia_visible`. Una planta que contesta
frases de prueba es peor que una que todavía no habla.

Activarla: cargar `ANTHROPIC_API_KEY` en `/etc/root-lab.env` y reiniciar. El
tope de gasto y las cuotas ya están ([ia.md](ia.md)).
