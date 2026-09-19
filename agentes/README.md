# Los agentes del vivero

Cinco agentes miran el proyecto sin parar, cada uno por su lado, y dejan lo que
encuentran anotado en **el vivero** de la trastienda (`/rootkit/admin` → El
vivero). Un sexto, **el jardinero**, elige la mejor idea de la lista y la
implementa.

| Agente | Área | Qué mira | Con cron |
|---|---|---|---|
| [infraestructura.md](infraestructura.md) | `infraestructura` | el servidor, el despliegue, los respaldos, el costo | lunes |
| [experiencia.md](experiencia.md) | `experiencia` | las pantallas, los textos, el alta, la accesibilidad | martes |
| [firmware.md](firmware.md) | `firmware` | el consumo, los sensores, la OTA, la fábrica | miércoles |
| [producto.md](producto.md) | `producto` | qué funciona, qué falta, qué sobra, qué se cobra | jueves |
| [seguridad.md](seguridad.md) | `seguridad` | los datos de la gente, las claves, lo que se expone | viernes |
| [jardinero.md](jardinero.md) | — | **implementa** la mejor idea del vivero y manda el informe | sábado |

Los cinco primeros **no tocan el código**: proponen, y desde la trastienda se
decide. El jardinero sí, pero deja su trabajo en una rama, nunca en `main`, y
nunca despliega.

La última columna es el día que le toca a cada uno **con cron**, que es un
agente por día. Con routines —que es lo que está corriendo— los cinco que
miran van todos los días, escalonados de a quince minutos, y el jardinero
sigue yendo los sábados: los horarios están en [RUTINAS.md](RUTINAS.md).

## Lo que necesita cada agente

```bash
ROOTLAB_NUBE=https://ifbotech.com/rootkit
ROOTLAB_ADMIN_CLAVE=agt_...    # un TOKEN de agente, no la clave del servidor
```

El token se crea en **la trastienda → Cuentas → Los agentes**, se muestra una
sola vez, y sólo sirve para escribir en el vivero (uno de alcance `jardinero`,
además, para mandar el informe). Si se filtra, lo peor que puede hacer quien lo
tenga es anotar ideas en una lista; y se revoca desde la misma pantalla.

Con cron cada agente puede llevar el suyo, porque la configuración es un
archivo por máquina. Con routines no: las variables son del entorno y se
comparten, así que ahí va **uno solo, de alcance `vivero`**, para los seis. No
se pierde nada: el autor de cada idea viaja en `--autor`, no en la credencial.

Una vuelta a mano, desde la carpeta que tiene los dos repos:

```bash
claude -p "$(cat root-lab/agentes/infraestructura.md)"
```

## Dejarlos dando vueltas

Hay dos formas, y las dos sirven. **La recomendada son las routines**: no
dependen de que haya una máquina prendida, y las seis ya están creadas. Lo que
falta para terminar de enchufarlas está en **[RUTINAS.md](RUTINAS.md)**.

### Con cron, en una máquina propia

Es lo que está armado en el repositorio:

- `deploy/vivero.sh` — una vuelta de un agente: carga la configuración, deja
  los dos repos al día y le pasa el prompt a Claude.
- `deploy/vivero.cron` — de lunes a sábado, 4 de la mañana, uno por día.

```bash
# 1. Claude Code instalado y conectado en esa máquina
claude            # si pide entrar, entrás una vez y listo

# 2. Los dos repos en una misma carpeta
mkdir -p ~/proyecto && cd ~/proyecto
git clone https://github.com/ifbotech/root-kit.git
git clone https://github.com/ifbotech/root-lab.git

# 3. La configuración, que sólo lee su dueño
sudo tee /etc/rootlab-vivero.env >/dev/null <<'FIN'
PROYECTO=/home/USUARIO/proyecto
ROOTLAB_NUBE=https://ifbotech.com/rootkit
ROOTLAB_ADMIN_CLAVE=agt_...
FIN
sudo chown USUARIO /etc/rootlab-vivero.env && sudo chmod 600 /etc/rootlab-vivero.env

# 4. El cron (ajustá las rutas de deploy/vivero.cron antes)
crontab root-lab/deploy/vivero.cron
crontab -l
```

Se mira con `tail -f /var/log/vivero.log`.

**En qué máquina.** En cualquiera que tenga los repos y Claude Code: la de
trabajo, una Raspberry, un VPS. **Conviene que no sea el servidor de
producción**: ahí corre lo que usan los clientes, y no hace falta sumarle un
agente con permisos de escritura en los repos.

*En Windows* es lo mismo con el Programador de tareas: una tarea por agente,
acción `claude -p ...`, con las variables de entorno cargadas.

### Con routines de Claude Code (recomendado)

Claude Code tiene su propio programador —**routines**— que corre en la nube de
Anthropic, así que no hace falta dejar una máquina prendida. Se administran en
[claude.ai/code/routines](https://claude.ai/code/routines), desde la aplicación
de escritorio o con `/schedule` en la terminal. Con el plan Max entran hasta 15
corridas por día.

**Las seis ya están creadas**, con su nombre, su horario y su instrucción.
Falta enchufarlas: los dos repositorios y las variables de entorno en cada
rutina, y dejar salir a `ifbotech.com` en la política de red del entorno. Nada
de eso se puede dejar puesto desde afuera, y sin los repositorios el jardinero
no puede ni empujar su rama.

El agente corre en un entorno que no es el nuestro, así que hay que darle el
token como variable de ese entorno: justamente para eso existen los tokens de
alcance limitado.

**Qué falta exactamente, con los horarios y lo que dice cada una, está en
[RUTINAS.md](RUTINAS.md).**

## Qué hacer con lo que proponen

Entrar a la trastienda una vez por semana, mirar **El vivero** como viene
(impacto alto y esfuerzo bajo primero) y mover cada idea: *en curso*,
*plantada* o *descartada* con su motivo. Descartar no es fracasar: una lista
que sólo crece deja de leerse, y un motivo escrito le enseña al agente que la
propuso.

El sábado, el jardinero elige una de las que quedaron en *nueva*, la
implementa, corre las pruebas, la deja en una rama y manda un informe por
correo. El lunes se revisa con `git diff`, se mergea y se despliega. Esa última
parte es a mano **a propósito**: un agente que corre solo un sábado a la noche
no tiene por qué poder tocar lo que usan los clientes.
