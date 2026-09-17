# Despliegue

Tres escenarios: en la compu, en el VPS debajo de `ifbotech.com/rootkit`, y
más adelante con dominio propio.

## En la compu

```bash
npm install
npm start          # o npm run dev, que reinicia al guardar
```

```
  app        http://localhost:8080/
  emulador   http://localhost:8080/emulador/
  pública    http://192.168.0.20:8080/   (lo que va en el QR)
```

Hace falta **Node 24.7 o más nuevo** (`node:sqlite` y Argon2id). Los datos
quedan en `data/` (fuera de git): la base, la clave maestra de desarrollo
(`secreto.key`), las claves VAPID y los emails como `.eml` en `correos/`.
Borrar la carpeta empieza de cero.

## En el VPS: https://ifbotech.com/rootkit/

El VPS ya sirve `ifbotech.com` con **Caddy** delante de la app principal
(Next.js, en Docker). ROOTLAB se suma como un servicio más:

```
 Internet ──HTTPS──► Caddy ──┬── /rootkit*  ──► ROOTLAB (root-lab)   127.0.0.1:8090
    (HSTS)                   ├── /api/botanist* ► 404 (API vieja, retirada)
                             └── todo lo demás ► ifbotech-hub (Docker) 127.0.0.1:3000
                                                         │
                         Brevo (SMTP) ◄── emails ───────┤
                         Anthropic    ◄── IA ───────────┘
```

| Pieza | Dónde |
|---|---|
| Código | `/opt/root-lab` (clon de GitHub) |
| Node 24 propio | `/opt/root-lab-node` (el del sistema no se toca) |
| Configuración y clave maestra | `/etc/root-lab.env` (640, grupo `rootlab`) |
| Base de datos | `/var/lib/root-lab/rootkit.db` (SQLite: cuentas, plantas, lecturas, charlas, firmware; datos personales cifrados) |
| Claves VAPID | `/var/lib/root-lab/vapid.json` |
| Respaldos | `/var/lib/root-lab/respaldos/`, uno por día, 14 días, con su copia cifrada (`.db.enc`) para sacar del servidor ([operacion.md](operacion.md)) |
| Servicios | `root-lab`, `root-lab-respaldo.timer` (diario) y `root-lab-verificar-respaldo.timer` (prueba de restauración mensual), usuario `rootlab` sin privilegios |
| Proxy | un bloque `handle` en el Caddyfile del sitio |

### ¿Por qué un VPS?

Para el prototipo y el piloto es la opción correcta:

- **HTTPS ya resuelto** por el Caddy del sitio: es lo que exigen la
  instalación de la app y las notificaciones.
- **Un proceso de Node y una base SQLite**: 1 % de CPU y unos 60 MB de RAM
  en un KVM 2, al lado de lo que ya corre. Las plantas de todas las cuentas
  viven en esa base, cada una visible sólo para su cuenta.
- **Sin costo extra** y con control total de los datos.

A tener en cuenta:

- **Respaldos.** `/var/lib/root-lab` tiene cuentas, vínculos, lecturas y las
  claves VAPID; si se pierden las claves, cada teléfono tiene que volver a
  activar los avisos. El timer deja una copia diaria **en el mismo disco**:
  protege de un error, no de perder el VPS. Para eso hay que sacarlas afuera
  (ver *Operar*) o activar los snapshots del proveedor.
- **Comparte origen con ifbotech.com.** El service worker y el almacenamiento
  quedan limitados a `/rootkit/`, así que no se pisan con el sitio, pero con
  el dominio propio la app queda más limpia (instalación, permisos y
  notificaciones a nombre de ROOTLAB).
- **Un solo servidor.** Si el VPS se cae, los Rooties siguen mostrando su
  cara (evalúan solas) y guardan lecturas hasta tres días; la app y los
  avisos vuelven cuando vuelve el servidor.

### Instalar o actualizar

En el VPS, como root:

```bash
curl -fsSL https://raw.githubusercontent.com/ifbotech/root-lab/main/deploy/instalar.sh | bash
```

