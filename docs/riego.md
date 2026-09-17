# Calibrar el sensor y regar por volumen

La función central de ROOTKIT es decir cuándo y cuánto regar. Este documento
cubre las dos cosas que la hacen de fiar: que el porcentaje de tierra sea el
de **esa** maceta, y que "regá" venga con una cantidad. Las reglas están en
`public/lib/riego.mjs`; anticiparse con el clima, en [clima.md](clima.md).

## Por qué calibrar

El sensor capacitivo no mide humedad: da un número crudo (0 a 4095) que baja
cuando hay más agua. Qué número es "seco" y cuál "empapado" cambia con cada
sensor y, sobre todo, con cada sustrato. Con la calibración de fábrica
(seco 2650, mojado 1180) una tierra al 50 % puede leerse al 32 %: la cara
pediría agua que la planta no necesita.

## Cómo se calibra

En la ficha de la planta, **Sensor de tierra y maceta → Calibrar el sensor**
(`vistas/calibrar.mjs`). Dos pasos:

1. **En seco**: el sensor afuera, limpio, al aire.
2. **Mojada**: la maceta regada a fondo hasta que escurra, y el sensor clavado
   hasta la línea.

Mientras dura:

- `POST /api/plantas/:id/calibrar` abre una ventana de 10 minutos; la nube le
  dice `"calibrando": true` al Rooti en el sync y él **mide y cuenta cada 5
  segundos, sin dormirse** (`esp32/main.cpp`). Se apaga sola.
- La app consulta la planta cada 3 segundos y muestra el **número crudo en
  vivo** (`tel.suelo_raw`). El botón de cada paso sólo se habilita con una
  lectura de menos de 40 segundos y dentro del rango eléctrico.
- La ficha no se repinta sola mientras se calibra.

Al final valida con las mismas reglas que el firmware (`rk_soil_cal_valid`:
seco > mojado, al menos 300 de separación, entre 150 y 4000) y dice qué pasó
en palabras ("¿se invirtieron los pasos?", "la tierra mojada tiene que estar
regada a fondo"). Se guarda con `PATCH /api/plantas/:id { calibracion }`; la
nube se la manda al Rooti (`"calibracion": { "seco", "mojado" }`), que la
guarda en su NVS y desde ahí convierte crudo en porcentaje. `calibracion:
null` vuelve a la de fábrica.

Un test compara las constantes de `riego.mjs` con las de
`root-kit/firmware/nodo/soil.h`: si alguien cambia un lado, falla.

## Cuánta agua

Con el **diámetro de la maceta** (en la misma tarjeta; de 5 a 80 cm, y el
alto si no es "tan alta como ancha"), `aguaParaRegar()` estima:

| Paso | Cuenta |
|---|---|
| Sustrato | un cilindro del diámetro y de alto 0,9 × diámetro, lleno al 85 % |
| Agua útil | 25 % de ese volumen (lo que retiene un sustrato de interior entre "seco para esta planta" y "a capacidad") |
| Lo que falta | de la humedad de ahora al **medio** del rango de la especie, como fracción del rango |
| Resultado | entre 30 ml y 3 l, redondeado a 10 ml |

Una maceta de 16 cm con una monstera al 12 % (rango 25–60 %): unos 540 ml,
"medio litro". La de 12 cm: un vaso. Es una regla de tres que se puede
explicar, no un modelo hidrológico: acierta el orden de magnitud, que es lo
que le falta a quien riega a ojo. La tarea lo dice ("Echale unos 540 ml
(medio litro), despacio"), la ficha también, y cada planta trae `agua_ml` en
`/api/estado`. Sin maceta cargada no se inventa nada: la tarea dice sólo
"regá".

Siempre "despacio": el detector de riego del Rooti avisa si el agua se
escurrió por los costados sin empapar.

## Probarlo sin placa

En el emulador, tildar **Sensor sin calibrar**: el capacitivo virtual da un
crudo corrido (como uno real en otra tierra) y el porcentaje sale mal. Desde
la ficha, calibrar poniendo la tierra del emulador en 0 % para el paso seco y
en 100 % para el mojado: al guardar, la misma tierra pasa a leerse bien. El
emulador muestra el crudo al lado del porcentaje y la calibración vigente.
