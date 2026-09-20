#!/usr/bin/env bash
# vivero.sh — una vuelta de un agente del vivero.
#
#   ./deploy/vivero.sh infraestructura
#   ./deploy/vivero.sh jardinero
#
# Es lo que llama el cron (deploy/vivero.cron). Hace tres cosas: carga la
# configuración, deja los dos repos al día, y le pasa a Claude el prompt del
# agente que toca.
#
# CONFIGURACIÓN (/etc/rootlab-vivero.env, sólo lectura para su usuario)
#
#   ROOTLAB_NUBE=https://ifbotech.com/rootkit
#   ROOTLAB_ADMIN_CLAVE=agt_...        el TOKEN DEL AGENTE, no la clave del
#                                      servidor: lee cómo anda el producto y
#                                      escribe en el vivero, nada más
#                                      (trastienda → Cuentas → Agentes)
#   PROYECTO=/home/rootlab/proyecto    la carpeta con root-kit y root-lab
#
# Por qué un token de agente y no la clave: esto corre solo, todos los días, en
# una máquina que no está mirando nadie. Si el archivo se filtra, quien lo tenga
# puede leer la flota aparato por aparato y los recuentos del producto, y
# escribir ideas en una lista; no puede tocar cuentas, ni datos de personas, ni
# firmware. Con la clave del servidor podría todo eso. Por eso este archivo va
# con chmod 600 y en una máquina que no sea la de producción.

set -euo pipefail

AGENTE="${1:-}"
CONFIG="${VIVERO_ENV:-/etc/rootlab-vivero.env}"

if [ -z "$AGENTE" ]; then
  echo "Uso: $0 <infraestructura|experiencia|firmware|producto|seguridad|jardinero>" >&2
  exit 1
fi

[ -r "$CONFIG" ] || { echo "No puedo leer $CONFIG" >&2; exit 1; }
set -a
# shellcheck disable=SC1090
. "$CONFIG"
set +a

: "${PROYECTO:?falta PROYECTO en $CONFIG}"
: "${ROOTLAB_NUBE:?falta ROOTLAB_NUBE en $CONFIG}"
: "${ROOTLAB_ADMIN_CLAVE:?falta ROOTLAB_ADMIN_CLAVE en $CONFIG}"

PROMPT="$PROYECTO/root-lab/agentes/$AGENTE.md"
[ -r "$PROMPT" ] || { echo "No existe el prompt $PROMPT" >&2; exit 1; }

cd "$PROYECTO"
echo "== $(date '+%F %T') · agente $AGENTE"

# Los dos repos al día: un agente que mira código viejo propone cosas viejas.
for repo in root-kit root-lab; do
  if [ -d "$repo/.git" ]; then
    git -C "$repo" fetch --quiet origin || echo "  (no pude traer $repo: sigo con lo que hay)"
    # El jardinero trabaja en ramas; los demás sólo miran. A ninguno se le
    # pisa lo que haya sin guardar.
    if [ -z "$(git -C "$repo" status --porcelain)" ]; then
      git -C "$repo" checkout --quiet main && git -C "$repo" merge --quiet --ff-only origin/main || true
    else
      echo "  ($repo tiene cambios sin guardar: lo dejo como está)"
    fi
  fi
done

# Y a trabajar. `-p` es el modo de una sola pasada, sin interfaz.
claude -p "$(cat "$PROMPT")"
echo "== $(date '+%F %T') · $AGENTE terminó"
