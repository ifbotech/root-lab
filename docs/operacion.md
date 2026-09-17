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
| `PATCH /api/admin/lotes/:lote` | lo mismo para un lote entero (una partida fallada) |
| `GET /api/admin/firmware` | lo publicado |
| `POST /api/admin/firmware` | publica: `{ version, placa, canal, notas?, sha256?, firma, contenido_b64 }` |
| `DELETE /api/admin/firmware/:id` | retira una publicación |

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
| Copia afuera | si además hay `ROOTLAB_RESPALDO_DESTINO` | un remoto de rclone o un destino de scp |
| Prueba de restauración | el 1 de cada mes, 5:30 | descifra, abre, `integrity_check`, cuenta, y manda el resultado a `ROOTLAB_ADMIN_EMAIL` |

El `.db.enc` es AES-256-GCM con una clave derivada por scrypt de
`ROOTLAB_RESPALDO_CLAVE` (`server/respaldo.mjs`). No es la clave maestra a
propósito: quien custodia los respaldos no puede leer producción, y al revés.
El instalador la genera; **hay que guardarla fuera del servidor**, junto con
la maestra: sin las dos, un respaldo no se recupera.

**Configurar el destino** (una vez). Con rclone, por ejemplo a Backblaze B2 o
a un Storage Box por SFTP:

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
sudo -u rootlab env $(sudo grep ROOTLAB_RESPALDO_CLAVE /etc/root-lab.env) \
  /opt/root-lab-node/bin/node tools/restaurar.mjs --a /var/lib/root-lab/rootkit.db <archivo>
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
