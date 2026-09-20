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
| **Musgo** | almohadón bajo y ancho, con tres capas de flecos | dos esporofitos (los tallitos con cápsula que el musgo saca de verdad) | serena y zen | ojos en medialuna "u u", boca de gato |
| **Pinchito** | cactus barril con costillas verticales | una flor de cinco pétalos arriba y un brazo levantado que saluda | hiperactiva y alegre | ojos en arco "^ ^" que guiñan, sonrisa con dientecito |
| **Bulbo** | bulbo de cebolla con gajos suaves y raicitas por patas | un brote con su hoja saliendo de la punta | soñadora y un poco mágica | ojos grandes con doble brillo, cejas flotantes |
| **Champi** | hongo: tallo macizo con anillo | un sombrero de campana que le hace de visera a la cara | glotona y charlatana | cejas finas, boca ":D" con lengua, pecas |

La tabla de datos es una sola: `root-kit/firmware/core/persona.c`.
`npm run firmware` la copia a `public/lib/rooties.mjs` (nombres, lemas y los
cinco colores de cada piel), compila el módulo de caras y genera las imágenes
de las notificaciones.

### De dónde salen las formas

De dos lados a la vez, y ninguno es negociable:

1. **De una planta de verdad.** Una semilla germinando, un almohadón de musgo
   con esporofitos, un cactus barril, un bulbo de cebolla, un hongo con
   anillo. Es lo que hace que un Rooti se entienda sin explicación.
2. **De lo que la impresora sabe hacer.** Cada forma es una que sale en FDM
   sin soportes: cuerpos de revolución, bultos con el culo en cono de 45°,
   tallos que suben y hojas lanceoladas. Una hoja horizontal no existe en este
   elenco porque no se imprime.

La escuela visual es la de los **juguetes de vinilo**: cuerpo simple y
gordito, UN rasgo que manda arriba, patitas mínimas, cara pintada sobre el
cuerpo, colores brillantes y un contorno oscuro que los recorta. Los juegos de
criaturas-vegetales con esa estética —Ooblets es el ejemplo evidente— fueron
el norte del refactor.

**Distancia legal.** La inspiración es de escuela, no de personaje: tomamos el
lenguaje (formas simples, paleta saturada, un rasgo botánico por bicho) y no
la silueta de nadie. Cada Rooti sale de su planta, tiene su nombre, su
personalidad y su cara propia —la cara es la del firmware, que es nuestra y
existe desde antes—, y ninguno reproduce las proporciones, el rasgo ni la
paleta de una criatura concreta de otro juego. Si alguna vez una figura se
parece demasiado a algo existente, se cambia: hay cinco figuras y son cinco
tablas de números.

### Los colores de una piel

Cada piel son **cinco** colores en `persona.c` más los adornos:

| Color | Dónde va |
|---|---|
| `piel` | el cuerpo. Y el fondo de la cara, que va **igual**: la cara está pintada sobre el cuerpo, no metida en un marco |
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

**El modelo es la figura que se imprime.** No hay una versión "bonita" para la
pantalla y otra para la impresora: es una sola malla, en milímetros, que sale
en STL con `npm run carcasas` y que en cada commit se mide contra las reglas
de FDM y contra el hardware que tiene que entrar adentro.

### Sin bibliotecas

No hay three.js. La app pesa 89 KB comprimida y una biblioteca 3D la
duplicaría para dibujar cinco bichos hechos de esferas; además la CSP es
`script-src 'self' 'wasm-unsafe-eval'` y no queremos aflojarla. Son cuatro
primitivas, un par de matrices y un shader de treinta líneas.

| Archivo | Qué hace |
|---|---|
| `geometria.mjs` | matrices y las cuatro primitivas: `revolucion`, `gota`, `capsula`, `hoja`, más `elipsoide` para las patitas. Cada una devuelve su malla **y** un `dentro(p)` |
| `formas.mjs` | los cinco Rooties como tablas: un perfil que gira y una lista de piezas encima. `ENVOLVENTE` es lo que tiene que entrar adentro |
| `imprimible.mjs` | las mediciones: voladizos, piezas sin apoyo, base, centro de masa, curvatura de la cara, si entra el hardware, y el STL |
| `animacion.mjs` | `pose(figura, estado, t)`: funciones puras, sin estado ni DOM |
| `motor.mjs` | un contexto WebGL compartido por toda la página; dibuja y copia a cada canvas |

