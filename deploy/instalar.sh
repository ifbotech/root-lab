#!/usr/bin/env bash
# instalar.sh — instala o actualiza root-lab en un VPS con Ubuntu.
#
#   curl -fsSL https://raw.githubusercontent.com/ifbotech/root-lab/main/deploy/instalar.sh | sudo bash
#   (o, con el repo ya clonado:  sudo bash /opt/root-lab/deploy/instalar.sh)
#
# Es idempotente: la primera vez instala todo; las siguientes trae la última
# versión de main, instala dependencias y reinicia el servicio. Nunca pisa la
# configuración (/etc/root-lab.env) ni los datos (/var/lib/root-lab).
#
# Variables para la primera instalación (todas opcionales):
#   ROOTLAB_BASE          subruta donde se monta la app      (/rootkit)
#   ROOTLAB_URL_PUBLICA   URL pública completa, con la base  (https://ifbotech.com/rootkit)
#   PORT                  puerto local                       (8090)
#   RAMA                  rama de git                        (main)

set -euo pipefail

REPO="https://github.com/ifbotech/root-lab.git"
DIR="/opt/root-lab"
DATOS="/var/lib/root-lab"
ENV_FILE="/etc/root-lab.env"
RAMA="${RAMA:-main}"
PORT="${PORT:-8090}"
BASE="${ROOTLAB_BASE:-/rootkit}"
PUBLICA="${ROOTLAB_URL_PUBLICA:-https://ifbotech.com/rootkit}"

paso() { printf '\n\033[1;32m==>\033[0m %s\n' "$*"; }

[ "$(id -u)" -eq 0 ] || { echo "Correlo como root (sudo)."; exit 1; }

paso "Node.js"
if ! command -v node >/dev/null 2>&1 || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl gnupg git
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -qq nodejs
fi
command -v git >/dev/null 2>&1 || apt-get install -y -qq git
node --version

paso "Usuario y carpetas"
id rootlab >/dev/null 2>&1 || useradd --system --home "$DATOS" --shell /usr/sbin/nologin rootlab
mkdir -p "$DATOS"
chown -R rootlab:rootlab "$DATOS"
chmod 750 "$DATOS"

paso "Código ($RAMA)"
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" fetch --quiet origin "$RAMA"
  git -C "$DIR" reset --quiet --hard "origin/$RAMA"
else
  git clone --quiet --branch "$RAMA" "$REPO" "$DIR"
fi
git -C "$DIR" log --oneline -1
cd "$DIR"
npm ci --omit=dev --no-audit --no-fund --loglevel=error
chown -R root:root "$DIR"

paso "Configuración"
if [ ! -f "$ENV_FILE" ]; then
  cat > "$ENV_FILE" <<EOF
# root-lab — ver docs/despliegue.md
PORT=$PORT
ROOTLAB_HOST=127.0.0.1
ROOTLAB_BASE=$BASE
ROOTLAB_URL_PUBLICA=$PUBLICA
ROOTLAB_DATOS=$DATOS
ROOTLAB_TOFU=1
# ANTHROPIC_API_KEY=
# ROOTLAB_IA_MODELO=claude-opus-5
EOF
  chmod 640 "$ENV_FILE"
  chgrp rootlab "$ENV_FILE"
  echo "creado $ENV_FILE"
else
  echo "se conserva $ENV_FILE"
fi

paso "Servicio"
install -m 644 "$DIR/deploy/root-lab.service" /etc/systemd/system/root-lab.service
systemctl daemon-reload
systemctl enable --quiet root-lab
systemctl restart root-lab

paso "Salud"
PUERTO_REAL="$(grep -E '^PORT=' "$ENV_FILE" | cut -d= -f2)"
BASE_REAL="$(grep -E '^ROOTLAB_BASE=' "$ENV_FILE" | cut -d= -f2)"
for i in $(seq 1 20); do
  if curl -fsS "http://127.0.0.1:${PUERTO_REAL}${BASE_REAL}/api/salud"; then
    echo
    echo "root-lab funcionando en 127.0.0.1:${PUERTO_REAL}${BASE_REAL}/"
    exit 0
  fi
  sleep 0.5
done
echo "No respondió. Mirá: journalctl -u root-lab -n 50"
exit 1
