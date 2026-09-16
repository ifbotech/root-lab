# El clima y la botánica: regar antes, y los números de invernadero

Dos cosas que ROOTLAB calcula con los mismos sensores de siempre y que
ninguna app de plantas de consumo muestra: **cuándo va a tener sed** con el
clima que viene, y los dos números que usan los invernaderos, **VPD** y
**DLI**.

## El riego que se anticipa (`server/clima.mjs`)

El Rooti mide la tierra cada quince minutos, así que se sabe a qué velocidad
se seca. Open-Meteo dice qué tiempo va a hacer las próximas 48 horas donde
están las plantas. Con las dos cosas, la app avisa **antes**:

> Se viene calor: Rulo va a tener sed antes. Mañana 34 °C y 25 % de
> humedad. La tierra está al 38 % y llega a 25 % en unas 20 h. Regala esta
> noche, despacio.

### El modelo, a propósito simple

| | |
|---|---|
| **tasa** | cuánto baja la tierra por hora, mirando sólo los tramos en que baja en los últimos 3 días. Una subida es un riego y no cuenta; un hueco de más de 3 h (el Rooti sin wifi) tampoco. Hacen falta al menos 6 h de tierra secándose |
| **factor** | cuánto más rápido se va a secar con el clima que viene, contra lo que midió el Rooti estos días: +5 % por cada grado de más, +0,8 % por cada punto de humedad de menos, entre 0,6 y 2 |
| **previsión** | (suelo − mínimo de la especie) / (tasa × factor) = horas hasta la sed |

Es una regla de tres con una corrección, no un modelo hidrológico, y eso es
lo que la hace explicable: el aviso dice los tres números, y la pestaña
**Avanzado · Botánica** de la planta también.

### Cuándo avisa

Sólo si el clima empeora de verdad (factor ≥ 1,15), la sed llega dentro de
las próximas **36 h**, la planta todavía no la tiene (si ya tiene sed, ese
aviso es el de siempre), no es de noche (23 a 8) y no se avisó en las
últimas 24 h. Lo revisa el mismo temporizador de los demás avisos, cada 10
minutos. Ver [notificaciones.md](notificaciones.md).

### La ciudad, y qué sale del servidor

En **Ajustes → Dónde están tus plantas** la persona escribe una ciudad. El
servidor la busca en el geocodificador de Open-Meteo, guarda el nombre y las
coordenadas **cifradas** (como el email), redondeadas a dos decimales, y
desde ahí pide el pronóstico como mucho una vez cada 6 h por cuenta (tabla
`clima`). Vacío quita la ciudad y el pronóstico.

Open-Meteo no pide cuenta ni clave. Lo único que recibe es el nombre de la
ciudad (al buscarla) y su coordenada (al pedir el pronóstico): nunca la
ubicación del teléfono ni ningún dato de la cuenta. La app no habla con
terceros: todo pasa por el servidor. `ROOTLAB_CLIMA=0` lo apaga del todo
(Ajustes lo dice y la previsión responde `motivo: 'ubicacion'`).

### La API

| | |
|---|---|
| `PATCH /api/cuenta` | `{ ubicacion: 'Rosario' }` busca y guarda; `''` la quita · `404` si no encuentra la ciudad · `503` con el clima apagado |
| `GET /api/plantas/:id/prevision` | `{ disponible: false, motivo }` (`ubicacion`, `lectura`, `historial`, `clima`) o `{ disponible: true, horas_hasta_sed, cuando, tasa_pct_h, velocidad_pct_h, factor, dT, dRH, suelo, soil_min, tasa_horas, clima: { temp_max_dc, temp_min_dc, temp_media_dc, hr_min, hr_media, horas }, ubicacion }` |

## VPD y DLI (`public/lib/botanica.mjs`)

En el detalle de cada planta, la pestaña plegada **Avanzado · Botánica**
(se calcula al abrirla).

**VPD**, déficit de presión de vapor, en kPa: cuánta agua le "tira" el aire
a la hoja. Sale de la temperatura y la humedad del AHT20 con la fórmula de
Tetens: `es = 0,6108 · e^(17,27·T / (T + 237,3))`, `VPD = es · (1 − HR/100)`.

| kPa | |
|---|---|
| < 0,4 | aire saturado: la hoja no transpira, riesgo de hongos |
| 0,4 – 0,8 | húmedo: esquejes y plantas de selva |
| 0,8 – 1,2 | cómodo |
| 1,2 – 1,6 | seco: transpira de más y pide agua aunque la tierra esté bien |
| > 1,6 | muy seco: estrés |

**DLI**, luz diaria integrada, en mol/m²/día: cuánta luz útil recibió en el
día entero, sumando cada lectura del BH1750 (`lux × 0,0185 µmol/m²/s ×
segundos / 10⁶`; una lectura vale hasta la siguiente, como mucho una hora).
Se muestra el de hoy hasta ahora y el de ayer entero, contra lo que pide la
especie con 12 h de luz (`dliObjetivo`: su rango de lux pasado a mol). Antes
de opinar, el de hoy se proyecta al día entero: a las 8 de la mañana nadie
tiene su DLI.

Los dos usan la misma barra de rango que el resto de los números
(`medidor()` de `lib/ui.mjs`), con la zona cómoda marcada.

## Pruebas

`test/clima.test.mjs`: el pronóstico se lee y se acota, la tasa ignora
riegos y huecos y no inventa sin historial, el factor sube con calor seco y
está acotado, la previsión es la regla de tres, el aviso se adelanta sólo
cuando vale la pena (y no de noche ni dos veces en un día), el cliente pide
a Open-Meteo con las coordenadas redondeadas, y por la API: la ciudad
cifrada, la previsión con sus motivos, la caché de 6 h y el push que llega
antes del calor. `test/botanica.test.mjs`: Tetens contra la tabla, las
zonas, 12 h a 10 000 lux son 8 mol, los huecos no suman, hoy y ayer se
separan por la medianoche.