### Las primitivas son formas que la impresora sabe hacer

| Primitiva | Qué es | Por qué así |
|---|---|---|
| `revolucion` | un perfil que gira, achatable de adelante hacia atrás, con costillas opcionales | es el cuerpo; su voladizo es la pendiente del perfil. Las costillas **se apagan solas cerca del frente**: ahí va el vidrio del TFT, que es plano |
| `gota` | media esfera arriba y un cono de 45° abajo | un bulto redondo de verdad tendría la panza mirando al piso. Es la forma de brazos, matas, raicitas y manchas |
| `capsula` | un tubo que puede afinarse | tallos, esporofitos, pinchos, el brazo del cactus. Sólo vale si sube |
| `hoja` | una placa lanceolada con espesor y una raíz que queda metida en el tallo | el canto de una hoja que se abre de golpe es una pared que mira al piso; una lanceolada abre a una pendiente que se elige (`abre`) y después cierra |

Cada pieza sabe decir si un punto está adentro (`dentro(p)`). Con eso, la
prueba de voladizos ignora los triángulos escondidos dentro de otra pieza: se
mide la superficie de verdad, no las costuras.

### Lo que se comprueba en cada commit

`test/rooti3d.test.mjs`, para los cinco:

- **Ningún voladizo visible pasa de 45°** y **ninguna pieza empieza en el
  aire** (su punto más bajo está en la cama o dentro de otra pieza).
- **Todas las mallas están del derecho**: volumen con signo positivo (fue así
  como se encontró que media figura tenía los triángulos al revés).
- **Base plana** de al menos el 45 % del ancho y **centro de masa** en la
  mitad de abajo.
- **Entra la 18650 parada** (23 × 76 × 21, con 1,6 mm de pared) y **el módulo
  del TFT** detrás de la cara, comprobado punto por punto contra la geometría.
- **La cara queda en una zona plana**: la ventana se curva menos de 6 mm y el
  hueco del módulo entero, menos de 8.
- **Nada tapa la pantalla** y **nada es más fino que dos hilos de boquilla**.
- **La animación es determinista** y no se sale de escala.

Medidas de hoy:

| Rooti | Tamaño (mm) | Base | Centro de masa | Hueco del módulo |
|---|---|---|---|---|
| Brote | 90,7 × 152,1 × 76 | 56 % | 34 % | 4,9 mm |
| Musgo | 86,4 × 145,5 × 82,1 | 67 % | 36 % | 5,6 mm |
| Pinchito | 92,8 × 132,3 × 72,3 | 48 % | 42 % | 4,9 mm |
| Bulbo | 89,7 × 146,6 × 79 | 54 % | 35 % | 5,1 mm |
| Champi | 80 × 132 × 76 | 69 % | 28 % | 5,3 mm |

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

Dos detalles que se ven cuando faltan:

- **La cara se linealiza igual que el cuerpo.** Llega en sRGB y el color del
  cuerpo está en lineal; sin convertirla, el fondo de la cara —que es el mismo
  color del cuerpo— queda más claro y aparece el recuadro de la pantalla como
  un parche pegado.
- **La luz del cuarto se la pone el motor al bicho entero.** El sensor de luz
  hace que la cara se ponga cálida en penumbra y contrastada a pleno sol
  (`lib/luz.mjs`). Si eso se le aplicara sólo a la cara, la pantalla tendría
  una luz y el cuerpo otra. La textura se dibuja limpia y el ambiente se
  aplica al final, sobre todo.

**Un contexto WebGL para toda la página.** En la colección hay quince Rooties
a la vez y un navegador da unos ocho contextos antes de empezar a tirar los
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
| `public/lib/rooti3d/*.mjs` | la geometría, las figuras, las mediciones, la animación y el motor |
| `public/lib/cuerpo.mjs` | el componente: colores por rol, el reloj y los adornos en 2D |
| `public/lib/caras.mjs` | la cara del firmware |
| `server/cofre.mjs` | `PROBABILIDADES`, `sortearRareza`, `personaDeAparato`, `LEGADO` |
| `server/api.mjs` | `POST /api/cofre/abrir`, `rareza` en el sync, la colección de pieles |
| `tools/sincronizar-firmware.mjs` | lee `persona.c` y genera `rooties.mjs`, el wasm y las imágenes |
| `tools/rooties-stl.mjs` | `npm run carcasas`: escribe los cinco STL en el repo del hardware |