`deploy/instalar.sh` es idempotente: la primera vez baja Node 24 a
`/opt/root-lab-node` (verificando su SHA-256), crea el usuario, clona el
repo, escribe `/etc/root-lab.env`, **genera la clave maestra** si falta y
activa el servicio y el respaldo diario; las siguientes respaldan la base,
traen `main`, instalan dependencias y reinician (si el esquema cambió, la
migración corre sola al arrancar). Nunca pisa la configuración, la clave ni
los datos. Si la actualización trae un instalador distinto, el que estaba
corriendo le pasa la posta al nuevo apenas baja el código: lo que agregue una
versión (una clave que falta, un temporizador) se aplica en esa misma corrida.

**Después de la primera instalación, guardá la clave maestra fuera del
servidor** (gestor de contraseñas): `sudo grep ROOTLAB_SECRETO
/etc/root-lab.env`. Sin ella la base no se puede leer. Ver
[seguridad.md](seguridad.md).

### Configurar la IA y el correo

En `/etc/root-lab.env` (y `systemctl restart root-lab`):

```ini
ANTHROPIC_API_KEY=sk-ant-...
ROOTLAB_IA_TOPE_DIA_USD=2
ROOTLAB_IA_TOPE_MES_USD=20

ROOTLAB_SMTP_HOST=smtp-relay.brevo.com
ROOTLAB_SMTP_PORT=587
ROOTLAB_SMTP_USUARIO=...
ROOTLAB_SMTP_CLAVE=...
ROOTLAB_CORREO_REMITENTE="ROOTLAB <no-reply@ifbotech.com>"
ROOTLAB_ADMIN_EMAIL=admin@ifbotech.com
```

Al arrancar el log dice qué quedó andando: `IA claude (...)` o
`IA simulada (motivo)` —si Anthropic rechaza la clave, arranca en simulada y
lo avisa—, el tope, `correo smtp` y `correo: relay SMTP conectado`. Para
probar el correo de punta a punta:

```bash
sudo -u rootlab bash -c 'set -a; . /etc/root-lab.env; set +a; \
  /opt/root-lab-node/bin/node /opt/root-lab/tools/probar-correo.mjs "$ROOTLAB_ADMIN_EMAIL"'
```

Detalles: [ia.md](ia.md), [correo.md](correo.md).

Node propio porque el sistema puede tener otro Node para otras cosas (en
este VPS, el 20, que no trae `node:sqlite`), y cambiarlo podría romperlas.

### Caddy

El Caddyfile del VPS completo está en `deploy/Caddyfile.rootkit`. Lo de
ROOTLAB va **antes** de lo que manda todo a la app principal:

```caddy
header {
	Strict-Transport-Security "max-age=31536000"
	X-Content-Type-Options "nosniff"
	-Server
}
@rootkit path_regexp ^/(?i)rootkit(/.*)?$
handle @rootkit {
	reverse_proxy 127.0.0.1:8090
}
```

HSTS se pone acá porque Caddy es quien termina HTTPS; el resto de las
cabeceras de seguridad de ROOTLAB (CSP, anti-iframe...) las pone la app.

Sin distinguir mayúsculas, porque el QR del firmware va entero en mayúsculas
(`HTTPS://IFBOTECH.COM/ROOTKIT/V/...`) para entrar en el modo alfanumérico. La
base no se quita: root-lab la recibe y la resuelve (`server/http.mjs`).

```bash
caddy validate --config /etc/caddy/Caddyfile && systemctl reload caddy
```

### Verificar

Desde cualquier compu:

```bash
node tools/verificar-despliegue.mjs https://ifbotech.com/rootkit              # sólo lectura
node tools/verificar-despliegue.mjs https://ifbotech.com/rootkit --flujo      # recorre el flujo
node tools/verificar-despliegue.mjs https://ifbotech.com/rootkit --flujo --ia # + un mensaje real a la IA
```

