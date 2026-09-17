# La mascota

Cada Rooti revelado es también una mascota, al estilo de Pou: en la ficha de
la planta se ve entero (`lib/cuerpo.mjs`) con dos barras y tres gestos. Las
reglas están en `public/lib/mascota.mjs`, puras y en milisegundos: las usa el
servidor, que es quien guarda y decide, y la app, que las muestra.

## Dos barras que no se mezclan

| Barra | De dónde sale | Cómo se sube |
|---|---|---|
| **Salud** | los sensores: la severidad del ánimo y qué tan centrada está la tierra en el rango de la especie (`saludBiologica`) | cuidando la planta de verdad |
| **Felicidad** | los mimos de la app | acariciando, limpiando, convidando snacks |

Una planta con sed no se arregla acariciándola, y la barra de salud lo dice.
Sin datos (sin lectura o sin señal) la salud se muestra vacía, no en cero.

| Salud | Valor |
|---|---|
| `OK` | 84 a 100 |
| `WATCH` | 52 a 68 |
| `URGENT` | 18 a 32 |

(dentro de cada tramo, más cuanto más centrada está la tierra.)

## Las reglas

| Constante | Valor | Qué hace |
|---|---|---|
| `FELICIDAD_INICIAL` | 60 | al abrir el cofre |
| `DECAE_POR_DIA` | 8 | la felicidad baja sola, de a poco |
| `CARICIA` | +5, una vez cada 4 h | las demás caricias se sienten igual (ronroneo, vibración, corazones) pero no suman |
| `LIMPIEZA` | +10 | al sacar la última mota |
| `SNACK` | +15, gasta una gota | |
| `POLVO` | desde los 3 días sin cuidados: 4 motas, una más cada 8 h, hasta 12 | |
| `GOTAS` | una cada 8 h de planta cómoda, hasta 9; 1 de bienvenida | |
| `NOCHE` | de 22 a 8 | se sienta con su gorrito; es sólo la escena |

**El polvo.** Cualquier cuidado reinicia su reloj mientras todavía no hay
polvo. Una vez que apareció, sólo lo saca la esponja: una caricia o un snack
no limpian.

**Las gotas de rocío.** El servidor las cuenta con las lecturas: cada tramo
entre dos lecturas con la planta cómoda (`HAPPY` y `OK`) suma tiempo; un
hueco de más de una hora cuenta como una hora (el Rooti no estaba midiendo).
Cada 8 h es una gota. Así el snack premia cuidar la planta, no abrir la app.

## Los gestos en la app (`public/vistas/mascota.mjs`)

- **Acariciar**: pasar el dedo por el cuerpo (Pointer Events, 14 px de
  movimiento, el scroll vertical sigue andando). Ronronea con todo el cuerpo,
  la cara pone `^ ^`, `navigator.vibrate` y corazones. La primera caricia de
  cada tanda se le cuenta al servidor si ya pasaron las 4 h.
- **Limpiar**: con polvo, el botón pone la esponja (y lleva el Rooti a la
  vista). Se frota sobre las motas, que se van de a una con burbujas, un
  sonido de burbujas y una vibración corta; al sacar la última se le cuenta
  al servidor.
- **Snack de rocío**: una gota vuela a la boca, suena un "ñam" y la cara se
  pone contenta un segundo.

La pista de abajo dice cuánto falta para que la próxima caricia sume, cuántas
motas hay y cuánto falta para la próxima gota. Los sonidos respetan el mute
y el silencio nocturno de la voz ([sensorial.md](sensorial.md)).

La ficha no se repinta sola en medio de una caricia o con la esponja en la
mano, y la firma de repintado (`firmaTablero`) no cuenta la cuenta regresiva
de la caricia ni los segundos de la última lectura.

## API

`POST /api/plantas/:id/mascota` con `{ accion: "caricia" | "limpiar" | "snack" }`
→ `{ accion, suma, motivo, mascota }`. `409` sin polvo, sin gotas o con el
cofre cerrado. Cada planta trae `mascota` en `/api/estado`:
`{ felicidad, polvo, gotas, caricia_en_ms, optimo_pct, ultima_interaccion }`.

Se guarda en `plantas.mascota` (JSON) y nace al abrir el cofre.

## Probarlo sin esperar días

En el emulador, tarjeta **Probar lo nuevo**:

- **3 días sin mimos** y **+3 gotas de rocío** llaman a `POST /api/d/demo`,
  que sólo acepta a la placa `emulador`.
- **Noche simulada** pone la hora de prueba (`localStorage`
  `rootlab:demo-hora`, `lib/reloj.mjs`); la app la lee en vivo y muestra una
  píldora "Hora de prueba: 23 h ✕" para sacarla.
- **48 h de historial** manda dos días de lecturas cómodas: suman gotas.

## Pruebas

`test/mascota.test.mjs` (las reglas: felicidad, caricia con espera, polvo que
sólo limpia la esponja, snack sin gotas, gotas con huecos, noche, salud) y la
suite `la piel del cofre y la mascota` de `test/api.test.mjs` (la ruta, las
gotas desde el sync, el emulador y una placa real).
