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

## Los cuatro

Los dibujó Rocío. Cada uno es una actitud antes que una forma: eso es lo que
tiene que llegar en la cara de 128 × 128 de la maceta y en el cuerpo 3D de la
app.

| Rooti | Quién es | Lo que se ve de lejos | La cara |
|---|---|---|---|
| **Kip** | el piloto audaz: impetuoso, apasionado, dramatiza cuando la cosa se complica | una cresta de tres rulos, como una nube en fila | cejas negras tupidas —con ellas medio grado ya es una actitud—, ojos rasgados de corte angular y media sonrisa ladeada |
| **Nori** | la crítica sofisticada: estándares altos, juzga en silencio | corte bob recto con flequillo pulcro sobre el visor | ojos almendrados de esquinas rectificadas y pupila grande, pecas, y una boca corta que apenas se curva |
| **Blink** | el cíclope optimista: vive en su propio plano positivo y siempre sale ileso | dos cuernitos redondeados sobre una cabeza que es casi todo el bicho | UN ojo enorme con iris de bronce; su única mueca son unos dientes de sierra, y dura poco |
| **Plum** | la berenjenita empática: tímida, leal, un cachorro | cuerpo de gota compacto con su cabito | ojos grandes y húmedos con brillo de súplica, rubores malva |

Sus paletas también son de ella:

| Rooti | Paleta | Colores |
|---|---|---|
| Kip | Fiery Red Sunset | `#ffba08` `#faa307` `#d00000` `#03071e` |
| Nori | Deep Sea Blue | `#0466c8` `#023e7d` `#0353a4` `#979dac` |
| Blink | Royal Gold & Saffron | `#ffe169` `#fad643` `#edc531` `#c9a227` `#805b10` |
| Plum | Vivid Nightfall | `#10002b` `#5a189a` `#7b2cbf` `#9d4edd` `#c77dff` `#e0aaff` |

Dos ajustes sobre lo que entregó: el rostro de Nori usa un azul claro de la
misma familia, porque sobre los cuatro azules originales —todos oscuros— un
ojo marino no se lee; y la cresta de Kip va en el rojo ladrillo de su paleta y
no en el ámbar, que contra el cuerpo naranja se perdía. Los dos cambios están
en `persona.c` y se revierten cambiando un número.

La tabla de datos es una sola: `root-kit/firmware/core/persona.c`.
`npm run firmware` la copia a `public/lib/rooties.mjs` (nombres, lemas y los
cinco colores de cada piel), compila el módulo de caras y genera las imágenes
de las notificaciones.

### De dónde salen las formas

De los dibujos de Rocío, y de una regla de proporción que comparten los
cuatro: **cabeza grande, cuerpito chico, patitas y bracitos mínimos**. Que
compartan esqueleto no es pereza, es lo que hace que se lean como un elenco y
que la misma animación les quede bien a todos. Lo que los distingue es lo de
arriba —la cresta, el pelo, los cuernitos, el cabito— y las proporciones.

**Lo que NO condiciona las formas es la impresora.** Se probó, y salió mal:
atar el arte a que la figura se imprimiera sin soportes deja cuerpos redondos
y sin carácter. Las carcasas son otro objeto y se diseñan aparte.

**Distancia legal.** Los cuatro son originales, de nuestra artista. Las
referencias de actitud que se usaron para conversar sobre ellos —el piloto
temerario, el personaje que juzga, la alegría desbordada— son arquetipos, no
diseños: ninguno reproduce la silueta, las proporciones ni la paleta de un
personaje existente.

### Los colores de una piel

Cada piel son **cinco** colores en `persona.c` más los adornos:

| Color | Dónde va |
|---|---|
| `piel` | el cuerpo. Y el fondo de la cara, que va **igual**: así el motor sabe qué parte de la textura es fondo y la descarta, y quedan pintados sólo los rasgos |
| `fondo` | el fondo de la pantalla; es el mismo valor que `piel` por lo de arriba, y el firmware lo comprueba |
| `ojos` | ojos, boca, cejas y —aclarado hacia el cuerpo— el contorno de la figura |
| `rubor` | las mejillas |
| `acento` | lo de arriba: la cresta, el pelo, los cuernitos, el cabito |
| `escena` | derivado (no está en `persona.c`): el cuerpo aguado al 82 %. Es el fondo que va **detrás** del Rooti en la app |

Ese último es importante: desde que el cuerpo es un juguete de vinilo, su
color es fuerte, y una pantalla entera de ese color no deja leer nada. El
fondo de la app, de las casillas de la colección y de la ficha usa `escena`.

### La rareza es un acabado, no otro personaje

La paleta es del personaje: es parte de quién es, y las tres pieles la
comparten. Lo que cambia con la rareza es el **acabado**, elegido para que vaya
con su carácter:

| Rooti | Común | Rara | Épica |
|---|---|---|---|
| Kip | Naranja Piloto | **Ascua**: destellos | **Llamarada**: fuego lamiendo el borde de abajo |
| Nori | Azul Marea | **Acero**: un filo metálico que cruza la cara | **Cristal**: destello frío y tres esquirlas |
| Blink | Sol | **Mostaza**: destellos | **Oro Real**: barrido dorado y corona |
| Plum | Malva | **Amatista**: destellos y aura | **Nocturna**: aura que respira y luces que suben |

Los acabados son **animaciones**, no colores: una épica se reconoce cuando la
cara está viva, no en una captura. Esto tiene dos ventajas sobre lo de antes
—una paleta distinta por rareza—: el personaje sigue siendo el mismo con
cualquier piel, y el premio se nota más, porque el movimiento llama más que un
color.

Dentro de la misma familia sí se mueven los tonos, para que las tres se
distingan también quietas. `test_persona.c` lo comprueba: cada piel difiere de
la anterior en el fondo o en los adornos, la común no trae ninguno, y la épica
trae uno de los grandes (corona, aura, fuego, cristal, oro o metal).

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
resultado fueron cuerpos redondos, correctos y sin gracia. Las carcasas se
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
| `formas.mjs` | los cuatro Rooties como listas de bultos, en milímetros |
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
| copa | lo que lleva arriba y lo identifica: la cresta, el pelo, los cuernitos, el cabito |
| manchas | bultos metidos adentro que no cambian la forma, sólo el color: la panza clara |

Dos detalles que costaron aprender. Los surcos **restados** parten el cuerpo
en tentáculos en cuanto la resta llega al borde de la silueta: si hace falta
una costilla, va sumada como un lomo, no restada como una zanja. Y un rasgo
que tiene que CONTARSE —los tres rulos de la cresta de Kip— va poco fundido:
con el menisco grande queda una masa con bultos.

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
| Kip | 82 × 141 × 72 | 14 000 |
| Nori | 86 × 116 × 80 | 14 300 |
| Blink | 87 × 133 × 74 | 14 800 |
| Plum | 86 × 121 × 73 | 13 000 |

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
