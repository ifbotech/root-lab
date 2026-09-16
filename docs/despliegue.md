# Despliegue

## En la compu

```bash
npm install
npm start          # o npm run dev, que reinicia al guardar
```

Al arrancar muestra las direcciones:

```
  app        http://localhost:8080
  emulador   http://localhost:8080/emulador/
  en la red  http://192.168.0.20:8080   (lo que va en el QR)
```

Los datos quedan en `data/` (fuera de git). Borrar la carpeta empieza de
cero.

## Variables

Copiar `.env.example` a `.env`. Ninguna es obligatoria para desarrollar.

| Variable | Por defecto | Qué hace |
|---|---|---|
| `PORT` | `8080` | |
| `ROOTLAB_URL_PUBLICA` | la IP de la compu | a dónde lleva el QR del emulador |
| `ANTHROPIC_API_KEY` | — | identificación y diagnóstico con Claude |
| `ROOTLAB_IA_MODELO` | `claude-opus-5` | |
| `ROOTLAB_TOFU` | `1` | `0`: rechaza aparatos que no registró la fábrica |
| `ROOTLAB_DATOS` | `data` | carpeta de datos y claves VAPID |
| `ROOTLAB_CONTACTO` | URL del repo | contacto VAPID (`mailto:` o `https:`) |

## Con una placa de verdad

En `root-kit/firmware/platformio.ini`, `RK_NUBE_URL` apunta a la dirección
"en la red" de arriba. La placa y la compu tienen que estar en el mismo wifi.

## En el teléfono, con HTTPS

Escanear el QR con el teléfono en la misma red abre la app por HTTP: se ve y
se puede recorrer el alta, pero **no se puede instalar ni recibir
notificaciones**, porque las dos cosas exigen HTTPS.

Para eso, un túnel. Con Cloudflare (gratis, sin cuenta):

```bash
cloudflared tunnel --url http://localhost:8080
# → https://algo-al-azar.trycloudflare.com
```

y arrancar el servidor con esa URL para que el QR la use:

```bash
ROOTLAB_URL_PUBLICA=https://algo-al-azar.trycloudflare.com npm start
```

Con una placa, el QR lo dibuja el firmware: poner la URL del túnel en
`RK_APP_URL` y dejar `RK_NUBE_URL` en la IP local (la placa sincroniza por la
red de la casa, el teléfono abre por el túnel).

## En producción

Lo mínimo (Fase 3 del roadmap):

1. Un VPS chico con Node 20+, detrás de un proxy con HTTPS (Caddy lo resuelve
   solo con un dominio).
2. `ROOTLAB_TOFU=0` y registro de tokens desde la estación de fábrica.
3. Respaldos diarios de `data/`, **incluido `vapid.json`**.
4. `ANTHROPIC_API_KEY` con límite de gasto.
5. En el firmware: `RK_NUBE_URL` y `RK_APP_URL` al dominio, y `RK_NUBE_CA` con
   el certificado raíz para verificar el servidor.
6. Cuando el archivo JSON quede chico: SQLite o Postgres. Sólo cambia
   `server/almacen.mjs`.

Ejemplo de `Caddyfile`:

```
rootkit.ejemplo.com {
  reverse_proxy localhost:8080
}
```
