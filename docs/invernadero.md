# El invernadero: todos los Rooties en un estante, mirándose

Desde **Hoy → Ver el invernadero** (con dos o más Rooties). Es la escena de
la casa: las plantas una al lado de la otra, cada Rooti con la cara que está
poniendo ahora, sobre un estante. Sirve para saber de un vistazo quién
necesita algo sin leer nada.

## Las miradas (`lib/miradas.mjs`)

Los Rooties se miran:

- **Todos bien:** cada uno le echa un vistazo al de al lado cada tanto
  (1,6 s de cada 11, y otro más corto), a destiempo entre uno y otro para
  que no parezca coreografía. El de la punta sólo mira hacia adentro.
- **Uno con sed, frío o ahogado** (`THIRSTY`, `COLD`, `DROWNING`): los
  vecinos lo miran **preocupados**, con las cejas altas por el lado de
  adentro y la sonrisa floja; los de al lado más (mirada al 85 %,
  preocupación entera), los de más lejos menos. Descansan la vista 3 de
  cada 9 segundos. El que tiene sed mira al frente: su propia cara ya lo
  dice.

Es función del tiempo y de la fila: dos teléfonos abiertos en el mismo
instante muestran lo mismo, y se prueba sin navegador.

## Cómo se dibuja

La mirada dirigida es del firmware: `rk_face_draw_mirada` (root-kit,
`art/face.c`) suma `mira_x`/`mira_y` a la mirada propia del ánimo y, con
`preocupado`, sube las cejas y afloja la boca. Con todo en cero es la cara de
siempre, pixel por pixel; la maceta no lo usa porque no sabe quién tiene al
lado. En la app, `lib/caras.mjs` recibe `actualizar({ mirada })` cuatro veces
por segundo y suaviza el cambio en un tercio de segundo, con la misma curva
de las transiciones de ánimo.

## Pruebas

`test/miradas.test.mjs`: solo o dormido mira al frente; los vecinos miran al
que tiene sed y él no; de lejos, menos preocupación; descansa la vista; con
todos bien, vistazos cortos, casi siempre al frente y nunca fuera de la
fila; y es determinista. En root-kit, `test/test_render.c` verifica que sin
mirada es la cara de siempre, que mirar cambia la cara y que la preocupación
se ve en todo el que tiene cejas.
