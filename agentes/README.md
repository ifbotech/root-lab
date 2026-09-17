# Los agentes del vivero

Cinco agentes que miran el proyecto sin parar, cada uno por su lado, y dejan
lo que encuentran anotado en **el vivero** de la trastienda
(`/rootkit/admin` → El vivero). Nadie toca el código: proponen, y desde la
trastienda se decide qué se planta.

| Agente | Área | Qué mira |
|---|---|---|
| [infraestructura.md](infraestructura.md) | `infraestructura` | el servidor, el despliegue, los respaldos, el costo, lo que tarda |
| [experiencia.md](experiencia.md) | `experiencia` | las pantallas, los textos, el alta, la accesibilidad, lo que la gente usa |
| [firmware.md](firmware.md) | `firmware` | el consumo, los sensores, la OTA, la fábrica, las carcasas |
| [producto.md](producto.md) | `producto` | qué funciona del producto, qué falta, qué sobra, qué se cobra |
| [seguridad.md](seguridad.md) | `seguridad` | los datos de la gente, las claves, lo que se expone, la privacidad |

## Cómo se les habla

Cada archivo es el prompt entero: se le pasa a Claude tal cual. Necesita dos
cosas del entorno:

```bash
export ROOTLAB_NUBE=https://ifbotech.com/rootkit
export ROOTLAB_ADMIN_CLAVE=...        # sudo grep ROOTLAB_ADMIN_CLAVE /etc/root-lab.env
```

Una vuelta a mano, desde la carpeta del proyecto:

```bash
claude -p "$(cat root-lab/agentes/infraestructura.md)"
```

## Cómo se los deja dando vueltas

**En una sesión abierta.** Lo más simple para empezar: abrir Claude Code en la
carpeta del proyecto, pegar el prompt y pedirle `/loop` para que lo repita
cada tanto. Sirve para ver qué proponen antes de soltarlos solos.

**Solos, todos los días.** Una tarea programada por agente, en días u horas
distintas para que no se pisen ni gasten todo junto:

*En Linux (el VPS, o cualquier máquina con el repo clonado), `crontab -e`:*

```cron
# El vivero: un agente por día, a las 4 de la mañana.
0 4 * * 1  cd /ruta/al/proyecto && ROOTLAB_NUBE=... ROOTLAB_ADMIN_CLAVE=... claude -p "$(cat root-lab/agentes/infraestructura.md)" >> /var/log/vivero.log 2>&1
0 4 * * 2  cd /ruta/al/proyecto && ... claude -p "$(cat root-lab/agentes/experiencia.md)"     >> /var/log/vivero.log 2>&1
0 4 * * 3  cd /ruta/al/proyecto && ... claude -p "$(cat root-lab/agentes/firmware.md)"        >> /var/log/vivero.log 2>&1
0 4 * * 4  cd /ruta/al/proyecto && ... claude -p "$(cat root-lab/agentes/producto.md)"        >> /var/log/vivero.log 2>&1
0 4 * * 5  cd /ruta/al/proyecto && ... claude -p "$(cat root-lab/agentes/seguridad.md)"       >> /var/log/vivero.log 2>&1
```

*En Windows*, lo mismo con el Programador de tareas: una tarea por agente, con
acción `claude -p ...` y las variables de entorno cargadas.

La clave de administración no va escrita en el crontab a la vista de todos:
conviene dejarla en un archivo que sólo lea ese usuario (`chmod 600`) y
cargarla con `set -a; . /ruta/vivero.env; set +a` antes del comando.

## Por qué uno por día y no todos todo el tiempo

Un agente que da vueltas encuentra lo mismo muchas veces. El vivero lo
aguanta —una idea repetida se cuenta, no se duplica— pero cada vuelta cuesta
plata y atención. Una vuelta por área por semana ya llena la lista más rápido
de lo que se puede plantar. Si el proyecto se mueve mucho (una semana de
cambios grandes), se los puede correr más seguido a mano.

## Qué hacer con lo que proponen

Entrar a la trastienda una vez por semana, mirar **El vivero** ordenado como
viene (impacto alto y esfuerzo bajo primero) y mover cada idea: *en curso*,
*plantada* o *descartada* con su motivo. Descartar no es fracasar: una lista
que sólo crece deja de leerse. Lo que se descarta con un motivo escrito
también le enseña al que la propuso, si algún día se le vuelve a ocurrir.