Sin `--flujo`: salud y esquema, cabeceras de seguridad y HSTS, que no haya
recursos de terceros, QR, manifest, caras de las pieles y la dormida, los
módulos del cuerpo y la mascota, fuente, emulador.

El `--flujo` crea dos cuentas de prueba en `@rootlab.invalid` (un dominio al
que el servidor nunca manda emails), vincula un aparato inventado, abre el
cofre (la app reconoce al Musgo del aparato, sale una piel y pinta la cuenta;
el sync le manda la rareza al aparato), acaricia a la mascota, comprueba que
sólo el emulador puede adelantar su tiempo, que la IA pide un Rooti,
que olvidé mi contraseña no revela cuentas, que las paletas bloqueadas están
bloqueadas y que la segunda cuenta no ve la planta ni la charla de la primera.
Al final borra las dos cuentas. Queda sólo el aparato inventado, sin dueño.

`--ia` le manda un mensaje a la planta: con la IA real cuesta alrededor de un
centavo de dólar.

### Operar

```bash
systemctl status root-lab
journalctl -u root-lab -f                 # log en vivo
nano /etc/root-lab.env && systemctl restart root-lab
curl -s 127.0.0.1:8090/rootkit/api/salud  # cuentas, plantas y lecturas guardadas

systemctl start root-lab-respaldo         # respaldo ya
systemctl list-timers root-lab-respaldo   # cuándo toca el próximo
ls -lh /var/lib/root-lab/respaldos
systemd-analyze security root-lab         # qué tan encerrado está el servicio

# cuánto gastó la IA, por tipo, día y cuenta
sudo -u rootlab /opt/root-lab-node/bin/node /opt/root-lab/tools/uso-ia.mjs /var/lib/root-lab 30
```

Sacar los respaldos del servidor, desde la compu:

```bash
scp root@31.97.31.58:/var/lib/root-lab/respaldos/rootkit-*.db .
```

Los respaldos tienen los datos personales **cifrados**: para restaurarlos en
otro servidor hace falta también la clave maestra. Restaurar uno:

```bash
systemctl stop root-lab
cp /var/lib/root-lab/respaldos/rootkit-AAAA-MM-DD-HH-MM.db /var/lib/root-lab/rootkit.db
rm -f /var/lib/root-lab/rootkit.db-wal /var/lib/root-lab/rootkit.db-shm
chown rootlab:rootlab /var/lib/root-lab/rootkit.db
systemctl start root-lab
```

### La placa contra el VPS

En `root-kit/firmware/platformio.ini`:

```ini
-DRK_NUBE_URL=\"https://ifbotech.com/rootkit\"
-DRK_APP_URL=\"\"
```

La placa sincroniza por HTTPS con `https://ifbotech.com/rootkit/api/d/sync`,
**verificando el certificado** contra las raíces de Let's Encrypt y ZeroSSL, y
su QR lleva a `HTTPS://IFBOTECH.COM/ROOTKIT/V/<código>`.

## El sitio principal (ifbotech-hub), endurecido

El VPS comparte servidor con el sitio de ifbotech.com (Next.js en Docker, en
`/var/www/ifbotech-hub`). Al desplegar ROOTLAB se encontraron y se
corrigieron estos problemas, con respaldo previo de todo en `/root/respaldos`
(código, Caddyfile, `.env` de ROOTLAB) y la imagen anterior etiquetada
`ifbotech-hub:respaldo-2026-09-16-1735`:

