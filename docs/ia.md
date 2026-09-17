# Identificación y diagnóstico por foto

`server/ia.mjs`. Dos proveedores con la misma interfaz:

| | Cuándo | Para qué |
|---|---|---|
| **Claude** | hay `ANTHROPIC_API_KEY` | uso real; modelo en `ROOTLAB_IA_MODELO` (por defecto `claude-opus-5`) |
| **Simulada** | no hay clave (o es inválida) | desarrollo y pruebas: respuestas estables derivadas de la foto; la app avisa que es simulada |

**En producción la simulada no se muestra.** Sin una clave válida, y salvo
que se pida con `ROOTLAB_IA_DEMO=1`, `/api/config` dice `ia_visible: false`:
la app no ofrece charlar ni diagnosticar, la especie se elige de la lista, y
las tres rutas responden `503`. Una planta que contesta frases de prueba es
peor que una que todavía no habla.

La app achica la foto a 1280 px en JPEG antes de subirla: sube diez veces más
rápido y alcanza para reconocer una planta.

## Identificar

Se le pide al modelo un JSON cerrado: nombre común, científico, confianza, si
coincide con un id del catálogo, rangos estimados y alternativas.

**No se le cree todo.** Si la planta está en el catálogo curado
(`server/catalogo.mjs`), los umbrales salen del catálogo y no del modelo: una
tabla revisada es más confiable, y la maceta va a juzgar a la planta con esos
números durante años. Si no está, los rangos del modelo pasan por la misma
validación que el firmware —acotados y coherentes— y se guardan como especie
propia de esa maceta.

Con confianza menor a 0,7 la app pregunta "¿Puede ser esta?" en vez de darla
por buena. Si la foto no muestra una planta, lo dice.

## Diagnosticar

Al modelo se le piden **sólo hallazgos visibles** de una lista cerrada
(hojas amarillas, puntas marrones, manchas, plagas, moho...). La causa no la
decide el modelo: la saca `public/lib/diagnostico.mjs` cruzando esos hallazgos
con la última lectura de los sensores.

Así, hojas amarillas con la tierra encharcada, seca o en rango dan tres
causas distintas, que es justo lo que una foto sola no puede distinguir. Y
cuando el hallazgo es algo que ningún sensor puede ver (plagas, hongos), la
app lo marca.

## Costo

- Límite de 30 fotos por hora por cuenta.
- El catálogo curado evita depender del modelo para los números.
- Antes de producción: límite de gasto y alertas en la consola de Anthropic
  (Fase 3 del roadmap).
