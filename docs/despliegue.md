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

Hace falta **Node 22.13 o más nuevo** (la base usa `node:sqlite`; en CI y en
el VPS, Node 24). Los datos quedan en `data/rootkit.db` (fuera de git).
Borrar la carpeta empieza de cero.

## En el VPS: https://ifbotech.com/rootkit/

El VPS ya sirve `ifbotech.com` con **Caddy** delante de la app principal
(Next.js). root-lab se suma como un servicio más:

```
 Internet ──HTTPS──► Caddy ──┬── /rootkit*  ──► root-lab  127.0.0.1:8090
                             └── todo lo demás ► app principal
```

| Pieza | Dónde |
|---|---|
| Código | `/opt/root-lab` (clon de GitHub) |
| Node 24 propio | `/opt/root-lab-node` (el del sistema no se toca) |
| Configuración | `/etc/root-lab.env` |
| Base de datos | `/var/lib/root-lab/rootkit.db` (SQLite: cuentas, plantas, lecturas) |
| Claves VAPID | `/var/lib/root-lab/vapid.json` |
| Respaldos | `/var/lib/root-lab/respaldos/`, uno por día, 14 días |
| Servicios | `root-lab` y `root-lab-respaldo.timer` (systemd), usuario `rootlab` sin privilegios |
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
  notificaciones a nombre de ROOTKIT).
- **Un solo servidor.** Si el VPS se cae, las macetas siguen mostrando su
  cara (evalúan solas) y guardan lecturas hasta tres días; la app y los
  avisos vuelven cuando vuelve el servidor.

### Instalar o actualizar

En el VPS, como root:

```bash
curl -fsSL https://raw.githubusercontent.com/ifbotech/root-lab/main/deploy/instalar.sh | bash
```

`deploy/instalar.sh` es idempotente: la primera vez baja Node 24 a
`/opt/root-lab-node` (verificando su SHA-256), crea el usuario, clona el
repo, escribe `/etc/root-lab.env` y activa el servicio y el respaldo diario;
las siguientes respaldan la base, traen `main`, instalan dependencias y
reinician. Nunca pisa la configuración ni los datos.

Node propio porque el sistema puede tener otro Node para otras cosas (en
este VPS, el 20, que no trae `node:sqlite`), y cambiarlo podría romperlas.

### Caddy

Dentro del bloque `ifbotech.com` del Caddyfile, **antes** de lo que manda
todo a la app principal (ver `deploy/Caddyfile.rootkit`):

```caddy
@rootkit path_regexp ^/(?i)rootkit(/.*)?$
handle @rootkit {
	reverse_proxy 127.0.0.1:8090
}
```

Sin distinguir mayúsculas, porque el QR del firmware va entero en mayúsculas
(`HTTPS://IFBOTECH.COM/ROOTKIT/V/...`) para entrar en el modo alfanumérico. La
base no se quita: root-lab la recibe y la resuelve (`server/http.mjs`).

```bash
caddy validate --config /etc/caddy/Caddyfile && systemctl reload caddy
```

### Verificar

Desde cualquier compu:

```bash
node tools/verificar-despliegue.mjs https://ifbotech.com/rootkit          # sólo lectura
node tools/verificar-despliegue.mjs https://ifbotech.com/rootkit --flujo  # recorre el flujo
```

El `--flujo` crea dos cuentas de prueba, vincula un aparato inventado,
comprueba que la segunda cuenta no ve la planta de la primera y al final
borra las dos cuentas con sus plantas. Queda sólo el registro del aparato
inventado (sin dueño), igual que una maceta que nunca se vinculó.

### Operar

```bash
systemctl status root-lab
journalctl -u root-lab -f                 # log en vivo
nano /etc/root-lab.env && systemctl restart root-lab
curl -s 127.0.0.1:8090/rootkit/api/salud  # cuentas, plantas y lecturas guardadas

systemctl start root-lab-respaldo         # respaldo ya
systemctl list-timers root-lab-respaldo   # cuándo toca el próximo
ls -lh /var/lib/root-lab/respaldos
```

Sacar los respaldos del servidor, desde la compu:

```bash
scp root@31.97.31.58:/var/lib/root-lab/respaldos/rootkit-*.db .
```

Restaurar uno:

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

La placa sincroniza por HTTPS con `https://ifbotech.com/rootkit/api/d/sync`
y su QR lleva a `HTTPS://IFBOTECH.COM/ROOTKIT/V/<código>`.

## Variables

| Variable | Por defecto | Qué hace |
|---|---|---|
| `PORT` | `8080` (`8090` en el VPS) | |
| `ROOTLAB_HOST` | `0.0.0.0` (`127.0.0.1` en el VPS) | interfaz donde escucha |
| `ROOTLAB_BASE` | vacía (`/rootkit` en el VPS) | subruta donde se monta la app |
| `ROOTLAB_URL_PUBLICA` | la IP de la compu + la base | a dónde lleva el QR del emulador |
| `ANTHROPIC_API_KEY` | — | identificación y diagnóstico con Claude |
| `ROOTLAB_IA_MODELO` | `claude-opus-5` | |
| `ROOTLAB_TOFU` | `1` | `0`: rechaza aparatos que no registró la fábrica |
| `ROOTLAB_DATOS` | `data` | carpeta de la base (`rootkit.db`), respaldos y claves VAPID |
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
   las macetas con el QR viejo.

La base es la misma, así que las cuentas y las plantas no se mueven. Lo que
es por origen es la sesión guardada en el teléfono y los permisos de avisos:
quien instaló la app desde `ifbotech.com/rootkit` la vuelve a instalar desde
el dominio nuevo, entra con su email y vuelve a activar los avisos.

## Pendiente para producción

- `ROOTLAB_TOFU=0` y registro de tokens desde la estación de fábrica.
- `RK_NUBE_CA` en el firmware para verificar el certificado del servidor.
- Recuperar la contraseña por email: necesita un servicio de envío de correo
  (Resend, SES o el SMTP del dominio nuevo) y un remitente verificado.
- Verificar el email al crear la cuenta (mismo servicio).
- Respaldos fuera del VPS (snapshots del proveedor o copia a un bucket).
- Límite de gasto en la consola de Anthropic.
