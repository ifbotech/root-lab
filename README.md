# root-lab

La app y la nube de **ROOTKIT**: la maceta con sensores y una pantalla que
muestra un QR al principio y unos ojos después.

Acá vive todo lo que el aparato no hace: vincularlo a una cuenta, abrir el
cofre para descubrir quién es, identificar la planta con una foto, mostrar el
tablero y avisar al teléfono cuando la planta necesita algo. El firmware, el
hardware y las carcasas están en
[root-kit](https://github.com/ifbotech/root-kit).

## Probarlo en la compu

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
4. En la app: empezar → avisos → el wifi ya está → vincular → **cofre**.
5. Mirá el emulador cuando se abre el cofre: abre los ojos.
6. Nombre, foto de una planta, y listo.
7. Mové los deslizadores del emulador: la cara cambia, la app muestra tareas
   y, si activaste los avisos, llega la notificación.

Sin `ANTHROPIC_API_KEY` la identificación por foto es **simulada** (la app lo
avisa). Para usar Claude, copiá `.env.example` a `.env` y poné la clave.

## Probarlo en el teléfono

El QR del emulador apunta a la IP de la compu en la red (`http://192.168.x.x:8080`),
así que se puede escanear. Pero **instalar la app y recibir notificaciones
exigen HTTPS**: para eso hace falta un túnel. Ver
[docs/despliegue.md](docs/despliegue.md).

## Pruebas

```bash
npm test          # 117 pruebas: API, flujo completo, avisos, IA, caras, tareas
```

## Estructura

```
server/
  index.mjs        servidor HTTP: app, emulador, API
  api.mjs          toda la lógica, sin HTTP (así se prueba)
  avisos.mjs       qué notificación mandar y cuándo callarse
  ia.mjs           identificación y diagnóstico por foto (Claude o simulada)
  cofre.mjs        qué personaje sale del cofre
  catalogo.mjs     especies curadas y personajes (generados desde el firmware)
  codigo.mjs       código de vinculación, igual que el firmware
  push.mjs         Web Push con claves VAPID
  almacen.mjs      datos en un archivo JSON atómico
public/            la app (PWA sin build)
  app.js           rutas, estado, alta
  vistas/          alta, cofre, hoy, plantas, escáner, colección, ajustes
  lib/             lógica pura: tareas, diagnóstico, gamificación, caras
  caras/           el firmware en WebAssembly y las imágenes de las caras
emulador/          el ROOTKIT virtual
tools/             sincronizar con el firmware, íconos
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
| [despliegue.md](docs/despliegue.md) | Local, en el teléfono con túnel, y en producción |

El checklist y el roadmap del producto entero están en
[root-kit/docs/roadmap.md](https://github.com/ifbotech/root-kit/blob/main/docs/roadmap.md).
