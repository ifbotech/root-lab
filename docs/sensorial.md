# El Rooti en el teléfono: luz, caricias, voz y modo escritorio

La maceta muestra dos cosas en toda su vida: el QR y los ojos. Todo lo demás
pasa en el teléfono, y ahí la cara puede hacer lo que en la pantalla de 1,3"
no tendría sentido: verse con la luz que hay en la pieza, dejarse acariciar,
hablar con su voz y quedarse a pantalla completa en un escritorio. Nada de
esto cambia lo que el Rooti mide ni lo que la maceta dibuja.

Todo sale del mismo módulo WebAssembly que dibuja las caras
(`public/caras/rootkit_caras.wasm`, el firmware compilado): la cara con la
luz es la cara de siempre con efectos encima; la cara acariciada es una
expresión más del firmware (`rk_face_draw_mimo`, que la maceta tiene pero no
usa).

## La luz (`lib/luz.mjs`)

El BH1750 de la maceta manda los lux en cada lectura. La app los pasa a cada
cara (`caraDeNodo`, `lux: n.tel.lux`) y `lib/caras.mjs` la pinta con esa luz,
después de dibujarla:

| Lux | Qué se ve |
|---|---|
| menos de 50 | penumbra: la cara pierde color, se entibia (ámbar) y se le oscurecen los bordes |
| 50 a 5000 | luz de interior: la cara de siempre |
| 5000 a 10 000 | de a poco, más contraste y un brillo que la cruza en diagonal |
| más de 10 000 | sol directo: contraste entero y el brillo, animado, a 45° |

`iluminacion(lux)` devuelve cuánto de cada efecto (0 a 1) y es continua: al
cruzar 50 o 5000 no hay salto, cada efecto crece desde cero. Sin dato (un
Rooti sin BH1750, o sin lectura) es la cara de siempre. Los efectos se pintan
con modos de mezcla del canvas (`saturation`, `soft-light`, `multiply`,
`overlay`, `screen`), que andan en todos los navegadores, y no con
`ctx.filter`, que no.

## La caricia (`lib/caricias.mjs`, `lib/particulas.mjs`)

Pasar el dedo por la cara grande de la planta, o por la del modo escritorio:

1. La cara pasa a **contenta con los ojos en `^ ^`** y ronronea (un vaivén
   de un pixel, ocho veces por segundo) en un tercio de segundo, con la
   misma curva que las transiciones de ánimo. Lo dibuja el firmware:
   `cara_mimo(persona, ánimo, etapa, mimo_pct, t)`, con `mimo_pct` de 0 (la
   cara del ánimo, pixel por pixel) a 100.
2. El teléfono **vibra** `[20, 40, 20]` ms (`navigator.vibrate`, donde hay).
3. **Suben corazones** desde el dedo (Web Animations API, sin bucle propio;
   con "menos movimiento" activado, no).
4. Suena un **ronroneo** grave y bajito (Web Audio), si el sonido está
   prendido y no es de noche.

Al soltar, 700 ms después vuelve a su ánimo, bajando desde donde estaba. Es
con Pointer Events: dedo, mouse o lápiz. Cuenta un movimiento (14 px), no un
toque; en la planta el desplazamiento vertical sigue haciendo scroll
(`touch-action: pan-y`) y en el modo escritorio vale cualquier dirección.

La planta no está mejor porque la acaricien: la cara vuelve a decir la verdad.

## La voz (`lib/voz.mjs`)

En la charla, la respuesta de la planta aparece **letra por letra** y cada
letra suena: un blip sintetizado con Web Audio, sin archivos de sonido. Cada
Rooti tiene su voz, y son datos (`VOCES`, por modelo) que la artista puede
afinar:

| Rooti | Onda | Rango | Carácter |
|---|---|---|---|
| Chico Malo | diente de sierra | 130–220 Hz | rápido (22 ms por letra), ataque seco, pausas cortas |
| Chica Chill | senoidal | 260–380 Hz | lento (46 ms), ataque suave (35 ms), sólo las vocales suenan, pausas largas |
| Kawaii | triangular | 500–800 Hz | arpegios que suben y bajan por la pentatónica de do (C5 D5 E5 G5) |
| los demás | según el modelo | 180–900 Hz | ver `VOCES`; `VOZ_BASE` para un modelo nuevo |

Una letra siempre suena igual (la nota sale de un hash de la letra, las
vocales van a la mitad alta del rango), la coma respira y el punto descansa.
El texto sale igual aunque no suene.

**Cuándo se calla:** con el sonido apagado en **Ajustes → Sonido** (mute
global, guardado en el teléfono) y de **23:00 a 08:00** aunque esté
prendido. El ronroneo respeta lo mismo. Si la vista se va a mitad de una
respuesta, la voz se corta.

## El modo escritorio (`vistas/desk.mjs`, `lib/desk.mjs`)

Desde la planta, **Modo escritorio**, o por la URL `/desk/<id>` (sirve para
dejarla como página de inicio de un teléfono viejo). Es la cara sola, grande,
sin barra ni pestañas:

- **La pantalla no se apaga** (Wake Lock) mientras la vista esté abierta y
  visible; al volver a la pestaña se vuelve a pedir.
- **Pantalla completa** con un botón, donde el navegador lo permite.
- **De noche se apaga casi del todo**: con menos de 10 lux en la maceta, o
  de 23:00 a 07:00 pase lo que pase con la luz. Se revisa cada minuto.
- Los controles se esconden a los 4 segundos; tocar la pantalla los trae.
- La cara se ve con la luz de la planta y se deja acariciar, como arriba.
- Se refresca sola cuando cambia el estado (cada 15 s, como el resto), y la
  cara nueva arranca desde el ánimo de la anterior: el cambio se anima.

## Pruebas

`test/sensorial.test.mjs` prueba las reglas puras: los umbrales de la luz y
su continuidad, las voces (rangos, ondas, pentatónica, qué letras suenan,
pausas, el silencio), la caricia (patrón de vibración, qué cuenta como
caricia, la trayectoria de los corazones) y el modo escritorio (la noche, el
lado de la cara). `test/caras.test.mjs` verifica que `cara_mimo` en 0 es la
cara del ánimo y en 100 otra. `test/http.test.mjs`, que `/desk/<id>` sirve
la app.
