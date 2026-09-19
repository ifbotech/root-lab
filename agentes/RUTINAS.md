# Armar las rutinas (seis clics y queda andando)

Las **routines** de Claude Code son la forma de dejar a los agentes dando
vueltas sin depender de que haya una máquina prendida: corren en la nube de
Anthropic con la cadencia que se les ponga. Con el plan **Max** entran hasta 15
por día, así que los seis agentes van cómodos.

No hay API pública para crearlas, así que esta parte es a mano. Son seis veces
lo mismo y no lleva más de diez minutos.

## Antes de empezar: el token

Cada agente tiene el suyo, ya creado y guardado en el VPS. Para leer uno:

```bash
ssh -i ~/.ssh/rootkit_vps root@31.97.31.58 \
  "grep '^agente-infra' /root/vivero-tokens.txt | cut -f3"
```

Los nombres son `agente-infra`, `agente-ux`, `agente-fw`, `agente-producto`,
`agente-seguridad` y `jardinero`. Se revocan y se vuelven a crear cuando sea
desde la trastienda → **Cuentas → Los agentes**.

## Los pasos, para cada agente

1. Entrar a **[claude.ai/code/routines](https://claude.ai/code/routines)** (o
   `/schedule` desde la terminal, o la aplicación de escritorio) y crear una
   rutina nueva.
2. **Nombre**: el de la columna *Rutina* de la tabla de abajo.
3. **Repositorios**: `ifbotech/root-lab` **y** `ifbotech/root-kit`. Los dos:
   los agentes miran el proyecto entero.
4. **Instrucciones**: el texto de la columna *Qué pegar*. Es corto a propósito
   —el prompt largo vive en el repositorio—, así que si mañana mejoramos lo que
   tiene que hacer un agente, la rutina lo toma sola sin tocar nada acá.
5. **Variables de entorno**:
   ```
   ROOTLAB_NUBE=https://ifbotech.com/rootkit
   ROOTLAB_ADMIN_CLAVE=<el token de ESE agente>
   ```
6. **Trigger**: *Scheduled*, con el horario de la tabla.

## La tabla

| Rutina | Cuándo | Qué pegar en las instrucciones |
|---|---|---|
| Vivero · infraestructura | todos los días, 04:10 | `Sos el agente de infraestructura del vivero de ROOTLAB. Abrí root-lab/agentes/infraestructura.md de este repositorio y hacé exactamente lo que dice, una vuelta completa. Seguí también root-lab/agentes/_comun.md, que ese archivo te manda a leer.` |
| Vivero · experiencia | todos los días, 04:25 | `Sos el agente de experiencia e interfaz del vivero de ROOTLAB. Abrí root-lab/agentes/experiencia.md de este repositorio y hacé exactamente lo que dice, una vuelta completa. Seguí también root-lab/agentes/_comun.md, que ese archivo te manda a leer.` |
| Vivero · firmware | todos los días, 04:40 | `Sos el agente de firmware y hardware del vivero de ROOTLAB. Abrí root-lab/agentes/firmware.md de este repositorio y hacé exactamente lo que dice, una vuelta completa. Seguí también root-lab/agentes/_comun.md, que ese archivo te manda a leer.` |
| Vivero · producto | todos los días, 04:55 | `Sos el agente de producto del vivero de ROOTLAB. Abrí root-lab/agentes/producto.md de este repositorio y hacé exactamente lo que dice, una vuelta completa. Seguí también root-lab/agentes/_comun.md, que ese archivo te manda a leer.` |
| Vivero · seguridad | todos los días, 05:10 | `Sos el agente de seguridad y privacidad del vivero de ROOTLAB. Abrí root-lab/agentes/seguridad.md de este repositorio y hacé exactamente lo que dice, una vuelta completa. Seguí también root-lab/agentes/_comun.md, que ese archivo te manda a leer.` |
| Vivero · el jardinero | **sábados**, 06:20 | `Sos el jardinero del vivero de ROOTLAB. Abrí root-lab/agentes/jardinero.md de este repositorio y hacé exactamente lo que dice: elegí UNA idea, implementala con sus pruebas y su documentación, dejala en una rama (nunca en main, nunca despliegues) y mandá el informe.` |

**Por qué a esas horas.** Los cinco que miran arrancan de a quince minutos:
así no compiten entre ellos por el mismo minuto y, si uno tarda, no arrastra a
los demás. El jardinero va después de todos, el sábado, para elegir sobre una
lista que ya tiene lo de la semana.

**Por qué el jardinero sólo los sábados.** Los otros cinco proponen; él
implementa. Todos los días serían siete ramas por semana esperando revisión, y
la revisión es tuya. Una por semana se mira el lunes con un café.

## Cómo saber que anda

- **A las horas**: en [claude.ai/code](https://claude.ai/code) queda la sesión
  de cada corrida, con todo lo que hizo.
- **En el producto**: la trastienda → **El vivero**. Si aparecieron ideas
  nuevas con autor `agente-infra` y compañía, la cadena entera funciona.
- **El sábado**: te llega un correo con el informe del jardinero.
- Si un agente no encontró nada que valga la pena, **no propone nada**: está
  escrito así en su prompt. Una vuelta sin ideas es un buen resultado, no una
  falla.

## Si preferís no usar routines

Está el cron: `deploy/vivero.cron` y `deploy/vivero.sh`, que hacen lo mismo en
una máquina propia. Los detalles, en [README.md](README.md).
