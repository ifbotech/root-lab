# Las rutinas (ya están creadas: falta enchufarlas)

Las **routines** de Claude Code son la forma de dejar a los agentes dando
vueltas sin depender de que haya una máquina prendida: corren en la nube de
Anthropic con la cadencia que se les ponga. Con el plan **Max** entran hasta 15
por día, así que los seis agentes van cómodos.

**Las seis ya están creadas**, cada una con su nombre, su horario y su
instrucción. Faltan dos cosas que hay que agregarle a cada una a mano en
[claude.ai/code/routines](https://claude.ai/code/routines): **los
repositorios** y **las variables de entorno**. Son dos campos por rutina y no
lleva más de diez minutos.

## Antes de empezar: el token

Cada agente tiene el suyo, ya creado y guardado en el VPS. Para leer uno:

```bash
ssh -i ~/.ssh/rootkit_vps root@31.97.31.58 \
  "grep '^agente-infra' /root/vivero-tokens.txt | cut -f3"
```

Los nombres son `agente-infra`, `agente-ux`, `agente-fw`, `agente-producto`,
`agente-seguridad` y `jardinero`. Se revocan y se vuelven a crear cuando sea
desde la trastienda → **Cuentas → Los agentes**.

## Lo que falta, para cada una de las seis

1. Entrar a **[claude.ai/code/routines](https://claude.ai/code/routines)** y
   abrir la rutina.
2. **Repositorios**: `ifbotech/root-lab` **y** `ifbotech/root-kit`. Los dos:
   los agentes miran el proyecto entero. Esto es lo más importante de los dos
   campos —sin los repos, el agente arranca en una carpeta vacía y no
   encuentra su propio prompt.
3. **Variables de entorno**:
   ```
   ROOTLAB_NUBE=https://ifbotech.com/rootkit
   ROOTLAB_ADMIN_CLAVE=<el token de ESE agente>
   ```
   Van por rutina, así que cada agente lleva el suyo y ninguno tiene más
   permiso del que necesita.

El nombre, el horario y las instrucciones ya están puestos: no hace falta
tocarlos.

## La tabla

Los horarios se cargaron en UTC, que es como los guarda el programador. La
columna de la izquierda es la hora de acá (UTC−3), que es la que importa.

| Rutina | Cuándo | En UTC | Su instrucción (ya puesta) |
|---|---|---|---|
| Vivero · infraestructura | todos los días, 04:10 | `10 7 * * *` | `Sos el agente de infraestructura del vivero de ROOTLAB. Abrí root-lab/agentes/infraestructura.md de este repositorio y hacé exactamente lo que dice, una vuelta completa. Seguí también root-lab/agentes/_comun.md, que ese archivo te manda a leer.` |
| Vivero · experiencia | todos los días, 04:25 | `25 7 * * *` | `Sos el agente de experiencia e interfaz del vivero de ROOTLAB. Abrí root-lab/agentes/experiencia.md de este repositorio y hacé exactamente lo que dice, una vuelta completa. Seguí también root-lab/agentes/_comun.md, que ese archivo te manda a leer.` |
| Vivero · firmware | todos los días, 04:40 | `40 7 * * *` | `Sos el agente de firmware y hardware del vivero de ROOTLAB. Abrí root-lab/agentes/firmware.md de este repositorio y hacé exactamente lo que dice, una vuelta completa. Seguí también root-lab/agentes/_comun.md, que ese archivo te manda a leer.` |
| Vivero · producto | todos los días, 04:55 | `55 7 * * *` | `Sos el agente de producto del vivero de ROOTLAB. Abrí root-lab/agentes/producto.md de este repositorio y hacé exactamente lo que dice, una vuelta completa. Seguí también root-lab/agentes/_comun.md, que ese archivo te manda a leer.` |
| Vivero · seguridad | todos los días, 05:10 | `10 8 * * *` | `Sos el agente de seguridad y privacidad del vivero de ROOTLAB. Abrí root-lab/agentes/seguridad.md de este repositorio y hacé exactamente lo que dice, una vuelta completa. Seguí también root-lab/agentes/_comun.md, que ese archivo te manda a leer.` |
| Vivero · el jardinero | **sábados**, 06:20 | `20 9 * * 6` | `Sos el jardinero del vivero de ROOTLAB. Abrí root-lab/agentes/jardinero.md de este repositorio y hacé exactamente lo que dice: elegí UNA idea, implementala con sus pruebas y su documentación, dejala en una rama (nunca en main, nunca despliegues) y mandá el informe.` |

La instrucción es corta a propósito —el prompt largo vive en el
repositorio—, así que si mañana mejoramos lo que tiene que hacer un agente, la
rutina lo toma sola sin tocar nada acá.

**Por qué a esas horas.** Los cinco que miran arrancan de a quince minutos:
así no compiten entre ellos por el mismo minuto y, si uno tarda, no arrastra a
los demás. El jardinero va después de todos, el sábado, para elegir sobre una
lista que ya tiene lo de la semana.

**Por qué el jardinero sólo los sábados.** Los otros cinco proponen; él
implementa. Todos los días serían siete ramas por semana esperando revisión, y
la revisión es tuya. Una por semana se mira el lunes con un café.

**El jardinero necesita poder escribir en el repositorio.** Los otros cinco
sólo leen; él deja una rama. Cuando le pongas los repos, comprobá que la
conexión con GitHub tenga permiso de escritura sobre `ifbotech/root-lab` y
`ifbotech/root-kit`. Si no lo tiene, va a hacer todo el trabajo y no va a poder
dejarlo: lo vas a ver en el informe, que igual te llega.

**Los avisos.** Los cinco que miran corren callados: una vuelta sin ideas es
lo normal y no hace falta que suene el teléfono todos los días a las cuatro de
la mañana. El jardinero sí avisa por correo y al teléfono cuando termina, que
es el sábado. Se cambia en la misma pantalla de cada rutina.

## Cómo saber que anda

- **A las horas**: en [claude.ai/code](https://claude.ai/code) queda la sesión
  de cada corrida, con todo lo que hizo. La primera vuelta es la que te dice si
  los repos quedaron bien puestos: si el agente no encuentra
  `root-lab/agentes/<lo suyo>.md`, es que le falta ese campo.
- **En el producto**: la trastienda → **El vivero**. Si aparecieron ideas
  nuevas con autor `agente-infra` y compañía, la cadena entera funciona.
- **El sábado**: te llega un correo con el informe del jardinero.
- Si un agente no encontró nada que valga la pena, **no propone nada**: está
  escrito así en su prompt. Una vuelta sin ideas es un buen resultado, no una
  falla.

## Si preferís no usar routines

Está el cron: `deploy/vivero.cron` y `deploy/vivero.sh`, que hacen lo mismo en
una máquina propia. Los detalles, en [README.md](README.md).
