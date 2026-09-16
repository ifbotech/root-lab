# Arquitectura

```
   ROOTKIT (placa o emulador)                 root-lab
  ┌─────────────────────────┐  POST        ┌──────────────────────────────┐
  │ firmware: sensores,     │ /api/d/sync  │ server/api.mjs               │
  │ ánimo, QR, ojos         │ ───────────► │  dispositivos · plantas ·    │
  │                         │ ◄─────────── │  cuentas · lecturas · cofre  │
  └─────────────────────────┘  vínculo,    │                              │
                               especie...  │ server/avisos.mjs ─► push.mjs│──► Web Push
                                           │ server/ia.mjs ─────► Claude  │
                                           └──────────────▲───────────────┘
                                                          │ /api/...
                                           ┌──────────────┴───────────────┐
                                           │ public/ (PWA)                 │
                                           │ alta · tablero · colección    │
                                           │ caras: firmware en WASM       │
                                           └───────────────────────────────┘
```

## Tres reglas

**1. La maceta decide su cara.** El ánimo lo evalúa el firmware con los
umbrales de la especie, y llega ya resuelto en cada lectura (`animo`, `sev`).
El servidor no lo recalcula: si lo hiciera, la maceta y el teléfono podrían
mostrar caras distintas de la misma planta.

**2. La nube decide lo que necesita ver el día entero.** Días sanos, racha,
cuándo avisar, si un aparato dejó de reportar. La maceta duerme la mayor parte
del tiempo; la nube no.

**3. Las caras se dibujan una sola vez.** `public/caras/rootkit_caras.wasm` es
el firmware compilado. La app, el emulador y las imágenes de las
notificaciones salen de ahí. `npm run firmware` lo actualiza desde root-kit.

## Datos

`server/almacen.mjs` guarda todo en `data/rootlab.json` con escritura atómica.
Para un piloto de cientos de macetas alcanza y se respalda copiando un
archivo; el resto del servidor sólo ve un objeto, así que pasar a una base de
datos toca un archivo.

| Colección | Clave | Qué guarda |
|---|---|---|
| `cuentas` | id | hashes de tokens, zona horaria, colección |
| `dispositivos` | id del aparato | hash del token, último estado, código actual y su época, última lectura |
| `plantas` | id | cuenta, aparato, época del vínculo, personaje, cofre, nombre, especie, días sanos, pantalla |
| `lecturas` | id del aparato | hasta 4000 lecturas (~40 días) |
| `suscripciones` | cuenta | suscripciones Web Push |
| `avisos` | planta | cuándo se mandó cada tipo de aviso |
| `transferencias` | código | códigos de 10 minutos para pasar la cuenta |

**Una planta es un vínculo.** Existe desde que una cuenta reclama un aparato
hasta que se desvincula. El historial de una planta sólo muestra lecturas
posteriores a su creación: lo que midió el aparato para el dueño anterior no
es de nadie más.

## La app

PWA sin build: HTML, CSS y módulos ES. Se instala desde el QR, abre a
pantalla completa y se actualiza sola. El service worker cachea el armazón y
**nunca** los datos: una lectura vieja mostrada como actual hace regar una
planta mojada.

| Ruta | Vista |
|---|---|
| `/v/<CÓDIGO>` | el alta de ese ROOTKIT (o su planta, si ya es tuyo) |
| `/#hoy` | caras, tareas, contadores, nivel |
| `/#plantas`, `/#planta/<id>` | lista y detalle |
| `/#diagnostico/<id>`, `/#especie/<id>` | cámara |
| `/#coleccion`, `/#ajustes`, `/#agregar` | |

## Cuentas

Anónimas. La primera vez que se abre la app se crea una cuenta y el teléfono
guarda un token. Para llevarla a otro teléfono (o de Safari a la app instalada
en iPhone, que no comparten almacenamiento) hay un código de transferencia de
un solo uso en Ajustes.
