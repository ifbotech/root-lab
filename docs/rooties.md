# Los Rooties

Cinco personajes botánicos, cada uno con tres pieles. Este documento cubre
quién es quién, cómo se decide qué Rooti y qué piel tiene cada aparato, y
cómo se dibuja el personaje entero en la app. La cara de la maceta está
documentada en [root-kit/docs/firmware.md](https://github.com/ifbotech/root-kit/blob/main/docs/firmware.md).

## Los cinco

| Rooti | Silueta | Personalidad (chat y voz) | Cara |
|---|---|---|---|
| **Brote** | semilla redonda con dos hojitas arriba | curiosa y entusiasta | ojos redondos enormes con brillos de cachorro, sin cejas |
| **Musgo** | domo bajo y ancho, con matas de musgo en relieve | serena y zen | ojos en medialuna "u u", boca de gato |
| **Pinchito** | cactus columnar con una flor arriba y un brazo que saluda | hiperactiva y alegre | ojos en arco "^ ^" que guiñan, sonrisa con dientecito |
| **Bulbo** | cebolla en forma de gota, con un collar de pétalos | soñadora y un poco mágica | ojos grandes con doble brillo, cejas flotantes |
| **Champi** | hongo: sombrero con manchas sobre un tallo | glotona y charlatana | cejas finas, boca ":D" con lengua, pecas |

La tabla de datos es una sola: `root-kit/firmware/core/persona.c`.
`npm run firmware` la copia a `public/lib/rooties.mjs` (nombres, lemas y
colores), compila el módulo de caras y genera las imágenes de las
notificaciones (`public/caras/<rooti>-<rareza>-<ANIMO>.png` y
`<rooti>-dormido.png`).

## La figura define el Rooti; el cofre, la piel

**Qué Rooti es** lo decide la figura impresa que viene en la caja. La fábrica
lo graba en la NVS del aparato (`persona`) y el aparato lo cuenta en cada
sync. La app lo reconoce apenas se vincula: "¡Conectaste a tu Brote!", con
el Rooti dormido y en gris. Una placa sin persona grabada (de desarrollo)
recibe siempre el mismo, elegido por su id (`personaDeAparato`).

**El cofre sortea la piel**, una sola vez por vínculo:

| Rareza | Probabilidad | Qué trae |
|---|---|---|
| Común (`comun`) | 70 % | la paleta clásica del Rooti y un aura suave |
| Rara (`raro`) | 25 % | una paleta pastel y destellos que titilan |
| Épica (`epico`) | 5 % | una paleta de colección y, según el Rooti, corona dorada o aura bioluminiscente con luces |

Las probabilidades son públicas (la app las muestra antes de abrir, y
`/api/config` las publica) y no hay nada que comprar para cambiarlas. El
sorteo es `randomInt(1000)` del servidor (`server/cofre.mjs`).

La nube guarda la rareza con la planta y la manda en cada sync
(`"rareza": "epico"`); el firmware la guarda en su NVS y pinta la maceta con
esa paleta. Desvincular la borra: el próximo dueño abre su propio cofre. La
colección de la cuenta es de pieles (`brote-epico`), quince en total, y cada
piel desbloquea su paleta en la app ([paletas.md](paletas.md)).

**Por qué así.** La primera versión sorteaba el personaje. Pero la persona ya
tiene la figura en la mano: un cofre que dijera otro nombre sería mentira, y
el aparato no puede cambiar de carcasa. La sorpresa honesta es de qué colores
va a despertar.

**Los de la primera tanda.** Una base o una placa con los Rooties anteriores
(Cresta, Kawaii, Visor, Cíclope, Hongo, Chico Malo, Chica Chill y el secreto)
pasa al más parecido de los nuevos (`LEGADO`): la migración v6 de la base lo
hace con plantas, aparatos y colecciones.

## El cuerpo en la app (`public/lib/cuerpo.mjs`)

La maceta sólo tiene una pantalla de 1,44": ahí va la cara. En el teléfono se
ve el personaje entero, como en un libro de cuentos: el cuerpo es una
ilustración SVG y la cara es la del WebAssembly (`lib/caras.mjs`), en la
ventana biselada donde va el TFT en la carcasa impresa.

### Las siluetas son datos

`SILUETAS` tiene una entrada por Rooti, en un lienzo de 200 × 220 con la base
en y = 208:

| Campo | Qué es |
|---|---|
| `contorno` | puntos `[x, y]` de la base izquierda a la base derecha; `[x, y, 1]` es una esquina que no se suaviza |
| `dibujo` | el contorno que se dibuja cuando una parte se anima aparte (el brazo del Pinchito) |
| `brazo` | `{ puntos, pivote }`: se dibuja detrás y saluda |
| `ventana` | `{ x, y, lado }`: el centro y el lado del área activa del TFT |
| `partes` | relieves: `trazo`, `relleno`, `elipse`, `flor`, `sombrero`, con un rol de color |
| `corona`, `gorro` | dónde van la corona de la piel épica y el gorrito de dormir |
| `roles` | de qué sale el color del cuerpo: `piel`, `cactus` (fondo mezclado con los ojos; la flor es la piel) u `hongo` (tallo claro; el sombrero es la piel) |

El contorno se suaviza con Catmull-Rom (tangente 1/6) y se cierra con una
recta en la base. Rocío cambia un número y cambia el personaje; no hay que
tocar el dibujo.

### Las reglas de la carcasa también valen acá

El cuerpo de la app es la carcasa que se imprime en FDM **sin soportes**, así
que las siluetas cumplen las mismas reglas que
[root-kit/docs/carcasas.md](https://github.com/ifbotech/root-kit/blob/main/docs/carcasas.md):

- **Voladizo máximo de 45°** respecto de la vertical, medido sobre la curva
  que se dibuja (16 muestras por tramo), no sobre los puntos.
- **Base plana** de al menos 60 de 200, sin nada que baje de la cama.
- **Centro de masa bajo**: el centroide de la silueta en la mitad de abajo y
  sobre la base (la 18650 va parada, abajo).
- **La ventana entra entera** en la silueta con su bisel de 45° (6 unidades
  alrededor del área activa).

`test/cuerpo.test.mjs` lo verifica para cada Rooti con `voladizoMaximo`,
`centroide` y `dentro`. Hoy: Brote 37,7°, Musgo 35,6°, Pinchito 38,6°, Bulbo
31,4°, Champi 42,5° (el ala del sombrero es una esquina a 42,5°: suavizada
pasaba de 56°).

### La escena

| Opción | Qué hace |
|---|---|
| `rareza` | los colores del cuerpo y los efectos: aura (común), destellos (rara), corona / aura que late / luces (épica) |
| `dormido` | antes del cofre: gris, sin efectos, con la cara dormida del firmware |
| `despertar` | abre los ojos con la animación del firmware (el cofre) |
| `noche` | se sienta (se achata desde la base), gorrito de hoja y Zzz. Si está bien la cara duerme; si tiene sed, no: la cara sigue diciendo la verdad |
| `polvo` | de 0 a 12 motas, siempre en los mismos lugares para ese Rooti, sobre el cuerpo y fuera de la pantalla |
| `estatico` | la cara es la imagen fija (la colección, con quince cuerpos) |

`actualizar({...})` cambia ánimo, rareza, noche, polvo, luz o mirada sin
recrear nada; `acariciar(si)` ronronea con todo el cuerpo y pone la cara en
`^ ^`; `limpiarEn(x, y)` saca las motas bajo la esponja. Con "menos
movimiento" no respira, no saluda y no titila.

## Dónde se ve

| Pantalla | Qué muestra |
|---|---|
| Alta, al vincular | el Rooti reconocido, dormido |
| Cofre | la piel que salió, despertando, con su cinta y confeti de sus colores (oro en la épica) |
| Ficha de la planta | el Rooti entero con sus mimos ([mascota.md](mascota.md)) |
| Invernadero | todos los Rooties enteros en un estante |
| Colección | cinco filas por tres pieles; las que faltan, en silueta con su probabilidad |
| Hoy, lista, chat, cuidador, pasaporte, escritorio | la cara, con el fondo de su piel |

## Código

| Archivo | Qué hace |
|---|---|
| `public/lib/rooties.mjs` | generado: `MODELOS`, `RAREZAS`, `pielDe`, `idPiel` |
| `public/lib/cuerpo.mjs` | siluetas, geometría (curva, voladizo, centroide) y el renderizador |
| `public/lib/caras.mjs` | la cara del firmware con `rareza` |
| `server/cofre.mjs` | `PROBABILIDADES`, `sortearRareza`, `personaDeAparato`, `LEGADO` |
| `server/api.mjs` | `POST /api/cofre/abrir`, `rareza` en el sync, la colección de pieles |
| `public/vistas/cofre.mjs`, `alta.mjs`, `coleccion.mjs` | el reconocimiento, la ceremonia y la colección |
| `tools/sincronizar-firmware.mjs` | lee `persona.c` y genera `rooties.mjs`, el wasm y las imágenes |
