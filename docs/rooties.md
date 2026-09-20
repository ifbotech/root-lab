# Los Rooties

Cinco personajes botánicos, cada uno con tres pieles. Este documento cubre
quién es quién, de dónde salen sus formas, cómo se decide qué Rooti y qué piel
tiene cada aparato, y cómo se dibuja el personaje entero en 3D en la app. La
cara de la maceta está documentada en
[root-kit/docs/firmware.md](https://github.com/ifbotech/root-kit/blob/main/docs/firmware.md).

## Dos mitades del mismo bicho

**ROOTKIT muestra la cara. ROOTLAB muestra el bicho entero.**

La maceta tiene una pantalla de 1,44": ahí va la CARA, con sus once ánimos y
sus animaciones de estado, y la dibuja el firmware. En el teléfono se ve el
personaje completo en 3D, con esa misma cara pegada donde está el vidrio en la
figura de verdad: es el mismo WebAssembly (`lib/caras.mjs`) que corre en el
ESP32, subido como textura.

No son dos dibujos distintos del mismo personaje. Son el mismo personaje
mirado de dos maneras, y por eso la cara nunca puede decir una cosa en la
maceta y otra en la app.

## Los cinco

| Rooti | Figura | Rasgo que manda | Personalidad | Cara |
|---|---|---|---|---|
| **Brote** | semilla germinando: cuerpo lleno y gordito | dos cotiledones en V sobre un tallo corto | curiosa y entusiasta | ojos redondos enormes con brillos de cachorro, sin cejas |
| **Musgo** | almohadón bajo y ancho, con montículos en la espalda | dos esporofitos (los tallitos con cápsula que el musgo saca de verdad) | serena y zen | ojos en medialuna "u u", boca de gato |
| **Pinchito** | cactus barril: panza ancha, arriba y abajo más angosto | una flor de cuatro pétalos y el brazo levantado que saluda | hiperactiva y alegre | ojos en arco "^ ^" que guiñan, sonrisa con dientecito |
| **Bulbo** | gota gorda que termina en punta, parada sobre sus raíces | un brote con su hoja saliendo de la cabeza | soñadora y un poco mágica | ojos grandes con doble brillo, cejas flotantes |
| **Champi** | hongo: tallo corto y gordo con su anillo | un sombrero de campana con pintas que le hace de visera | glotona y charlatana | cejas finas, boca ":D" con lengua, pecas |

La tabla de datos es una sola: `root-kit/firmware/core/persona.c`.
`npm run firmware` la copia a `public/lib/rooties.mjs` (nombres, lemas y los
cinco colores de cada piel), compila el módulo de caras y genera las imágenes
de las notificaciones.

### De dónde salen las formas

De dos lados:

1. **De una planta de verdad.** Una semilla germinando, un almohadón de musgo
   con esporofitos, un cactus barril, un bulbo de cebolla, un hongo con
   anillo. Es lo que hace que un Rooti se entienda sin explicación.
2. **De la escuela de los juguetes de vinilo**: cuerpo gordito de una sola
   pieza, un rasgo botánico que manda arriba, patitas y bracitos mínimos, cara
   grande pintada sobre el cuerpo, colores saturados y un contorno oscuro que
   los recorta. Los juegos de criaturas-vegetales con esa estética —Ooblets es
   el ejemplo evidente— fueron el norte.

**Lo que NO condiciona las formas es la impresora.** Se probó, y salió mal:
atar el arte a que la figura se imprimiera sin soportes dejó cinco cuerpos
redondos y sin carácter. Las carcasas son otro objeto y se diseñan aparte.

**Distancia legal.** La inspiración es de escuela, no de personaje: tomamos el
lenguaje (formas simples, paleta saturada, un rasgo botánico por bicho) y no la
silueta de nadie. Cada Rooti sale de su planta, tiene su nombre, su
personalidad y su cara propia —la cara es la del firmware, que es nuestra y
existe desde antes—, y ninguno reproduce las proporciones, el rasgo ni la
paleta de una criatura concreta de otro juego. Si alguna vez una figura se
pareciera demasiado a algo existente, se cambia: una figura son treinta
números en una tabla.

### Los colores de una piel

Cada piel son **cinco** colores en `persona.c` más los adornos:

| Color | Dónde va |
|---|---|
| `piel` | el cuerpo. Y el fondo de la cara, que va **igual**: así el motor sabe qué parte de la textura es fondo y la descarta, y quedan pintados sólo los rasgos |
| `fondo` | el fondo de la pantalla; es el mismo valor que `piel` por lo de arriba, y el firmware lo comprueba |
| `ojos` | ojos, boca, cejas y —aclarado hacia el cuerpo— el contorno de la figura |
| `rubor` | las mejillas |
| `acento` | lo de arriba: hojas, flor, sombrero, brote, esporas |
| `escena` | derivado (no está en `persona.c`): el cuerpo aguado al 82 %. Es el fondo que va **detrás** del Rooti en la app |

Ese último es importante: desde que el cuerpo es un juguete de vinilo, su
color es fuerte, y una pantalla entera de ese color no deja leer nada. El
fondo de la app, de las casillas de la colección y de la ficha usa `escena`.

## La figura define el Rooti; el cofre, la piel

**Qué Rooti es** lo decide la figura impresa que viene en la caja. La fábrica
lo graba en la NVS del aparato (`persona`) y el aparato lo cuenta en cada
sync. La app lo reconoce apenas se vincula: "¡Conectaste a tu Brote!", con
el Rooti dormido y en gris. Una placa sin persona grabada (de desarrollo)
recibe siempre el mismo, elegido por su id (`personaDeAparato`).

**El cofre sortea la piel**, una sola vez por vínculo:

| Rareza | Probabilidad | Qué trae |
|---|---|---|
| Común (`comun`) | 70 % | la paleta clásica del Rooti |
| Rara (`raro`) | 25 % | otra paleta y destellos que giran alrededor |
| Épica (`epico`) | 5 % | una paleta de colección y, según el Rooti, corona dorada o aura con luces |

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

## El 3D (`public/lib/rooti3d/`)

**El personaje de la app y la carcasa del aparato son dos objetos distintos.**
Lo fueron a propósito desde el segundo intento: la primera versión ató el
diseño de los Rooties a que salieran de una impresora sin soportes, y el
resultado fueron cinco papas redondas, correctas y sin gracia. Las carcasas se
diseñan aparte, en el CAD del hardware; acá mandan el carácter y la silueta.

De los modelos sale igual un STL (`npm run carcasas`), pero como **referencia
de forma** para quien modele el aparato, no como la carcasa.

### Sin bibliotecas

No hay three.js. La app pesa 89 KB comprimida y una biblioteca 3D la
duplicaría; además la CSP es `script-src 'self' 'wasm-unsafe-eval'` y no
queremos aflojarla. Son unas pocas funciones de distancia, un mallador y un
shader de treinta líneas.

| Archivo | Qué hace |
|---|---|
| `esculpir.mjs` | las funciones de distancia, la unión suave y el mallador (surface nets) |
| `formas.mjs` | los cinco Rooties como listas de bultos, en milímetros |
| `animacion.mjs` | `pose(figura, estado, t)`: funciones puras, sin estado ni DOM |
| `motor.mjs` | un contexto WebGL compartido por toda la página; dibuja y copia a cada canvas |
| `geometria.mjs` | las matrices, nada más |

### Los bichos se esculpen, no se arman

Cada criatura es una lista de bultos —esferas, elipsoides, cápsulas, hojas,
toros— que **se funden entre sí**. No se pegan: en vez de quedarse con la
superficie más cercana, se mezclan las dos con un radio (`fundir`), y ahí
aparece el menisco de plastilina. Por eso un bracito SALE del torso con su
hombro, y la fusión de las ancas con el torso hace el cogote sin modelarlo.

La receta de un cuerpo se lee de abajo hacia arriba, como se lo dibujaría:

| Parte | Para qué |
|---|---|
| ancas | el bulto de abajo, el más ancho: la pose de juguete bien plantado |
| torso | el bulto de arriba, donde va la cara |
| patitas | dos bultos achatados un poco adelante; justo abajo darían un huevo |
| bracitos | dos cápsulas cortas que salen del torso |
| copa | lo que lleva arriba y lo identifica: hojas, flor, esporas, sombrero, brote |
| manchas | bultos metidos adentro que no cambian la forma, sólo el color: la panza clara, las pintas del sombrero |

Un detalle que costó aprender: los surcos **restados** (las costillas del
cactus, los gajos de la cebolla) parten el cuerpo en tentáculos en cuanto la
resta llega al borde de la silueta. Las costillas son lomos sumados, no
zanjas.

De esa lista sale una malla con surface nets: se recorre una grilla, se busca
dónde el campo cambia de signo y se cose. Las normales salen del gradiente del
campo, no de los triángulos, así que la superficie se ve lisa aunque la grilla
sea gruesa. Son unos 10 000 triángulos y una décima de segundo por Rooti, una
sola vez.

### Un color por rol y cuatro huesos, en el mismo vértice

El vértice no guarda un color: guarda **cuánto le toca de cada rol** (cuerpo,
acento, claro, oscuro). Los cuatro colores llegan al shader como uniformes, así
que la misma malla sirve para las tres pieles y el verde de una hoja se
derrite en el cuerpo en vez de cortarse.

Y guarda **cuánto le toca de cada hueso** (cuerpo, copa, brazo izquierdo, brazo
derecho): el shader mezcla las cuatro matrices en esa proporción. Por eso la
copa se inclina arrastrando el cogote y el brazo que saluda dobla el hombro,
sin juntas. Las dos cosas —color y hueso— salen del mismo peso con el que se
fundieron los bultos, que es lo que hace que nunca haya una costura.

### Lo que se comprueba en cada commit

`test/rooti3d.test.mjs`, para los cinco:

- las mallas están **cerradas y del derecho** (volumen con signo positivo) y
  sin NaN;
- cada Rooti **apoya en el piso** y mide lo que mide una criatura de bolsillo,
  con proporción de personaje y no de palo ni de torta;
- los **pesos de cada vértice suman uno**, en los roles y en los huesos;
- la **copa manda arriba** y no llega a los pies;
- la **cara cae sobre el frente**;
- las funciones de distancia y la unión suave dan lo que deben, y esculpir una
  esfera da el volumen de una esfera;
- la **animación es determinista** y no se sale de escala.

Medidas de hoy:

| Rooti | Tamaño (mm) | Triángulos |
|---|---|---|
| Brote | 83 × 129 × 63 | 12 024 |
| Musgo | 91 × 99 × 73 | 9 596 |
| Pinchito | 93 × 106 × 62 | 11 136 |
| Bulbo | 88 × 116 × 64 | 9 644 |
| Champi | 87 × 118 × 83 | 14 328 |

### Cómo se mueve

`pose(figura, estado, t)` devuelve dónde va cada grupo en el milisegundo `t`,
y con el mismo `t` devuelve siempre lo mismo: por eso se puede probar en Node,
rebobinar para una captura y pausar sin saltos.

Se suman **tres capas**, en vez de elegir una:

1. **el reposo**, que respira siempre;
2. **el ánimo**, lo que dice el sensor;
3. **la escena**: la noche, el mimo, el despertar, el saludo.

Un Rooti con sed al que le hacen un mimo sigue teniendo la copa caída, pero
ronronea. Elegir una sola capa daba personajes que se olvidaban de que tenían
sed apenas los tocabas.

| Estado | Qué hace el cuerpo |
|---|---|
| Contento | saltitos con anticipación, vuelo y aterrizaje aplastado. Es el único que despega los pies |
| Sed | todo cae hacia adelante y el balanceo se hace lento y corto |
| Frío | tiembla: amplitud chica y frecuencia alta, más copos que caen |
| Calor | se derrite —se achata y se ensancha— y se bambolea despacio, con vaho |
| Ahogo | flota y se ladea, con burbujas |
| Aire seco | se encoge y se enrosca, con polvillo girando |
| Oscuridad | gira despacio mirando alrededor, y la cara acompaña |
| Quemado | casi no se mueve, y eso es el punto |
| Noche | se sienta: más ancho, más bajo, la copa vencida, y suelta Zzz |
| Mimo | ronronea con una vibración corta, levanta la copa y saca corazones |
| Despertar | un estirón con rebote, un segundo y medio |
| Saludo | el brazo derecho arriba, dos segundos |

Las **piezas se agrupan** y cada grupo gira alrededor de su pivote, que es
donde nace del cuerpo: `cuerpo`, `copa` (lo que lleva arriba) y los brazos que
tenga. La copa llega siempre un pelín tarde: ese retardo es todo el peso que
aparenta.

Nada de esto deforma la zona de la cara: ahí, en la figura impresa, hay un
vidrio.

### El sombreado

Luz de cielo por arriba y rebote del piso por abajo, una luz principal
envuelta (para que la sombra no sea un borde duro), un brillo especular ancho
—el plástico brillante— y un contraluz en el borde. Encima, un contorno oscuro
dibujado con las caras de atrás infladas: es lo que le da el aire de
ilustración y no de render.

Tres detalles que se ven cuando faltan:

- **La cara se pinta, no se pega.** De la textura sólo se toman los RASGOS: el
  shader descarta los píxeles que traen el color de fondo de esa cara. Si se
  pegara el cuadro entero, ese fondo plano taparía el sombreado del cuerpo y
  la cara se vería como una calcomanía pegada en la panza. El color de fondo a
  descartar se le pasa al motor, porque no siempre es el del cuerpo: el que
  todavía no despertó tiene la pantalla apagada, y su fondo es negro.
- **La cara se linealiza igual que el cuerpo.** Llega en sRGB y el color del
  cuerpo está en lineal.
- **La luz del cuarto se la pone el motor al bicho entero.** El sensor de luz
  hace que todo se ponga cálido en penumbra y contrastado a pleno sol
  (`lib/luz.mjs`). Si eso se le aplicara sólo a la cara, la pantalla tendría
  una luz y el cuerpo otra.

**Un contexto WebGL para toda la página.** En la colección hay quince Rooties a
la vez y un navegador da unos ocho contextos antes de empezar a tirar los
viejos: hay uno solo, escondido, y lo que dibuja se copia con `drawImage` al
canvas 2D de cada uno.

**Si no hay WebGL**, el componente dibuja el cuerpo plano con su color, su
contorno y la cara encima. Sigue siendo un Rooti reconocible.

### La escena y la API del componente

`cuerpo({ persona, rareza, animo, etapa, lado, noche, polvo, estatico,
dormido, despertar, clave, lux, fps, etiqueta })` devuelve un `<div>`:

| Opción | Qué hace |
|---|---|
| `rareza` | los colores y los efectos: nada (común), destellos (rara), corona / aura / luces (épica) |
| `dormido` | antes del cofre: gris y apagado, con la cara dormida del firmware |
| `despertar` | el estirón del cofre |
| `noche` | se sienta y suelta Zzz. Si está bien la cara duerme; si tiene sed, no: la cara sigue diciendo la verdad |
| `polvo` | de 0 a 12 motas, siempre en los mismos lugares para ese Rooti y esa planta, sobre la mitad de adelante del cuerpo |
| `estatico` | un solo cuadro (la colección tiene quince y no puede animarlos a todos) |
| `lux` | la luz del cuarto, que tiñe al bicho entero |

`actualizar({...})` cambia ánimo, rareza, noche, polvo, luz o mirada sin
recrear nada; `acariciar(si)` ronronea; `limpiarEn(x, y)` saca las motas bajo
la esponja, proyectando cada mota a la pantalla. Un Rooti que no está a la
vista no dibuja (`IntersectionObserver`), y con "menos movimiento" se queda
quieto en su pose de reposo.

`.cuerpo-ventana` es un rectángulo vacío puesto donde el motor proyecta el
vidrio del TFT: la ficha lo usa para saber dónde está la boca cuando le tira
un snack. Adentro vive el canvas de la cara, invisible, que es la textura.

## Dónde se ve

| Pantalla | Qué muestra |
|---|---|
| Alta, al vincular | el Rooti reconocido, dormido |
| Cofre | la piel que salió, despertando, con su cinta y confeti de sus colores |
| Ficha de la planta | el Rooti entero con sus mimos ([mascota.md](mascota.md)) |
| Invernadero | todos los Rooties enteros en un estante |
| Colección | cinco filas por tres pieles; las que faltan, dormidas y en gris |
| Hoy, lista, chat, cuidador, pasaporte, escritorio | la cara sola, con el fondo de su piel |

## Código

| Archivo | Qué hace |
|---|---|
| `public/lib/rooties.mjs` | generado: `MODELOS`, `RAREZAS`, `pielDe`, `idPiel` |
| `public/lib/rooti3d/esculpir.mjs` | las distancias, la unión suave y el mallador |
| `public/lib/rooti3d/formas.mjs` | los cinco Rooties como listas de bultos |
| `public/lib/rooti3d/animacion.mjs` | las poses, puras y deterministas |
| `public/lib/rooti3d/motor.mjs` | el WebGL: skinning, roles de color y la cara |
| `public/lib/cuerpo.mjs` | el componente: colores por rol, el reloj y los adornos en 2D |
| `public/lib/caras.mjs` | la cara del firmware |
| `server/cofre.mjs` | `PROBABILIDADES`, `sortearRareza`, `personaDeAparato`, `LEGADO` |
| `server/api.mjs` | `POST /api/cofre/abrir`, `rareza` en el sync, la colección de pieles |
| `tools/sincronizar-firmware.mjs` | lee `persona.c` y genera `rooties.mjs`, el wasm y las imágenes |
| `tools/rooties-stl.mjs` | `npm run carcasas`: los STL de referencia para el hardware |
