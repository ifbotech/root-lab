# El cuidador: cuando te vas y alguien riega por vos

Quien se va de viaje deja las plantas a alguien que no tiene la app, no
tiene cuenta y no va a instalar nada. ROOTLAB le da un **enlace**: con él ve
la cara de la planta en vivo, qué necesita hoy y cómo se riega, y puede
anotar "ya regué". El dueño recibe un push y la app lo tiene en cuenta.

## Para el dueño

En la planta, panel **Cuidador**: opcionalmente el nombre de quien va a
cuidarla, y un botón de **3, 7 o 15 días**. Sale un enlace
`https://…/sitter/<token>` para copiar o compartir (Web Share donde hay).
El mismo panel muestra cuántos enlaces siguen vigentes, hasta cuándo, el
último riego anotado, y **Revocar**, que los mata a todos.

Cuando el cuidador anota un riego:

- llega un push: *"Ana regó a Rulo. Quedó anotado. Si el sensor no ve el
  agua en un par de horas, te aviso."*;
- la planta muestra *"Ana regó hace 20 min"* debajo de la cara;
- la tarea **Regar** se esconde dos horas, igual que si la hubieras marcado
  vos (`lib/tareas.mjs`, `GRACIA_MS`): si pasado ese rato la tierra sigue
  seca, vuelve. El sensor manda.

## Para el cuidador (`vistas/sitter.mjs`)

Abre `/sitter/<token>` en cualquier navegador, sin sesión:

1. **La cara** del Rooti, en vivo (el mismo WebAssembly, con la luz de la
   planta), y lo que dice.
2. **Hoy**: las tareas que salen de los sensores (regar, no regar, correr
   del sol, acercar a la luz, mover del frío o del calor, subir la humedad,
   el riego que se escurrió). No ve las del dueño (cofre, foto, batería).
3. **Ya regué**: un botón grande. Después queda dos horas en descanso y lo
   dice: la tierra tarda en repartir el agua.
4. **Cómo se cuida**: riego, luz, temperatura y humedad de la ficha.

Se refresca sola cada minuto. Vencido o revocado el enlace, ve *"Este enlace
ya no vale"*.

## Qué ve y qué no

El enlace muestra **sólo esa planta**: nombre, Rooti, ánimo, los cuatro
números, la especie, los cuidados, el nombre de pila del dueño y los riegos
anotados. No viaja el id real de la planta (`id: 'cuidada'`), ni el email,
ni el aparato, ni las otras plantas. El token (32 bytes al azar) se guarda
hasheado, como las sesiones: una copia de la base no sirve para abrir
enlaces. Desvincular la planta o borrar la cuenta borra los enlaces.

Límites: 120 pedidos por IP cada 10 minutos, 10 riegos por enlace por hora,
20 enlaces por cuenta por hora.

## La API

| | |
|---|---|
| `POST /api/plantas/:id/cuidador` | `{ dias: 3 \| 7 \| 15, nombre? }` → `201 { url, vence, dias, nombre }` · `409` con el cofre cerrado · `400` con otra duración |
| `GET /api/plantas/:id/cuidador` | `{ enlaces: [{ creado, vence, nombre, usos }], riegos: [{ t, origen, quien }] }` (los riegos de los últimos 15 días) |
| `DELETE /api/plantas/:id/cuidador` | revoca todos → `204` |
| `GET /api/sitter/:token` *(sin sesión)* | `{ planta, dueno, cuidador, vence, riegos, ahora }` · `404` vencido, revocado o inexistente |
| `POST /api/sitter/:token/riego` *(sin sesión)* | `{ quien? }` (si el enlace no trae nombre) → `201 { ok, t }`; anota el riego y avisa al dueño |

La planta de la cuenta trae `riego: { t, origen, quien } | null` (el último
anotado a mano, si es de las últimas 48 h).

## Pruebas

`test/cuidador.test.mjs`: el enlace se crea y muestra la planta sin nada de
la cuenta (ni email ni id), las tareas del cuidador son las del dueño, "ya
regué" anota, esconde la tarea y avisa con el nombre de quien regó, el
enlace vence, se revoca, rechaza duraciones raras y cuentas ajenas, no
existe con el cofre cerrado y muere al desvincular. `test/http.test.mjs`:
`/sitter/<token>` sirve la app.
