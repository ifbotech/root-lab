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

Los datos quedan en `data/` (fuera de git). Borrar la carpeta empieza de cero.

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
| Configuración | `/etc/root-lab.env` |
| Datos y claves VAPID | `/var/lib/root-lab` |
| Servicio | `root-lab` (systemd), usuario `rootlab` sin privilegios |
| Proxy | un bloque `handle` en el Caddyfile del sitio |

### ¿Por qué un VPS?

Para el prototipo y el piloto es la opción correcta:

- **HTTPS ya resuelto** por el Caddy del sitio: es lo que exigen la
  instalación de la app y las notificaciones.
- **Un proceso de Node y un archivo de datos**: 1 % de CPU y unos 60 MB de
  RAM en un KVM 2, al lado de lo que ya corre.
- **Sin costo extra** y con control total de los datos.

A tener en cuenta:

- **Respaldos.** `/var/lib/root-lab` tiene cuentas, vínculos, lecturas y las
  claves VAPID; si se pierden las claves, cada teléfono tiene que volver a
  activar los avisos. Un `tar` diario a otro lado alcanza para el piloto.
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

`deploy/instalar.sh` es idempotente: la primera vez instala Node 22, crea el
usuario, clona el repo, escribe `/etc/root-lab.env` y activa el servicio;
las siguientes sólo traen `main`, instalan dependencias y reinician. Nunca
pisa la configuración ni los datos.

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

### Operar

```bash
systemctl status root-lab
journalctl -u root-lab -f                 # log en vivo
nano /etc/root-lab.env && systemctl restart root-lab
tar czf /root/root-lab-$(date +%F).tgz -C /var/lib root-lab   # respaldo
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
| `ROOTLAB_DATOS` | `data` | carpeta de datos y claves VAPID |
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

Las cuentas son por origen: quien instaló la app desde `ifbotech.com/rootkit`
la vuelve a instalar desde el dominio nuevo y trae sus plantas con el código
de transferencia de Ajustes.

## Pendiente para producción

- `ROOTLAB_TOFU=0` y registro de tokens desde la estación de fábrica.
- `RK_NUBE_CA` en el firmware para verificar el certificado del servidor.
- Base de datos (SQLite o Postgres) cuando el archivo JSON quede chico: sólo
  cambia `server/almacen.mjs`.
- Límite de gasto en la consola de Anthropic.
