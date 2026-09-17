# El alta, paso a paso

Del QR del Rooti a la primera cara. La implementación está en
`public/vistas/alta.mjs`; el lado del aparato, en
`root-kit/firmware/core/enlace.c`.

| # | Paso | El Rooti | La app |
|---:|---|---|---|
| 1 | **hola** | QR + red `ROOTKIT-XXXX` | ojos dormidos, el código, "Empezar" |
| 2 | **instalar** | QR | instrucciones por sistema; se saltea si ya está instalada |
| 3 | **cuenta** | QR | crear cuenta (nombre, email, contraseña) o entrar; se saltea si ya hay sesión |
| 4 | **avisos** | QR | maqueta de notificación y permiso |
| 5 | **wifi** | QR → se conecta | pasos del portal; espera hasta que la nube la vea |
| 6 | **vincular** | **ojos dormidos, grises** | "¡Conectaste a tu Brote!": el Rooti de la figura, dormido y en gris |
| 7 | **cofre** | **abre los ojos con su piel** | tres toques, luz, sale la piel (común, rara o épica) con su cinta y confeti; **la app se pinta con esos colores** |
| 8 | **nombre** | la cara | sugerencias según el Rooti |
| 9 | **foto** | la cara | reconocimiento (pide el Rooti y cuenta para la cuota), rangos y cuidados; o elegir de la lista |
| 10 | **listo** | la cara, con umbrales | "Ver a Rulo": ficha de cuidados y "Hablar con Rulo" |

## Por qué en este orden

**Instalar antes que avisos.** En iPhone, las notificaciones web sólo existen
para la app instalada en la pantalla de inicio. Pedir el permiso desde Safari
sería pedir algo imposible, y un permiso rechazado no se vuelve a pedir.

**La cuenta después de instalar.** En iPhone la app instalada no comparte
datos con Safari: si la sesión se abriera en Safari, la app instalada
arrancaría sin ella. Abierta adentro de la app, queda donde se va a usar. Y
va antes que los avisos y el vínculo porque las dos cosas quedan a nombre de
la cuenta.

**Avisos antes que el wifi.** Es el momento de más atención: la persona acaba
de sacar la maceta de la caja. Después del cofre ya está pensando en su
planta.

**Wifi antes que vincular.** La nube sólo conoce el código cuando la maceta se
presenta con él. Si la app intenta vincular antes, vuelve sola al paso del
wifi.

**Qué Rooti es no se sortea.** La figura que viene en la caja ya es un
personaje: la persona lo tiene en la mano, y un cofre que dijera otro nombre
sería mentira. La fábrica lo graba en la NVS, el aparato lo cuenta en cada
sync y la app lo reconoce apenas se vincula. El cofre sortea la **piel**
(común 70 %, rara 25 %, épica 5 %): la sorpresa es de qué colores va a
despertar. Ver [rooties.md](rooties.md).

**El cofre antes del nombre.** No se bautiza a alguien que todavía no
despertó.

**La foto al final.** Es lo que más puede fallar (luz, foco, una planta rara)
y lo único que se puede postergar: sin especie, el Rooti está contento de
conocerte y la app deja la tarea "Sacarle una foto a Rulo". Con la especie
confirmada nacen la ficha de cuidados y la charla ([ia.md](ia.md)). Si la
cuota de reconocimientos del día se terminó o la IA está en pausa, la app va
directo a la lista: otra foto no serviría.

**Pintar la app en el cofre, no antes.** El color es parte de la revelación:
la app no sabe de qué colores va a ser hasta que sale la piel.

## Dónde se guarda el progreso

En el teléfono (`localStorage`, clave `rootkit:alta`), en cada paso. Salir a
los ajustes de wifi y volver retoma exactamente donde estaba. Además, al
entrar por `/v/<código>` la app le pregunta a la nube: si la maceta ya es tuya,
salta al primer paso que falte (cofre, nombre o foto), o directo a la planta.

## iPhone

- Al entrar por el QR, el manifest se pide con el código
  (`/manifest.webmanifest?codigo=...`) y su `start_url` es `/v/<código>`: la
  app instalada abre en el mismo alta.
- La app instalada no comparte almacenamiento con Safari. Si alguien empezó
  en Safari, en la app instalada sólo tiene que entrar con su email: las
  plantas están en la cuenta, no en el teléfono.

## Caminos feos

| Qué pasa | Qué hace |
|---|---|
| El Rooti ya es de otra cuenta | explica cómo desvincularlo o reiniciarlo (botón 10 s) |
| El email ya tiene cuenta | pasa a "Ya tengo cuenta" con el email escrito |
| La sesión se cerró a mitad del alta | vuelve al paso de la cuenta; al entrar sigue donde estaba |
| La clave del wifi estaba mal | a los tres intentos la maceta vuelve a levantar el portal; la app sigue esperando |
| La app se cierra en el cofre | al volver, el cofre sigue ahí; abrirlo dos veces no vuelve a sortear |
| Se abre el QR de otro Rooti con la sesión abierta | arranca un alta nueva para ese código; la cuenta se saltea |
| La IA no reconoce la planta | ofrece otra foto o elegir de la lista |
| La confianza de la IA es baja | "¿Puede ser esta?" y la opción de elegir otra |
| Sin red en el teléfono | cada paso reintenta; nada se pierde |
