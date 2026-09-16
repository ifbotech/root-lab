# Paletas

ROOTLAB se pinta con la paleta de tu Rooti. Este documento es para quien
diseña (Rocío) y para quien toca el código.

## Cómo funciona para quien usa la app

- La primera vez, la app usa **Vibrant Tones**, la paleta de ROOTLAB.
- Cuando abrís un cofre y te toca un Rooti **con paleta propia** (hoy: Chico
  Malo y Chica Chill), apenas aparece la app se pinta con sus colores: un
  círculo que crece desde el cofre hasta cubrir la pantalla. La paleta queda
  guardada en la cuenta y se ve igual en todos tus teléfonos (y en los emails).
- Un Rooti sin paleta propia no cambia la que tenías.
- En **Ajustes → Paleta** podés volver a Vibrant Tones o elegir la de
  cualquier Rooti que ya tengas. Las de los que te faltan se ven apagadas, con
  candado.

## Las paletas de hoy

**Vibrant Tones** (ROOTLAB): Strawberry Red `#f94144`, Pumpkin Spice
`#f3722c`, Carrot Orange `#f8961e`, Atomic Tangerine `#f9844a`, Tuscan Sun
`#f9c74f`, Willow Green `#90be6d`, Seaweed `#43aa8b`, Dark Cyan `#4d908e`,
Blue Slate `#577590`, Cerulean `#277da1`.

**Chico Malo**: Ink Black `#03071e`, Night Bordeaux `#370617`, Black Cherry
`#6a040f`, Oxblood `#9d0208`, Brick Ember `#d00000`, Red Ochre `#dc2f02`,
Autumn Leaf `#e85d04`, Dark Orange `#f48c06`, Orange `#faa307`, Amber Flame
`#ffba08`.

**Chica Chill**: Smart Blue `#0466c8`, Steel Azure `#0353a4`, Regal Navy
`#023e7d`, Prussian Blue `#002855` / `#001845` / `#001233`, Twilight Indigo
`#33415c`, Blue Slate `#5c677d`, Slate Grey `#7d8597`, Cool Steel `#979dac`.

## Cómo se combinan: los roles

Una paleta son sus colores **y los roles** de algunos de ellos. Los roles dicen
la intención; el motor calcula el resto.

| Rol | Qué pinta | Vibrant Tones | Chico Malo | Chica Chill |
|---|---|---|---|---|
| `fondo` | el fondo de la app (si no se da, sale de `base`) | *(de Blue Slate)* | Ink Black | Prussian Blue `#001233` |
| `base` | tiñe paneles y bordes | Blue Slate | Oxblood | Steel Azure |
| `primario` | botón principal, progreso, marca | Willow Green | Amber Flame | Smart Blue |
| `secundario` | enlaces, foco, pestaña activa, burbuja propia del chat | Cerulean | Orange | Smart Blue |
| `destacado` | experiencia, logros, "Pro" | Tuscan Sun | Amber Flame | Cool Steel |
| `acento` | revelaciones del diagnóstico | Atomic Tangerine | Autumn Leaf | Blue Slate |
| `bien` / `atencion` / `urgente` | estados de la planta | Seaweed / Carrot Orange / Strawberry Red | *verde de estado* / Dark Orange / Brick Ember | *verde, ámbar y coral de estado* |
| `datos` | series del gráfico (tierra, temperatura, luz, humedad) | Cerulean, Pumpkin Spice, Tuscan Sun, Dark Cyan | Orange, Red Ochre, Amber Flame, Autumn Leaf | Smart Blue, *ámbar*, Cool Steel, Blue Slate |

**Decisiones que no son obvias**

- **El tema es oscuro en todas las paletas**: la app se mira de noche, al lado
  de la planta, y los colores de los Rooties brillan sobre fondo profundo.
  Vibrant Tones no tiene colores oscuros: el fondo se deriva de Blue Slate.
- **Los estados siempre se reconocen**: verde es bien, ámbar es atención, rojo
  es urgente. Chico Malo no tiene verde y Chica Chill no tiene cálidos, así
  que esos estados usan un verde, un ámbar y un coral armonizados, y el resto
  de la interfaz queda con la paleta. Además los estados nunca dependen sólo
  del color: siempre van con texto ("URGENTE") o ícono.
- **En Chico Malo el rojo es de alarma**: el botón principal es Amber Flame y
  no Brick Ember, para que "urgente" siga siendo lo único rojo que grita.
- **Las rarezas del cofre (común, raro, secreto) no cambian con la paleta**:
  son del juego de colección.

## El motor garantiza que se lea

`public/lib/paletas.mjs` → `temaDesdePaleta()` convierte roles en unas 40
variables de CSS y **asegura el contraste WCAG AA**:

- texto principal: 7:1 contra fondo y paneles;
- texto secundario y de color: 4,5:1;
- texto sobre botones de color: 4,5:1 (elige blanco o tinta oscura, y si
  ninguno llega, ajusta el color del botón);
- series de gráficos: 3:1 contra el panel.

Si un color de la paleta no llega (un azul profundo como texto sobre azul
noche), se aclara **lo justo**, mezclando en el espacio OKLab para que no
cambie de tono. Por eso cada rol tiene su versión `-texto`: `--urgente` es el
color lleno de un chip y `--urgente-texto` el mismo rojo, garantizado legible
como letra.

`test/paletas.test.mjs` recorre todas las paletas y falla si algún par no
cumple. Una paleta nueva que no se lea no puede llegar a producción.

## Agregar la paleta de un Rooti nuevo

1. En `public/lib/paletas.mjs`, un objeto más en `PALETAS`: `id`, `nombre`,
   `rooti` (el id del Rooti en el firmware), `colores` (nombre, hex y nota,
   como los entrega la artista) y `roles`.
2. La cara del Rooti se define en `root-kit/firmware/core/persona.c` con
   colores de esa misma paleta (piel, sombra, trazo, iris, acento).
3. `npm test`. Si el motor tuvo que ajustar mucho un color, el test igual
   pasa; conviene mirar la app y, si el ajuste no gusta, elegir otro rol.

No hay que tocar CSS ni vistas.

## Cómo se aplica (código)

| Archivo | Qué hace |
|---|---|
| `public/lib/paletas.mjs` | datos + motor de color (OKLab, contraste WCAG) |
| `public/lib/tema.mjs` | `aplicarPaleta(id, { animar, origen })`: variables en `<html>`, `theme-color`, recuerdo en el teléfono, animación con View Transitions |
| `public/tema.js` | script clásico en el `<head>`: aplica la paleta guardada antes de la primera pintada (sin parpadeo) |
| `public/style.css` | `:root` con los valores de Vibrant Tones (por si no carga JS); todo lo demás usa variables |
| `server/api.mjs` | `cuentas.paleta`; el cofre la cambia si el Rooti tiene paleta; `PATCH /api/cuenta {paleta}` valida que tengas al Rooti |
| `server/plantillas-correo.mjs` | los emails usan la paleta de la cuenta |

Si el navegador no tiene View Transitions o la persona pidió menos movimiento,
el cambio es instantáneo.
