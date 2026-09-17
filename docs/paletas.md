# Paletas

ROOTLAB se pinta con la piel de tu Rooti. Este documento es para quien
diseña (Rocío) y para quien toca el código.

## Cómo funciona para quien usa la app

- La primera vez, la app usa **ROOTLAB**: papel, hoja y miel, clara como un
  libro de cuentos.
- **De día y de noche.** La paleta ROOTLAB y las quince pieles son claras y
  cada una tiene su versión de noche (los mismos colores, sobre fondo
  profundo). En **Ajustes → De día y de noche** se elige: *Auto* (de noche de
  22 a 8, cuando el Rooti se sienta a dormir), *Sistema* (lo que diga el
  teléfono), *Día* o *Noche*. Es de esa pantalla, no de la cuenta.
- Cada Rooti tiene tres **pieles** (común, rara, épica) y cada piel es una
  paleta. Cuando abrís el cofre y sale la piel, apenas aparece la app se pinta
  con sus colores: un círculo que crece desde el cofre hasta cubrir la
  pantalla. La paleta queda guardada en la cuenta y se ve igual en todos tus
  teléfonos (y en los emails). Reabrir un cofre ya abierto no la cambia.
- En **Ajustes → Paleta** podés volver a la de ROOTLAB, elegir cualquier piel
  que ya te salió o una cosmética que ganaste. Las que faltan se ven apagadas,
  con candado y el motivo.

## Las pieles

Salen de `root-kit/firmware/core/persona.c`, la misma tabla con la que la
maceta pinta la cara: `npm run firmware` las copia a
`public/lib/rooties.mjs`, y `paletas.mjs` arma una paleta por piel. Cada una
tiene cuatro colores: **fondo** (la pantalla), **ojos** (ojos, boca, cejas),
**piel** (el cuerpo, la flor o el sombrero) y **rubor** (mejillas).

| Rooti | Común | Rara | Épica |
|---|---|---|---|
| Brote | Hoja Nueva `#e8f5e9` `#1b5e20` `#a5d6a7` `#ff8a80` | Lavanda `#f3e5f5` `#4a148c` `#ce93d8` `#ea80fc` | Flor de Cerezo Dorada `#fff8e1` `#e65100` `#ffe082` `#ff5252` |
| Musgo | Musgo `#f1f8e9` `#33691e` `#c5e1a5` `#aed581` | Glaciar `#e0f7fa` `#006064` `#80deea` `#4dd0e1` | Otoño Tostado `#fbe9e7` `#bf360c` `#ffab91` `#ff7043` |
| Pinchito | Desierto `#e8f5e9` `#2e7d32` `#fff176` `#ff80ab` | Melocotón `#fce4ec` `#880e4f` `#f8bbd0` `#ff4081` | Medianoche Neón `#eceff1` `#0d47a1` `#90caf9` `#ffd600` |
| Bulbo | Limonada `#fffde7` `#827717` `#fff59d` `#ffab91` | Lila Místico `#ede7f6` `#311b92` `#b39ddb` `#b388ff` | Galáctico `#e8eaf6` `#1a237e` `#7986cb` `#ff4081` |
| Champi | Bosque `#efebe9` `#3e2723` `#d7ccc8` `#ff8a80` | Amanita Rosa `#fce4ec` `#ad1457` `#f48fb1` `#ffcdd2` | Bioluminiscente `#e0f2f1` `#004d40` `#80cbc4` `#69f0ae` |

Los ids son `<rooti>-<rareza>`: `brote-comun`, `musgo-raro`, `champi-epico`.

**Los roles de una piel** salen de sus cuatro colores: los ojos son el botón
principal y la tinta, la piel tiñe paneles y bordes, el rubor es el acento y
el destacado. Los estados (bien `#2e7d32`, atención `#e65100`, urgente
`#c62828`) son fijos: una piel lila no puede dejar a "urgente" sin rojo.

**Son temas claros**, pastel, de libro de cuentos: fondo del color de la
pantalla, paneles casi blancos, tinta de los ojos oscurecida. Llevan
`estilo: 'claro'` (`<html data-estilo="claro">`) para suavizar sombras.

**De noche, los roles de una piel se dan vuelta** (`rolesDeNoche`): la piel
—pastel— pasa a ser el botón que brilla, sobre un fondo profundo teñido con
el color de los ojos; el rubor sigue siendo el acento, y los estados usan un
verde, un ámbar y un rojo que se leen sobre oscuro.

## ROOTLAB, la paleta por defecto

Papel `#f5f8ee` (fondo), Hoja `#2f7d3a` (botón principal), Brote tierno
`#cfe3bd` (paneles y bordes), Río `#2b6f9e` (enlaces), Miel `#e0a526`
(logros), Pétalo `#e2718a` (acento). De noche: fondo teñido de `#3f6b4a`, con
`#9ccc65`, `#64b5f6`, `#ffd54f` y `#f48fb1`. Son datos en `PALETAS`
(`roles` y `noche`): Rocío los cambia sin tocar nada más.

Antes la app era oscura hasta abrir el cofre y pastel después: dos productos.
Ahora es el mismo libro de cuentos de punta a punta, y lo oscuro es la noche.

## Vibrant Tones

La primera paleta de ROOTLAB, nocturna. Queda como cosmética libre: se elige
en Ajustes y es oscura a toda hora, igual que OLED, Cristal y Solar.

Strawberry Red `#f94144`, Pumpkin Spice `#f3722c`, Carrot Orange `#f8961e`,
Atomic Tangerine `#f9844a`, Tuscan Sun `#f9c74f`, Willow Green `#90be6d`,
Seaweed `#43aa8b`, Dark Cyan `#4d908e`, Blue Slate `#577590`, Cerulean
`#277da1`. El fondo se deriva de Blue Slate.

