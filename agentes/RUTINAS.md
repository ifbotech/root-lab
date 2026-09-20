# Las rutinas (ya están creadas: falta enchufarlas)

Las **routines** de Claude Code son la forma de dejar a los agentes dando
vueltas sin depender de que haya una máquina prendida: corren en la nube de
Anthropic con la cadencia que se les ponga. Con el plan **Max** entran hasta 15
por día, así que los seis agentes van cómodos.

**Las seis ya están creadas**, cada una con su nombre, su horario y su
instrucción. Falta enchufarlas, y eso son **tres cosas** que no se pueden
dejar puestas desde afuera: dos en la pantalla de cada rutina —los
**repositorios** y las **variables de entorno**— y una en la del entorno —la
**política de red**—. Todo junto no lleva más de diez minutos.

Los tres huecos se encontraron corriendo, no leyendo: la primera tanda salió
sin ninguno de ellos y cada agente chocó con el suyo. Están contados abajo con
el error exacto que tira cada uno, para que se reconozcan si vuelven.

## Antes de empezar: el token

Cada agente tiene el suyo, ya creado y guardado en el VPS. Para leer uno:

```bash
ssh -i ~/.ssh/rootkit_vps root@31.97.31.58 \
  "grep '^agente-infra' /root/vivero-tokens.txt | cut -f3"
```

Los nombres son `agente-infra`, `agente-ux`, `agente-fw`, `agente-producto`,
`agente-seguridad` y `jardinero`. Se revocan y se vuelven a crear cuando sea
desde la trastienda → **Cuentas → Los agentes**.

## Lo que falta

