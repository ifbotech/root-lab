#!/usr/bin/env bash
# instalar.sh — instala o actualiza root-lab en un VPS con Ubuntu.
#
#   curl -fsSL https://raw.githubusercontent.com/ifbotech/root-lab/main/deploy/instalar.sh | sudo bash
#   (o, con el repo ya clonado:  sudo bash /opt/root-lab/deploy/instalar.sh)
#
# Es idempotente: la primera vez instala todo; las siguientes trae la última
# versión de main, instala dependencias y reinicia el servicio. Nunca pisa la
# configuración (/etc/root-lab.env) ni los datos (/var/lib/root-lab), y antes
# de actualizar hace un respaldo de la base.
#
# NODE PROPIO
#
# root-lab necesita Node 22.13 o más nuevo (usa node:sqlite). En vez de
# cambiar el Node del sistema, que puede estar usando otra cosa del servidor,
# baja el Node 24 oficial a /opt/root-lab-node, verifica su SHA-256 y lo usa
# sólo para este servicio.
#
# Variables para la primera instalación (todas opcionales):
#   ROOTLAB_BASE          subruta donde se monta la app      (/rootkit)
#   ROOTLAB_URL_PUBLICA   URL pública completa, con la base  (https://ifbotech.com/rootkit)
#   PORT                  puerto local                       (8090)
#   RAMA                  rama de git                        (main)
#   NODE_MAYOR            versión mayor de Node              (24)

set -euo pipefail

REPO="https://github.com/ifbotech/root-lab.git"
DIR="/opt/root-lab"
NODE_DIR="/opt/root-lab-node"
DATOS="/var/lib/root-lab"
ENV_FILE="/etc/root-lab.env"
RAMA="${RAMA:-main}"
PORT="${PORT:-8090}"
BASE="${ROOTLAB_BASE:-/rootkit}"
PUBLICA="${ROOTLAB_URL_PUBLICA:-https://ifbotech.com/rootkit}"
NODE_MAYOR="${NODE_MAYOR:-24}"

paso() { printf '\n\033[1;32m==>\033[0m %s\n' "$*"; }

[ "$(id -u)" -eq 0 ] || { echo "Correlo como root (sudo)."; exit 1; }

paso "Herramientas"
if ! command -v git >/dev/null 2>&1 || ! command -v curl >/dev/null 2>&1 || ! command -v xz >/dev/null 2>&1; then
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl git xz-utils
fi

paso "Node.js $NODE_MAYOR (propio, en $NODE_DIR)"
case "$(uname -m)" in
  x86_64) ARQ=x64 ;;
  aarch64) ARQ=arm64 ;;
  *) echo "Arquitectura no soportada: $(uname -m)"; exit 1 ;;
esac
ACTUAL=""
[ -x "$NODE_DIR/bin/node" ] && ACTUAL="$("$NODE_DIR/bin/node" -p 'process.versions.node.split(".")[0]')"
if [ "$ACTUAL" != "$NODE_MAYOR" ]; then
  TMP="$(mktemp -d)"
  URL="https://nodejs.org/dist/latest-v${NODE_MAYOR}.x"
  curl -fsSL "$URL/SHASUMS256.txt" -o "$TMP/SHASUMS256.txt"
  ARCHIVO="$(grep -oE "node-v[0-9.]+-linux-${ARQ}\.tar\.xz" "$TMP/SHASUMS256.txt" | head -1)"
  [ -n "$ARCHIVO" ] || { echo "No encontré Node $NODE_MAYOR para linux-$ARQ"; exit 1; }
  curl -fsSL "$URL/$ARCHIVO" -o "$TMP/$ARCHIVO"
  (cd "$TMP" && grep " $ARCHIVO\$" SHASUMS256.txt | sha256sum -c -)
  rm -rf "$NODE_DIR.nuevo"
  mkdir -p "$NODE_DIR.nuevo"
  tar -xJf "$TMP/$ARCHIVO" -C "$NODE_DIR.nuevo" --strip-components=1
  rm -rf "$NODE_DIR"
  mv "$NODE_DIR.nuevo" "$NODE_DIR"
  rm -rf "$TMP"
fi
NODE="$NODE_DIR/bin/node"
NPM="$NODE_DIR/bin/npm"
"$NODE" --version

paso "Usuario y carpetas"
id rootlab >/dev/null 2>&1 || useradd --system --home "$DATOS" --shell /usr/sbin/nologin rootlab
mkdir -p "$DATOS" "$DATOS/respaldos"
chown -R rootlab:rootlab "$DATOS"
chmod 750 "$DATOS" "$DATOS/respaldos"

paso "Respaldo antes de actualizar"
if [ -f "$DATOS/rootkit.db" ] && [ -f "$DIR/tools/respaldar.mjs" ]; then
  runuser -u rootlab -- "$NODE" --disable-warning=ExperimentalWarning "$DIR/tools/respaldar.mjs" "$DATOS" \
    || echo "no se pudo respaldar (se sigue igual)"
else
  echo "todavía no hay base"
fi

paso "Código ($RAMA)"
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" fetch --quiet origin "$RAMA"
  git -C "$DIR" reset --quiet --hard "origin/$RAMA"
else
  git clone --quiet --branch "$RAMA" "$REPO" "$DIR"
fi
git -C "$DIR" log --oneline -1
cd "$DIR"
PATH="$NODE_DIR/bin:$PATH" "$NPM" ci --omit=dev --no-audit --no-fund --loglevel=error
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

paso "Servicio y respaldo diario"
install -m 644 "$DIR/deploy/root-lab.service" /etc/systemd/system/root-lab.service
install -m 644 "$DIR/deploy/root-lab-respaldo.service" /etc/systemd/system/root-lab-respaldo.service
install -m 644 "$DIR/deploy/root-lab-respaldo.timer" /etc/systemd/system/root-lab-respaldo.timer
systemctl daemon-reload
systemctl enable --quiet root-lab
systemctl enable --quiet --now root-lab-respaldo.timer
systemctl restart root-lab

paso "Salud"
PUERTO_REAL="$(grep -E '^PORT=' "$ENV_FILE" | cut -d= -f2)"
BASE_REAL="$(grep -E '^ROOTLAB_BASE=' "$ENV_FILE" | cut -d= -f2)"
for i in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${PUERTO_REAL}${BASE_REAL}/api/salud" 2>/dev/null; then
    echo
    echo "root-lab funcionando en 127.0.0.1:${PUERTO_REAL}${BASE_REAL}/"
    exit 0
  fi
  sleep 0.5
done
echo "No respondió. Mirá: journalctl -u root-lab -n 50"
exit 1