| Rol | Qué pinta | Vibrant Tones |
|---|---|---|
| `fondo` | el fondo de la app (si no se da, sale de `base`) | *(de Blue Slate)* |
| `base` | tiñe paneles y bordes | Blue Slate |
| `primario` | botón principal, progreso, marca | Willow Green |
| `secundario` | enlaces, foco, pestaña activa, burbuja propia del chat | Cerulean |
| `destacado` | experiencia, logros, "Pro" | Tuscan Sun |
| `acento` | revelaciones del diagnóstico | Atomic Tangerine |
| `bien` / `atencion` / `urgente` | estados de la planta | Seaweed / Carrot Orange / Strawberry Red |
| `datos` | series del gráfico (tierra, temperatura, luz, humedad) | Cerulean, Pumpkin Spice, Tuscan Sun, Dark Cyan |

## Las cosméticas: se ganan cuidando

| Paleta | Cómo es | Cómo se gana |
|---|---|---|
| **OLED Midnight** | negro absoluto (`#000000`) y verde fósforo / esmeralda; sin degradés, para pantallas OLED | libre |
| **Cristal** | vidrio esmerilado: paneles translúcidos con desenfoque (`backdrop-filter`) sobre azul hielo, con luces de color detrás | una piel **épica**, **o** una planta con 60 días sanos |
| **Solar Gold** | oro y ámbar sobre marrón tostado | una planta con 180 días sanos |

Cada una trae un `estilo` (`oled`, `cristal`, `solar`) que `tema.mjs` pone
en `<html data-estilo>` para lo que los tokens no pueden decir, y un
`requisito` que el servidor verifica al elegirla (`PATCH /api/cuenta`,
`403` si no se cumple) con lo que sabe: la colección de pieles y los días
sanos de cada planta.

**Decisiones que no son obvias**

- **Los estados siempre se reconocen**: verde es bien, ámbar es atención,
  rojo es urgente, en todas las paletas, y nunca dependen sólo del color:
  siempre van con texto ("URGENTE") o ícono.
- **Las rarezas del cofre (común, rara, épica) no cambian con la paleta**:
  son del juego de colección (`--comun`, `--raro`, `--epico`).
- **El globo de lo que dice el Rooti** usa `--globo` y `--sobre-globo`:
  blanco con la tinta de la paleta en los temas claros, blanco con el fondo
  en los oscuros.

## El motor garantiza que se lea

`public/lib/paletas.mjs` → `temaDesdePaleta()` convierte roles en unas 40
variables de CSS y **asegura el contraste WCAG AA**:

- texto principal: 7:1 contra fondo y paneles;
- texto secundario y de color: 4,5:1;
- texto sobre botones de color: 4,5:1 (elige blanco o tinta oscura, y si
  ninguno llega, ajusta el color del botón);
- series de gráficos: 3:1 contra el panel;
- el texto del globo: 7:1.

Si un color no llega —un azul profundo sobre azul noche, un amarillo pastel
sobre crema— se aclara (en los temas oscuros) o se oscurece (en los claros)
**lo justo**, mezclando en OKLab para que no cambie de tono. Por eso cada rol
tiene su versión `-texto`: `--urgente` es el color lleno de un chip y
`--urgente-texto` el mismo rojo, garantizado legible como letra.

`test/paletas.test.mjs` recorre las 20 paletas **de día y de noche** y falla
si algún par no cumple, si un tema claro no es claro, si uno de noche no es
oscuro o si una piel no tiene exactamente los colores del firmware.

## Cambiar una piel

1. En `root-kit/firmware/core/persona.c`, los cuatro `RK_HEX(...)` de esa
   piel (y sus adornos: brillos, aura, corona, luces).
2. `make test` y `make golden` en root-kit (cambian las caras), `npm run
   firmware` en root-lab (regenera `rooties.mjs`, el WebAssembly y las
   imágenes de las notificaciones).
3. `npm test`. Si el motor tuvo que ajustar mucho un color, el test igual
   pasa; conviene mirar la app.

No hay que tocar CSS ni vistas.

## Cómo se aplica (código)

| Archivo | Qué hace |
|---|---|
| `public/lib/rooties.mjs` | generado: los cinco Rooties y sus tres pieles |
| `public/lib/paletas.mjs` | datos + motor de color (OKLab, contraste WCAG); `paletaDeRooti(rooti, rareza)` |
| `public/lib/tema.mjs` | `aplicarPaleta(id, { animar, origen })`: variables en `<html>`, `theme-color`, recuerdo en el teléfono (los tokens de día y los de noche), animación con View Transitions; `fijarModo`, `vigilarNoche` |
| `public/lib/reloj.mjs` | `esModoNoche(modo, hora, oscuroDelSistema)`: la regla, pura; respeta la hora de prueba del emulador |
| `public/tema.js` | script clásico en el `<head>`: aplica la paleta guardada, de día o de noche con la misma regla, antes de la primera pintada (sin parpadeo) |
| `public/style.css` | `:root` con los valores de ROOTLAB de día (por si no carga JS); todo lo demás usa variables |
| `server/api.mjs` | `cuentas.paleta`; el cofre la cambia a la piel que salió; `PATCH /api/cuenta {paleta}` valida que tengas esa piel o el requisito |
| `server/plantillas-correo.mjs` | los emails usan la paleta de la cuenta |

Si el navegador no tiene View Transitions o la persona pidió menos movimiento,
el cambio es instantáneo.
