# ROOTLAB (root-lab)

La app y la nube de **ROOTKIT**, la maceta con sensores y pantalla. Cada
ROOTKIT es uno de cinco **Rooties** botánicos —Brote, Musgo, Pinchito, Bulbo
y Champi—: al principio muestra un QR, y después de abrir su cofre, unos ojos
que reaccionan a cómo está tu planta.

**ROOTLAB** es todo lo que el aparato no hace:

- **Cuentas** con email y contraseña: cada persona ve sólo sus plantas, desde
  cualquier teléfono. Recuperar la contraseña y confirmar el email por correo.
- **Vincular** un Rooti por su QR (la app lo reconoce: "¡Conectaste a tu
  Brote!") y **abrir el cofre**, que sortea su **piel**: común (70 %), rara
  (25 %) o épica (5 %). La maceta se pinta con esa paleta y la app también.
- **Reconocer la planta** con una foto y armar su **ficha de cuidados**.
- **Charlar con la planta**: contesta con su nombre, la personalidad de su
  Rooti y lo que miden sus sensores en ese momento.
- **Tablero** con tareas del día, gráficos, diagnóstico por foto y
  **notificaciones** cuando la planta necesita algo.
- **Paletas dinámicas**: clara como un libro de cuentos, la app se pinta con
  los colores de la piel de tu Rooti (quince pieles pastel) y **de noche** se
  apaga sola: de 22 a 8, con el sistema, o como elijas.
- **El Rooti entero**: en el teléfono se ve el personaje completo, con la
  cara del firmware en la ventana de su pantalla. Es una **mascota**: dos
  barras (salud, que dan los sensores, y felicidad, que dan los mimos),
  caricias que ronronean, polvo que se limpia con una esponja, snacks de
  gotas de rocío que se ganan con la planta cómoda, y de noche se sienta con
  su gorrito.
- **El Rooti en el teléfono**: la cara se ve con la luz que hay en la pieza,
  se deja **acariciar** (ojos en `^ ^`, vibración, corazones), habla con **su
  voz** mientras escribe y se queda a pantalla completa en el **modo
  escritorio**, sin que la pantalla se apague.
- **Cuánta agua, no sólo "regá"**: el sensor de tierra se **calibra** en dos
  pasos desde la ficha (con el número crudo en vivo), y con el diámetro de la
  maceta las tareas dicen "unos 540 ml, medio litro".
- **Regar antes**: con la ciudad, ROOTLAB cruza la velocidad a la que se
  seca la tierra con el pronóstico (Open-Meteo) y avisa un día antes del
  calor. Y para quien quiere ir a fondo, **VPD** y **DLI** en la pestaña
  Botánica.
- **Cuidador**: un enlace de 3, 7 o 15 días para quien riega mientras no
  estás: ve la cara, qué necesita y toca "ya regué"; te llega un push.
- **El invernadero**: todos los Rooties en un estante, mirándose; los
  vecinos miran preocupados al que tiene sed.
- **Recuerdos**: el álbum de fotos con fantasma de encuadre, antes/después
  y un GIF de evolución hecho en el teléfono; y el **pasaporte botánico**,
  una hoja A4 para guardar como PDF.
- **Una sola progresión**: la mascota es lo de hoy, el **vínculo** (días
  sanos → etapas → adornos en la cara) lo de meses. Sin XP ni niveles.
- **Paletas nocturnas** (Vibrant Tones, OLED Midnight, Cristal, Solar Gold),
  libres o ganadas cuidando; las veinte, legibles de día y de noche (WCAG AA).
- **Rooties que se actualizan solos**: firmware **firmado** por canales
  (beta y estable); la ficha muestra qué versión corre y si hay una nueva.
- **Operación**: fábrica que registra cada aparato (sin eso, una placa no
  entra), respaldos cifrados fuera del servidor con prueba de restauración
  mensual, vigía de caídas masivas y métricas anónimas sin terceros.
- **Sin red**: abre al instante con lo último que vio, los cambios esperan
  en una cola, el ícono muestra las tareas pendientes y tiene atajos.
- **Datos personales cifrados**, IA con **tope de gasto** y cuotas diarias; y
  si el servidor no tiene una IA de verdad, la app la esconde en vez de
  simularla.

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

1. Abrí el emulador. En *Fábrica* elegí qué Rooti es la figura (Brote por
   defecto).
2. **Pasarle el wifi** simula el portal cautivo.
3. **Abrir la app** (o escaneá el QR con el teléfono en la misma red).
4. En la app: empezar → crear cuenta → avisos → vincular ("¡Conectaste a tu
   Brote!") → **cofre**.
5. Mirá el emulador cuando se abre el cofre: abre los ojos con la piel que
   salió, y la carcasa toma su color.
6. Nombre, foto de una planta, y **Hablar con** tu planta.
7. Mové los deslizadores del emulador: la cara cambia, la app muestra tareas,
   la planta lo cuenta en la charla y, con los avisos activados, llega la
   notificación.

La tarjeta **Probar lo nuevo** del emulador acorta lo que en la vida real
lleva días:

| Botón | Para probar |
|---|---|
| Ver piel | las tres pieles en la pantalla y en el cuerpo, sin abrir otro cofre (sólo en el emulador) |
| Riego que se escurre | el detector de riego del firmware: el aviso y la tarea "el agua se escurrió" |
| 48 h de historial | gráficos, VPD/DLI, previsión de riego, álbum y pasaporte con datos, y gotas de rocío |
| Penumbra / Interior / Sol pleno | la cara con la luz de la pieza |
| Noche simulada | los Rooties sentados con gorrito y Zzz (pone la hora de prueba en 23 h; la app muestra una píldora para sacarla) |
| 3 días sin mimos | el polvo, la esponja y la felicidad que baja |
| +3 gotas de rocío | el snack |
| Ir a | la ficha con los mimos, el modo escritorio, el álbum, el pasaporte, el invernadero y la colección |
| Otro Rooti | abre `emulador/?n=2` (y así): otro aparato con su propia identidad, para el invernadero |
| Sensor sin calibrar | el capacitivo lee de menos hasta que se calibra desde la ficha ([docs/riego.md](docs/riego.md)) |
| Firmware | publicar cualquier archivo para la placa `emulador` y verlo bajar, verificar la firma y "reiniciar" ([docs/operacion.md](docs/operacion.md)) |

Sin configuración, todo funciona en local: la IA simulada se ve con
`ROOTLAB_IA_DEMO=1` (si no, la app esconde las funciones de IA, como en
producción), los emails quedan como `.eml` en `data/correos` (los enlaces andan) y
la clave maestra se genera en `data/secreto.key`. Para usar Claude y un relay
de correo, copiá `.env.example` a `.env`.

**En el teléfono**: el QR del emulador apunta a la IP de la compu en la red,
así que se puede escanear, pero instalar la app y recibir notificaciones
exigen HTTPS. Ver [docs/despliegue.md](docs/despliegue.md).

## Pruebas

```bash
npm test          # 453 pruebas
```

Flujo completo con un Rooti virtual, cuentas y aislamiento entre cuentas,
cifrado en reposo y migración de la base, Argon2id, recuperar la contraseña y
verificar el email, emails y plantillas, cuotas y tope de gasto de la IA,
chat con la API de Anthropic simulada, ficha y prompt, contraste WCAG de las
paletas, cabeceras de seguridad y ausencia de recursos de terceros, HTTP en
subruta, avisos, diagnóstico, tareas, caras, lo que el teléfono le agrega a
la cara (luz, voz, caricia, modo escritorio), el pronóstico y la previsión
de riego, VPD y DLI, el enlace del cuidador, las pieles y el cofre (70/25/5),
la mascota, y que las siluetas de los cuerpos se puedan imprimir sin
soportes (voladizos de 45° como máximo, base plana, centro de masa bajo), el
firmware firmado y sus canales, la fábrica y los modos de confianza, la
calibración y el riego por volumen, los respaldos cifrados y su restauración,
el vigía, las métricas y las veinte paletas de día y de noche.

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
  cofre.mjs              qué Rooti es cada aparato y qué piel sale del cofre
  firmware.mjs           versiones, canales y firma de las actualizaciones por aire
  vigia.mjs              muchos Rooties callados a la vez: avisar a quien opera
  respaldo.mjs           cifrar y abrir los respaldos que salen del servidor
  catalogo.mjs           especies curadas y Rooties (generados desde el firmware)
  codigo.mjs             código de vinculación, igual que el firmware
  push.mjs               Web Push con claves VAPID
  tiempo.mjs             días y meses por zona horaria
public/                  la app (PWA sin build)
  app.js                 rutas, sesión, alta
  tema.js                la paleta guardada antes de la primera pintada
  vistas/                alta, cuenta, cofre, hoy, plantas, mascota, calibrar, botánica, chat, escáner, Rooties,
                         ajustes, modo escritorio, cuidador, invernadero, álbum, pasaporte
  lib/                   rooties (generado), cuerpo, mascota, riego, reloj, paletas y tema, tareas, diagnóstico,
                         gamificación, caras, luz, caricias, voz, botánica, miradas, gif, pasaporte,
                         almacén y cola (sin red), API
  caras/                 el firmware en WebAssembly y las imágenes de las caras
  fuentes/               Nunito (OFL), servida desde la app
emulador/                el Rooti virtual
deploy/                  instalación en el VPS: script, servicios systemd (respaldo diario y su prueba mensual),
                         Caddy y la clave pública del firmware
tools/                   verificar un despliegue, respaldar y restaurar, publicar firmware, uso de la IA,
                         probar el correo, sincronizar el firmware
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
| [rooties.md](docs/rooties.md) | Los cinco Rooties, sus pieles, el cofre y el cuerpo que se imprime sin soportes |
| [mascota.md](docs/mascota.md) | Salud y felicidad: caricias, polvo, gotas de rocío y la noche |
| [riego.md](docs/riego.md) | Calibrar el sensor de tierra y decir cuánta agua |
| [operacion.md](docs/operacion.md) | Administración, firmware firmado, fábrica, respaldos que se prueban, vigía y métricas |
| [paletas.md](docs/paletas.md) | Las paletas de las pieles, las cosméticas y el motor de contraste |
| [accesibilidad.md](docs/accesibilidad.md) | WCAG AA: qué se garantiza, qué se arregló y cómo se audita |
| [notificaciones.md](docs/notificaciones.md) | Cuándo se avisa y cuándo no |
| [sensorial.md](docs/sensorial.md) | La cara en el teléfono: luz, caricias, voz y modo escritorio |
| [clima.md](docs/clima.md) | Regar antes con el pronóstico; VPD y DLI |
| [cuidador.md](docs/cuidador.md) | El enlace para quien riega mientras no estás |
| [invernadero.md](docs/invernadero.md) | Todos los Rooties en un estante, y hacia dónde miran |
| [album.md](docs/album.md) | El álbum de fotos (fantasma, antes/después, GIF) y el pasaporte |
| [sin-red.md](docs/sin-red.md) | Local primero, la cola de cambios, la insignia y los atajos |
| [despliegue.md](docs/despliegue.md) | Local, en el VPS (ifbotech.com/rootkit), el sitio principal endurecido, dominio propio |

El checklist y el roadmap del producto entero están en
[root-kit/docs/roadmap.md](https://github.com/ifbotech/root-kit/blob/main/docs/roadmap.md).