| Problema | Riesgo | Arreglo |
|---|---|---|
| El puerto 3000 publicado en `0.0.0.0` | Next quedaba accesible desde internet **sin HTTPS y sin pasar por Caddy**; Docker se saltea el firewall `ufw` | `127.0.0.1:3000:3000` en `docker-compose.yml`. Verificado: desde afuera, cerrado |
| El `.env` (claves de Stripe, MercadoPago, Anthropic, SMTP, JWT) copiado **dentro de la imagen** | cualquiera con la imagen tenía todos los secretos | `.env*` en `.dockerignore`; en la compilación entra como **secreto de BuildKit** y se borra de la salida standalone. Verificado: no hay `.env` en la imagen nueva |
| Contenedor `unhealthy` desde hacía 5 meses | el chequeo usaba `localhost`, que en Alpine resuelve a `::1`, y Next escucha en IPv4 | chequeo contra `127.0.0.1` |
| Next.js 16.2.1 con una vulnerabilidad **crítica** (y postcss y sharp altas) | | Next 16.3.5, misma versión mayor |
| nodemailer 8 con 10 avisos de seguridad altos | inyección de comandos SMTP, cabeceras, reparto a dominios ajenos | nodemailer 10.0.10 (la API que usa el sitio no cambió) |
| Sin HSTS | | HSTS en Caddy para todo el dominio |
| Contenedor con todas las capacidades del kernel | | `cap_drop: ALL`, `no-new-privileges`, rotación de logs |

Antes de reemplazar el contenedor, la imagen nueva corrió en paralelo en el
puerto 3001 y respondió igual que la vieja en todas las rutas (`/`,
`/es/raw-reader`, `/roast-cv`, `/job-agent`, sus APIs y los webhooks).

**Volver atrás**, si hiciera falta:

```bash
cd /var/www/ifbotech-hub
cp /root/respaldos/Dockerfile.viejo Dockerfile
cp /root/respaldos/docker-compose.viejo.yml docker-compose.yml
docker tag ifbotech-hub:respaldo-2026-09-16-1735 ifbotech-hub:latest
docker compose up -d --no-build
```

**Quedan pendientes en ese sitio** (necesitan cambios de versión mayor y
probar sus flujos de pago): `@anthropic-ai/sdk` 0.80 → 0.126 (moderada) y
`mercadopago` 2 → 3 (moderada, por `uuid`). Además, su `ANTHROPIC_API_KEY`
está **revocada** (Anthropic responde 401): el sitio y ROOTLAB necesitan una
clave nueva.

## Variables

| Variable | Por defecto | Qué hace |
|---|---|---|
| `PORT` | `8080` (`8090` en el VPS) | |
| `ROOTLAB_HOST` | `0.0.0.0` (`127.0.0.1` en el VPS) | interfaz donde escucha |
| `ROOTLAB_BASE` | vacía (`/rootkit` en el VPS) | subruta donde se monta la app |
| `ROOTLAB_URL_PUBLICA` | la IP de la compu + la base | a dónde lleva el QR del emulador |
| `ROOTLAB_SECRETO` | en desarrollo, `data/secreto.key` | **clave maestra**: cifra datos personales y es la pimienta de las contraseñas ([seguridad.md](seguridad.md)) |
| `ANTHROPIC_API_KEY` | — | reconocer, diagnosticar y charlar con Claude; sin ella, simulado |
| `ROOTLAB_IA_MODELO` | `claude-opus-5` | fotos |
| `ROOTLAB_IA_MODELO_CHAT` | `claude-sonnet-5` | chat |
| `ROOTLAB_IA_TOPE_DIA_USD`, `ROOTLAB_IA_TOPE_MES_USD` | `2`, `20` | tope de gasto global (`0` = sin tope) |
| `ROOTLAB_CUOTA_CHAT`, `_IDENTIFICAR`, `_DIAGNOSTICAR` | `3`, `3`, `2` | cuotas diarias del plan gratis |
| `ROOTLAB_IA_PRECIOS` | ver [ia.md](ia.md) | precios por millón de tokens (JSON) |
| `ROOTLAB_SMTP_HOST`, `_PORT`, `_USUARIO`, `_CLAVE` | — | relay SMTP; sin él, emails a `data/correos` |
| `ROOTLAB_CORREO_REMITENTE` | `ROOTLAB <no-reply@ifbotech.com>` | |
| `ROOTLAB_IA_DEMO` | — | `1`: mostrar las funciones de IA aunque sea simulada (desarrollo). Sin esto y sin clave válida, la app las esconde |
| `ROOTLAB_ADMIN_EMAIL` | — | alertas para quien opera: gasto de la IA, caídas masivas, prueba de restauración |
| `ROOTLAB_ADMIN_CLAVE` | la genera el instalador | la clave de `/api/admin/*` (fábrica, firmware, métricas); sin ella esas rutas no existen ([operacion.md](operacion.md)) |
| `ROOTLAB_FIRMWARE_PUBLICA` | `deploy/firmware-publica.pem` | la pública con la que se verifica cada firmware que se publica |
| `ROOTLAB_TOFU` | `1` (`emulador` en el VPS) | quién se registra solo: `1` cualquiera, `emulador` sólo emuladores (las placas, por fábrica), `0` nadie |
| `ROOTLAB_RESPALDO_CLAVE` | la genera el instalador | cifra la copia del respaldo que sale del servidor |
| `ROOTLAB_RESPALDO_DESTINO` | — | a dónde mandarla: un remoto de rclone (`afuera:rootlab`) o `usuario@host:/ruta` |
| `RCLONE_CONFIG` | — | la configuración de rclone para el respaldo (por ejemplo `/etc/root-lab-rclone.conf`) |
| `ROOTLAB_LATIDO_URL` | — | un GET cada 5 minutos a esa URL (healthchecks.io o similar): avisa quien deja de oírlo |
| `ROOTLAB_REGISTRO_CADA_MS` | 600000 | cada cuánto sale el renglón de resumen en el journal ([operacion.md](operacion.md)) |
| `ROOTLAB_DATOS` | `data` | carpeta de la base (`rootkit.db`), respaldos, claves VAPID y emails de desarrollo |
| `ROOTLAB_CONTACTO` | URL del repo | contacto VAPID (`mailto:` o `https:`) |