1. Entrar a **[claude.ai/code/routines](https://claude.ai/code/routines)** y
   abrir la rutina.
2. **Repositorios**: `ifbotech/root-lab` **y** `ifbotech/root-kit`. Los dos:
   los agentes miran el proyecto entero.

   **Es el campo que más importa, y arregla dos cosas a la vez.** La primera
   es obvia: sin los repos el agente arranca en una carpeta vacía y no
   encuentra ni su propio prompt. En la primera tanda se vio así: los cinco
   que miran terminaron en menos de un minuto sin proponer nada, y el
   jardinero quedó trabado pidiendo permiso para salir a buscarlos por
   `/workspace`, `/srv` y `/opt`.

   La segunda es menos obvia. Los repos son públicos, así que un agente puede
   clonarlos igual —el jardinero lo hizo— pero al empujar la rama se come un
   `403: ifbotech/root-lab is not in this session's authorized repository
   set`. Ese "authorized repository set" es exactamente este campo: es lo que
   le da permiso de **escritura**, que es lo único que el jardinero necesita
   para dejar su trabajo. Clonar no alcanza.
3. **Las variables de entorno**, que **son del entorno y no de cada rutina**:
   se ponen una sola vez y las seis comparten lo mismo. Están en
   [claude.ai/code](https://claude.ai/code) → el entorno → *Variables de
   entorno*.
   ```
   ROOTLAB_NUBE=https://ifbotech.com/rootkit
   ROOTLAB_ADMIN_CLAVE=<UN token, uno solo para los seis>
   ```
   Sin esto `vivero.mjs` corta antes de listar: no hay ideas que mirar ni
   dónde anotar.

   **Por qué un token solo y no uno por agente.** Porque no hay dónde poner
   seis: la pantalla es una y es compartida. Y no hace falta, porque **el
   autor de una idea no sale del token**: cada agente lo manda en `--autor`
   (`server/api.mjs`, en el alta de ideas), así que en el vivero se siguen
   distinguiendo `agente-infra`, `agente-ux` y el resto aunque la credencial
   sea la misma.

   **Qué alcance ponerle, que es la única decisión real.** La propia pantalla
   avisa que lo que se escriba ahí lo ve cualquiera que use el entorno, así
   que conviene el token que menos daño haga si se filtra. Los dos alcances
   leen lo mismo —el estado, la flota, las lecturas y las métricas, **sólo
   por GET** y sin datos de personas— y proponen y mueven ideas (no las
   borran). La diferencia es una sola:

   - **`vivero`** es el mínimo. El costo es que el jardinero pierde la ruta
     del correo y su informe sale por la notificación de la rutina en vez de
     por la trastienda.
   - **`jardinero`** (lo que está puesto hoy) suma el envío del informe, así
     que el correo del sábado sale como fue diseñado. El costo es que los
     cinco que sólo miran pueden mandar un informe a quien administra (seis
     por hora como mucho, escapado, y sólo a las direcciones de
     administración). No la van a usar —no está en su prompt—, pero está.

   Qué alcanza cada uno, método por método, está en `PERMISOS_AGENTE`
   (`server/api.mjs`) y en [docs/trastienda.md](../docs/trastienda.md); las
   pruebas comprueban que ninguno escribe aparatos, firmware ni cuentas, y
   que lo que leen no trae emails, nombres ni plantas. Se revoca desde la
   trastienda en un clic. Lo que no conviene nunca es poner ahí la clave del
   servidor: ésa abre las cuentas, la flota y la fábrica.
4. **La política de red del entorno**, que se toca una vez para todos en
   [claude.ai/code](https://claude.ai/code) → el entorno → red. Tiene que
   dejar salir a **`ifbotech.com`**. Si no, el token no sirve para nada: el
   pedido muere antes, con un `403` en el CONNECT del proxy, y la vuelta sale
   entera de los repositorios sin mirar un solo dato de producción.

   **Node 24** no necesita que abras nada más: el hook de arranque del repo
   (`.claude/hooks/session-start.sh`, registrado en `.claude/settings.json`)
   deja cada sesión en la 24 antes de que el agente empiece. Prueba `nvm`
   (baja de `nodejs.org`) y, si ese dominio no está permitido, el paquete
   `node@24` del registro de npm, que el entorno ya deja salir para instalar
   dependencias. Así que `nodejs.org` en la lista de red ayuda, pero no hace
   falta.

El nombre, el horario y las instrucciones ya están puestos: no hace falta
tocarlos.

## La tabla

Los horarios se cargaron en UTC, que es como los guarda el programador. La
columna de la izquierda es la hora de acá (UTC−3), que es la que importa.

| Rutina | Cuándo | En UTC | Abre |
|---|---|---|---|
| Vivero · infraestructura | todos los días, 03:10 | `10 6 * * *` | `agentes/infraestructura.md` |
| Vivero · experiencia | todos los días, 03:25 | `25 6 * * *` | `agentes/experiencia.md` |
| Vivero · firmware | todos los días, 03:40 | `40 6 * * *` | `agentes/firmware.md` |
| Vivero · producto | todos los días, 03:55 | `55 6 * * *` | `agentes/producto.md` |
| Vivero · seguridad | todos los días, 04:10 | `10 7 * * *` | `agentes/seguridad.md` |
| Vivero · el jardinero | **sábados**, 05:20 | `20 8 * * 6` | `agentes/jardinero.md` |

La instrucción de cada rutina es corta a propósito: dice quién es el agente y
lo manda a abrir su archivo. **El prompt largo vive en el repositorio**, así
que si mañana mejoramos lo que tiene que hacer un agente, la rutina lo toma
sola sin tocar nada en la pantalla. Por eso acá no se copia el texto: se copia
en la rutina una vez y después se edita el `.md`.

**Por qué a esas horas.** Las tres de la mañana es cuando la casa duerme y el
VPS está tranquilo, y deja el informe esperando para cuando alguien se
levanta. Los cinco que miran arrancan de a quince minutos: así no compiten
entre ellos por el mismo minuto y, si uno tarda, no arrastra a los demás. El
jardinero va después de todos, el sábado, para elegir sobre una lista que ya
tiene lo de la semana.

El cron de `deploy/vivero.cron`, que es la otra forma de dejarlos corriendo,
sigue en las cuatro: son mecanismos alternativos y nunca corren los dos.

**Por qué el jardinero sólo los sábados.** Los otros cinco proponen; él
implementa. Todos los días serían siete ramas por semana esperando revisión, y
la revisión es tuya. Una por semana se mira el lunes con un café.

**El jardinero es el que más se nota si falta algo.** Los otros cinco sólo
leen; él deja una rama, y para eso los dos repositorios tienen que estar
adjuntados a su rutina (punto 2 de arriba). Si no lo están, hace todo el
trabajo y se queda sin dónde dejarlo. No se pierde: está escrito en su prompt
que en ese caso mande el `git diff` entero en el informe, así la rama se rehace
a mano. Pero conviene que no haga falta.

**Los avisos.** Los cinco que miran corren callados: una vuelta sin ideas es
lo normal y no hace falta que suene el teléfono todos los días a las cuatro de
la mañana. El jardinero sí avisa por correo y al teléfono cuando termina, que
es el sábado. Se cambia en la misma pantalla de cada rutina.

## Cómo saber que anda

- **A las horas**: en [claude.ai/code](https://claude.ai/code) queda la sesión
  de cada corrida, con todo lo que hizo. **Lo primero que hay que mirar es
  cuánto duró**: una vuelta de verdad se toma sus minutos, porque lee media
  docena de archivos y le pregunta cosas a la trastienda. Una que terminó en
  veinte segundos no encontró los repos, y una que quedó en "requiere acción"
  está esperando un permiso que nadie le va a dar.
- **En el producto**: la trastienda → **El vivero**. Si aparecieron ideas
  nuevas con autor `agente-infra` y compañía, la cadena entera funciona.
- **El sábado**: te llega un correo con el informe del jardinero.
- Si un agente no encontró nada que valga la pena, **no propone nada**: está
  escrito así en su prompt. Una vuelta sin ideas es un buen resultado, no una
  falla.

## Si preferís no usar routines

Está el cron: `deploy/vivero.cron` y `deploy/vivero.sh`, que hacen lo mismo en
una máquina propia. Los detalles, en [README.md](README.md).
