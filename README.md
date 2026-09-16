# ROOTLAB (root-lab)

La app y la nube de **ROOTKIT**, la maceta con sensores y pantalla. Cada
ROOTKIT tiene un personaje, su **Rooti**: al principio muestra un QR, y
después de abrir su cofre, unos ojos que reaccionan a cómo está tu planta.

**ROOTLAB** es todo lo que el aparato no hace:

- **Cuentas** con email y contraseña: cada persona ve sólo sus plantas, desde
  cualquier teléfono. Recuperar la contraseña y confirmar el email por correo.
- **Vincular** un Rooti por su QR y **abrir el cofre** para descubrir quién es.
- **Reconocer la planta** con una foto y armar su **ficha de cuidados**.
- **Charlar con la planta**: contesta con su nombre, la personalidad de su
  Rooti y lo que miden sus sensores en ese momento.
- **Tablero** con tareas del día, gráficos, diagnóstico por foto y
  **notificaciones** cuando la planta necesita algo.
- **Paletas dinámicas**: la app se pinta con los colores de tu Rooti.
- **El Rooti en el teléfono**: la cara se ve con la luz que hay en la pieza,
  se deja **acariciar** (ojos en `^ ^`, vibración, corazones), habla con **su
  voz** mientras escribe y se queda a pantalla completa en el **modo
  escritorio**, sin que la pantalla se apague.
- **Regar antes**: con la ciudad, ROOTLAB cruza la velocidad a la que se
  seca la tierra con el pronóstico (Open-Meteo) y avisa un día antes del
  calor. Y para quien quiere ir a fondo, **VPD** y **DLI** en la pestaña
  Botánica.
- **Cuidador**: un enlace de 3, 7 o 15 días para quien riega mientras no
  estás: ve la cara, qué necesita y toca "ya regué"; te llega un push.
- **Datos personales cifrados**, IA con **tope de gasto** y cuotas diarias.

