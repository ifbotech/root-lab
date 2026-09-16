# root-lab

La app y la nube de **ROOTKIT**: la maceta con sensores y una pantalla que
muestra un QR al principio y unos ojos después.

Acá vive todo lo que el aparato no hace: las cuentas de las personas (email
y contraseña, cada una ve sólo sus plantas), vincular la maceta, abrir el
cofre para descubrir quién es, identificar la planta con una foto, mostrar el
tablero y avisar al teléfono cuando la planta necesita algo. El firmware, el
hardware y las carcasas están en
[root-kit](https://github.com/ifbotech/root-kit).

## Probarlo en la compu

Necesita Node 22.13 o más nuevo (usa `node:sqlite`).

```bash
npm install
npm start
```

| | |
|---|---|
| **App** | http://localhost:8080 |
| **Emulador** | http://localhost:8080/emulador/ |

El **emulador** es un ROOTKIT en el navegador que corre el firmware real
compilado a WebAssembly y habla con este servidor igual que la placa. Con él
se recorre el flujo entero sin hardware:

1. Abrí el emulador: muestra el QR.
2. **Pasarle el wifi** simula el portal cautivo.
3. **Abrir la app** (o escaneá el QR con el teléfono en la misma red).
4. En la app: empezar → **crear cuenta** → avisos → el wifi ya está →
   vincular → **cofre**.
5. Mirá el emulador cuando se abre el cofre: abre los ojos.
6. Nombre, foto de una planta, y listo.
7. Mové los deslizadores del emulador: la cara cambia, la app muestra tareas
   y, si activaste los avisos, llega la notificación.

Sin `ANTHROPIC_API_KEY` la identificación por foto es **simulada** (la app lo
avisa). Para usar Claude, copiá `.env.example` a `.env` y poné la clave.

## En línea

La versión de prueba vive en **https://ifbotech.com/rootkit/** (emulador en
https://ifbotech.com/rootkit/emulador/), en el VPS del sitio, detrás de su
Caddy. Cómo se instala, se actualiza y se verifica:
[docs/despliegue.md](docs/despliegue.md).

## Probarlo en el teléfono

El QR del emulador apunta a la IP de la compu en la red (`http://192.168.x.x:8080`),
así que se puede escanear. Pero **instalar la app y recibir notificaciones
exigen HTTPS**: para eso hace falta un túnel. Ver
[docs/despliegue.md](docs/despliegue.md).

## Pruebas

```bash
npm test          # 142 pruebas: API, cuentas y aislamiento, base de datos, HTTP en subruta, avisos, IA, caras, tareas
```

## Estructura

```
server/
  index.mjs        arranque y configuración
  http.mjs         transporte: estáticos, subruta (/rootkit), API
  api.mjs          toda la lógica, sin HTTP (así se prueba)
  avisos.mjs       qué notificación mandar y cuándo callarse
  ia.mjs           identificación y diagnóstico por foto (Claude o simulada)
  cofre.mjs        qué personaje sale del cofre
  catalogo.mjs     especies curadas y personajes (generados desde el firmware)
  codigo.mjs       código de vinculación, igual que el firmware
  push.mjs         Web Push con claves VAPID
  db.mjs           base SQLite: cuentas, sesiones, plantas, lecturas (el único que escribe SQL)
public/            la app (PWA sin build)
  app.js           rutas, estado, alta
  vistas/          alta, cuenta, cofre, hoy, plantas, escáner, colección, ajustes
  lib/             lógica pura: tareas, diagnóstico, gamificación, caras
  caras/           el firmware en WebAssembly y las imágenes de las caras
emulador/          el ROOTKIT virtual
deploy/            instalación en un VPS: script, servicios systemd, respaldo diario, Caddy
tools/             sincronizar con el firmware, verificar un despliegue, respaldar la base, íconos
test/
docs/
```

## Documentación

| | |
|---|---|
| [arquitectura.md](docs/arquitectura.md) | Cómo encajan app, nube y aparato |
| [flujo.md](docs/flujo.md) | El alta paso a paso, y por qué en ese orden |
| [api.md](docs/api.md) | La API de la app y la del aparato |
| [notificaciones.md](docs/notificaciones.md) | Cuándo se avisa y cuándo no |
| [ia.md](docs/ia.md) | Identificación y diagnóstico por foto |
| [despliegue.md](docs/despliegue.md) | Local, en el VPS (ifbotech.com/rootkit), y con dominio propio |

El checklist y el roadmap del producto entero están en
[root-kit/docs/roadmap.md](https://github.com/ifbotech/root-kit/blob/main/docs/roadmap.md).