## Probar en el teléfono sin VPS

Escanear el QR con el teléfono en la misma red abre la app por HTTP: se ve y
se recorre el alta, pero no se puede instalar ni recibir notificaciones. Para
eso hace falta HTTPS; sin VPS, con un túnel:

```bash
cloudflared tunnel --url http://localhost:8080
ROOTLAB_URL_PUBLICA=https://algo-al-azar.trycloudflare.com npm start
```

## Con dominio propio

Cuando exista (por ejemplo `rootkit.app`):

1. DNS del dominio al VPS.
2. En el Caddyfile, un sitio nuevo:
   ```caddy
   rootkit.app {
   	reverse_proxy 127.0.0.1:8090
   }
   ```
3. En `/etc/root-lab.env`: `ROOTLAB_BASE=` (vacía) y
   `ROOTLAB_URL_PUBLICA=https://rootkit.app`. Reiniciar.
4. En el firmware: `RK_NUBE_URL` al dominio nuevo.
5. Dejar `ifbotech.com/rootkit` redirigiendo al dominio nuevo un tiempo, para
   los Rooties con el QR viejo.
6. Autenticar el dominio nuevo en el relay de correo (SPF, DKIM, DMARC) y
   cambiar `ROOTLAB_CORREO_REMITENTE`.

La base es la misma, así que las cuentas y las plantas no se mueven. Lo que
es por origen es la sesión guardada en el teléfono y los permisos de avisos:
quien instaló la app desde `ifbotech.com/rootkit` la vuelve a instalar desde
el dominio nuevo, entra con su email y vuelve a activar los avisos.

## Pendiente para producción

- **Una clave de Anthropic válida** (la actual está revocada) y un límite de
  gasto para ella en la consola de Anthropic.
- **Un destino para los respaldos cifrados** (`ROOTLAB_RESPALDO_DESTINO`): la
  copia cifrada y la prueba mensual ya corren; falta elegir a dónde mandarla
  ([operacion.md](operacion.md)). Y guardar aparte la clave maestra, la de
  respaldos, la de administración y la privada del firmware.
- Un latido externo (`ROOTLAB_LATIDO_URL`) para enterarse si el VPS se cae.
- DMARC en `p=quarantine` cuando los reportes de Brevo estén limpios.
- Rotación de la clave maestra.