El firmware, el hardware y las carcasas están en
[root-kit](https://github.com/ifbotech/root-kit).

## En línea

**https://ifbotech.com/rootkit/** · emulador en
**https://ifbotech.com/rootkit/emulador/**. Cómo se instala, se actualiza y
se verifica: [docs/despliegue.md](docs/despliegue.md).

## Probarlo en la compu

Necesita **Node 24.7 o más nuevo** (`node:sqlite` y Argon2id).

```bash
npm install
npm start
```

| | |
|---|---|
| **App** | http://localhost:8080 |
| **Emulador** | http://localhost:8080/emulador/ |

El **emulador** es un Rooti en el navegador que corre el firmware real
compilado a WebAssembly y habla con este servidor igual que la placa:

1. Abrí el emulador. En *Fábrica* elegí **Chico Malo** o **Chica Chill** para
   ver cómo la app se pinta con su paleta (o dejá que el cofre tire).
2. **Pasarle el wifi** simula el portal cautivo.
3. **Abrir la app** (o escaneá el QR con el teléfono en la misma red).
4. En la app: empezar → crear cuenta → avisos → vincular → **cofre**.
5. Mirá el emulador cuando se abre el cofre: abre los ojos.
6. Nombre, foto de una planta, y **Hablar con** tu planta.
7. Mové los deslizadores del emulador: la cara cambia, la app muestra tareas,
   la planta lo cuenta en la charla y, con los avisos activados, llega la
   notificación.

Sin configuración, todo funciona en local: la IA es **simulada** (la app lo
avisa), los emails quedan como `.eml` en `data/correos` (los enlaces andan) y
la clave maestra se genera en `data/secreto.key`. Para usar Claude y un relay
de correo, copiá `.env.example` a `.env`.

**En el teléfono**: el QR del emulador apunta a la IP de la compu en la red,
así que se puede escanear, pero instalar la app y recibir notificaciones
exigen HTTPS. Ver [docs/despliegue.md](docs/despliegue.md).

## Pruebas

```bash
npm test          # 247 pruebas
```

Flujo completo con un Rooti virtual, cuentas y aislamiento entre cuentas,
cifrado en reposo y migración de la base, Argon2id, recuperar la contraseña y
verificar el email, emails y plantillas, cuotas y tope de gasto de la IA,
chat con la API de Anthropic simulada, ficha y prompt, contraste WCAG de las
paletas, cabeceras de seguridad y ausencia de recursos de terceros, HTTP en
subruta, avisos, diagnóstico, tareas, caras, lo que el teléfono le agrega a
la cara (luz, voz, caricia, modo escritorio), el pronóstico y la previsión
de riego, VPD y DLI, y el enlace del cuidador.

Contra un servidor desplegado: `node tools/verificar-despliegue.mjs <url> --flujo`.

## Estructura

```
server/
  index.mjs              arranque y configuración
  http.mjs               transporte: estáticos, subruta (/rootkit), cabeceras de seguridad
  api.mjs                toda la lógica, sin HTTP (así se prueba)
  db.mjs                 SQLite: el único que escribe SQL; cifra y descifra acá
  cripto.mjs             clave maestra, AES-256-GCM, índice ciego, pimienta
  claves.mjs             contraseñas: Argon2id con pimienta
  correo.mjs             Nodemailer por SMTP, con cola y reintentos
  plantillas-correo.mjs  los emails, en texto y HTML con la paleta de la cuenta
  ia.mjs                 reconocer, diagnosticar y charlar (Claude o simulada)
  presupuesto.mjs        tope de gasto y cuotas de la IA
  ficha.mjs              ficha de cuidados, prompt del chat y datos en vivo
  avisos.mjs             qué notificación mandar y cuándo callarse
  clima.mjs              el pronóstico (Open-Meteo) y el riego que se anticipa
  cofre.mjs              qué Rooti sale del cofre
  catalogo.mjs           especies curadas y Rooties (generados desde el firmware)
  codigo.mjs             código de vinculación, igual que el firmware
  push.mjs               Web Push con claves VAPID
  tiempo.mjs             días y meses por zona horaria
public/                  la app (PWA sin build)
  app.js                 rutas, sesión, alta
  tema.js                la paleta guardada antes de la primera pintada
  vistas/                alta, cuenta, cofre, hoy, plantas, botánica, chat, escáner, Rooties, ajustes, modo escritorio, cuidador
  lib/                   paletas y tema, tareas, diagnóstico, gamificación, caras, luz, caricias, voz, botánica, API
  caras/                 el firmware en WebAssembly y las imágenes de las caras
  fuentes/               Nunito (OFL), servida desde la app
emulador/                el Rooti virtual
deploy/                  instalación en el VPS: script, servicios systemd, respaldo diario, Caddy
tools/                   verificar un despliegue, respaldar, uso de la IA, probar el correo, sincronizar el firmware
test/
docs/
```

## Documentación

| | |
|---|---|
| [arquitectura.md](docs/arquitectura.md) | Cómo encajan app, nube y Rooti; las tablas |
| [flujo.md](docs/flujo.md) | El alta paso a paso, y por qué en ese orden |
| [api.md](docs/api.md) | La API de la app y la del aparato |
| [seguridad.md](docs/seguridad.md) | Cifrado, contraseñas, clave maestra, cabeceras, servidor |
| [ia.md](docs/ia.md) | Reconocer, diagnosticar, charlar; tope de gasto y cuotas |
| [correo.md](docs/correo.md) | Nodemailer + Brevo, SPF/DKIM/DMARC, plantillas |
| [paletas.md](docs/paletas.md) | Paletas dinámicas y cómo agregar la de un Rooti nuevo |
| [notificaciones.md](docs/notificaciones.md) | Cuándo se avisa y cuándo no |
| [sensorial.md](docs/sensorial.md) | La cara en el teléfono: luz, caricias, voz y modo escritorio |
| [clima.md](docs/clima.md) | Regar antes con el pronóstico; VPD y DLI |
| [cuidador.md](docs/cuidador.md) | El enlace para quien riega mientras no estás |
| [despliegue.md](docs/despliegue.md) | Local, en el VPS (ifbotech.com/rootkit), el sitio principal endurecido, dominio propio |

El checklist y el roadmap del producto entero están en
[root-kit/docs/roadmap.md](https://github.com/ifbotech/root-kit/blob/main/docs/roadmap.md).
