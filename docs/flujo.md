# El alta, paso a paso

Del QR de la maceta a la primera cara. La implementación está en
`public/vistas/alta.mjs`; el lado del aparato, en
`root-kit/firmware/core/enlace.c`.

| # | Paso | La maceta | La app |
|---:|---|---|---|
| 1 | **hola** | QR + red `ROOTKIT-XXXX` | ojos dormidos, el código, "Empezar" |
| 2 | **instalar** | QR | instrucciones por sistema; se saltea si ya está instalada |
| 3 | **avisos** | QR | maqueta de notificación y permiso |
| 4 | **wifi** | QR → se conecta | pasos del portal; espera hasta que la nube la vea |
| 5 | **vincular** | **ojos dormidos, grises** | "¡Es tuyo!" |
| 6 | **cofre** | **abre los ojos** | tres toques, luz, el personaje |
| 7 | **nombre** | la cara | sugerencias según el personaje |
| 8 | **foto** | la cara | identificación y rangos de la especie |
| 9 | **listo** | la cara, con umbrales | "Ver a Rulo" |

## Por qué en este orden

**Instalar antes que avisos.** En iPhone, las notificaciones web sólo existen
para la app instalada en la pantalla de inicio. Pedir el permiso desde Safari
sería pedir algo imposible, y un permiso rechazado no se vuelve a pedir.

**Avisos antes que el wifi.** Es el momento de más atención: la persona acaba
de sacar la maceta de la caja. Después del cofre ya está pensando en su
planta.

**Wifi antes que vincular.** La nube sólo conoce el código cuando la maceta se
presenta con él. Si la app intenta vincular antes, vuelve sola al paso del
wifi.

**El cofre antes del nombre.** No se bautiza a alguien que todavía no se
conoce.

**La foto al final.** Es lo que más puede fallar (luz, foco, una planta rara)
y lo único que se puede postergar: sin especie, la maceta está contenta de
conocerte y la app deja la tarea "Sacarle una foto a Rulo".

## Dónde se guarda el progreso

En el teléfono (`localStorage`, clave `rootkit:alta`), en cada paso. Salir a
los ajustes de wifi y volver retoma exactamente donde estaba. Además, al
entrar por `/v/<código>` la app le pregunta a la nube: si la maceta ya es tuya,
salta al primer paso que falte (cofre, nombre o foto), o directo a la planta.

## iPhone

- Al entrar por el QR, el manifest se pide con el código
  (`/manifest.webmanifest?codigo=...`) y su `start_url` es `/v/<código>`: la
  app instalada abre en el mismo alta.
- La app instalada no comparte almacenamiento con Safari. Como la cuenta se
  crea al abrir la app y el vínculo pasa después de instalar, normalmente no
  hay nada que migrar. Si alguien vinculó desde Safari, usa el código de
  transferencia de Ajustes.

## Caminos feos

| Qué pasa | Qué hace |
|---|---|
| El ROOTKIT ya es de otra cuenta | explica cómo desvincularlo o reiniciarlo (botón 10 s) |
| La clave del wifi estaba mal | a los tres intentos la maceta vuelve a levantar el portal; la app sigue esperando |
| La app se cierra en el cofre | al volver, el cofre sigue ahí; abrirlo dos veces no vuelve a tirar |
| La IA no reconoce la planta | ofrece otra foto o elegir de la lista |
| La confianza de la IA es baja | "¿Puede ser esta?" y la opción de elegir otra |
| Sin red en el teléfono | cada paso reintenta; nada se pierde |
