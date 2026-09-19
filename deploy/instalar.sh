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
# LA CLAVE MAESTRA
#
# Si /etc/root-lab.env no tiene ROOTLAB_SECRETO, se genera una (32 bytes al
# azar) y se agrega. Con ella se cifran los emails, los nombres y las charlas,
# y se deriva la pimienta de las contraseñas: SIN ELLA LA BASE NO SIRVE. El
# script no la imprime (no tiene que quedar en ningún log): dice cómo leerla
# para guardarla en un gestor de contraseñas (docs/seguridad.md). Nunca se
# regenera si ya existe.
#
# NODE PROPIO
#
# root-lab necesita Node 24.7 o más nuevo (node:sqlite y Argon2id). En vez de
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
# Se compara la versión ENTERA con la última 24.x, no sólo el 24: las
# versiones menores de Node traen los parches de seguridad, y comparando sólo
# el número mayor el servidor se quedaba para siempre con la primera que bajó.
ACTUAL=""
[ -x "$NODE_DIR/bin/node" ] && ACTUAL="$("$NODE_DIR/bin/node" --version)"
TMP="$(mktemp -d)"
URL="https://nodejs.org/dist/latest-v${NODE_MAYOR}.x"
if curl -fsSL "$URL/SHASUMS256.txt" -o "$TMP/SHASUMS256.txt"; then
  ARCHIVO="$(grep -oE "node-v[0-9.]+-linux-${ARQ}\.tar\.xz" "$TMP/SHASUMS256.txt" | head -1)"
  [ -n "$ARCHIVO" ] || { echo "No encontré Node $NODE_MAYOR para linux-$ARQ"; exit 1; }
  ULTIMA="$(echo "$ARCHIVO" | grep -oE 'v[0-9]+\.[0-9]+\.[0-9]+')"
  if [ "$ACTUAL" != "$ULTIMA" ]; then
    echo "Node ${ACTUAL:-(ninguno)} -> $ULTIMA"
    curl -fsSL "$URL/$ARCHIVO" -o "$TMP/$ARCHIVO"
    (cd "$TMP" && grep " $ARCHIVO\$" SHASUMS256.txt | sha256sum -c -)
    rm -rf "$NODE_DIR.nuevo"
    mkdir -p "$NODE_DIR.nuevo"
    # --no-same-owner: como root, tar conserva el dueño del paquete (uid 1001),
    # y un usuario futuro con ese número podría cambiar el programa que corre
    # ROOTLAB y que este instalador corre como root.
    tar --no-same-owner -xJf "$TMP/$ARCHIVO" -C "$NODE_DIR.nuevo" --strip-components=1
    rm -rf "$NODE_DIR"
    mv "$NODE_DIR.nuevo" "$NODE_DIR"
  fi
elif [ -z "$ACTUAL" ]; then
  echo "No pude bajar Node y no hay ninguno instalado."; exit 1
else
  echo "Sin red hacia nodejs.org: sigo con $ACTUAL"
fi
rm -rf "$TMP"
chown -R root:root "$NODE_DIR"
NODE="$NODE_DIR/bin/node"
NPM="$NODE_DIR/bin/npm"
"$NODE" --version

paso "Usuario y carpetas"
id rootlab >/dev/null 2>&1 || useradd --system --home "$DATOS" --shell /usr/sbin/nologin rootlab
mkdir -p "$DATOS" "$DATOS/respaldos"
chown -R rootlab:rootlab "$DATOS"
chmod 750 "$DATOS"
permisos_respaldos() {
  # Si existe el usuario que baja los respaldos (endurecer-vps.sh), su grupo
  # lee las copias CIFRADAS y nada más; si no, la carpeta es sólo del servicio.
  if getent group respaldos >/dev/null; then
    chgrp respaldos "$DATOS/respaldos"
    chmod 2750 "$DATOS/respaldos"
    find "$DATOS/respaldos" -type f -name '*.db.enc' -exec chgrp respaldos {} + -exec chmod 640 {} +
  else
    chmod 700 "$DATOS/respaldos"
  fi
  find "$DATOS/respaldos" -type f ! -name '*.db.enc' -exec chmod 600 {} +
}
permisos_respaldos

paso "Respaldo antes de actualizar"
if [ -n "${ROOTLAB_REEJECUTADO:-}" ]; then
  echo "ya se hizo"
elif [ ! -f "$DATOS/rootkit.db" ]; then
  echo "todavía no hay base"
elif systemctl list-unit-files root-lab-respaldo.service >/dev/null 2>&1 \
     && systemctl cat root-lab-respaldo >/dev/null 2>&1; then
  # Por el servicio y no a mano: así hereda /etc/root-lab.env y sale también
  # la copia CIFRADA. A mano quedaba sólo la local, que es la que menos sirve
  # el día que el problema es el servidor.
  systemctl start root-lab-respaldo \
    && journalctl -u root-lab-respaldo -n 1 --no-pager -o cat \
    || echo "no se pudo respaldar (se sigue igual)"
elif [ -f "$DIR/tools/respaldar.mjs" ]; then
  # Primera instalación: el servicio todavía no está.
  runuser -u rootlab -- "$NODE" --disable-warning=ExperimentalWarning "$DIR/tools/respaldar.mjs" "$DATOS" \
    || echo "no se pudo respaldar (se sigue igual)"
else
  echo "todavía no hay con qué"
fi

paso "Código ($RAMA)"
INSTALADOR_ANTES=""
[ -f "$DIR/deploy/instalar.sh" ] && INSTALADOR_ANTES="$(sha256sum "$DIR/deploy/instalar.sh" | cut -d' ' -f1)"
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" fetch --quiet origin "$RAMA"
  git -C "$DIR" reset --quiet --hard "origin/$RAMA"
else
  git clone --quiet --branch "$RAMA" "$REPO" "$DIR"
fi
git -C "$DIR" log --oneline -1
# bash sigue leyendo el instalador VIEJO (git lo reemplazó por un archivo
# nuevo): si cambió, lo que falta —configuración, servicios— lo hace el nuevo.
if [ -z "${ROOTLAB_REEJECUTADO:-}" ] && [ -n "$INSTALADOR_ANTES" ] \
   && [ "$(sha256sum "$DIR/deploy/instalar.sh" | cut -d' ' -f1)" != "$INSTALADOR_ANTES" ]; then
  echo "el instalador cambió: sigo con el nuevo"
  ROOTLAB_REEJECUTADO=1 exec bash "$DIR/deploy/instalar.sh"
fi
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
# Sólo los emuladores se registran solos; las placas las registra la fábrica.
ROOTLAB_TOFU=emulador

# IA (docs/ia.md). Sin clave válida, la app esconde las funciones de IA.
# ROOTLAB_IA_DEMO=1
# ANTHROPIC_API_KEY=
# ROOTLAB_IA_MODELO=claude-opus-5
# ROOTLAB_IA_MODELO_CHAT=claude-sonnet-5
ROOTLAB_IA_TOPE_DIA_USD=2
ROOTLAB_IA_TOPE_MES_USD=20
# ROOTLAB_CUOTA_CHAT=3

# Correo (docs/correo.md). Sin SMTP, los emails quedan en $DATOS/correos.
# ROOTLAB_SMTP_HOST=smtp-relay.brevo.com
# ROOTLAB_SMTP_PORT=587
# ROOTLAB_SMTP_USUARIO=
# ROOTLAB_SMTP_CLAVE=
# ROOTLAB_CORREO_REMITENTE=ROOTLAB <no-reply@ifbotech.com>
# ROOTLAB_ADMIN_EMAIL=
EOF
  echo "creado $ENV_FILE"
else
  echo "se conserva $ENV_FILE"
fi
if ! grep -qE '^ROOTLAB_SECRETO=.{40,}' "$ENV_FILE"; then
  SECRETO="$(head -c 32 /dev/urandom | base64 | tr -d '\n')"
  printf '\n# Clave maestra: cifra los datos personales. NO la pierdas ni la cambies.\nROOTLAB_SECRETO=%s\n' "$SECRETO" >> "$ENV_FILE"
  printf '\n\033[1;33m!!\033[0m Clave maestra nueva en %s (no se muestra: no tiene que quedar en ningún log).\n   Guardá una copia fuera del servidor, en un gestor de contraseñas:\n     sudo grep ROOTLAB_SECRETO %s\n   Sin ella, los emails y las contraseñas de la base no se recuperan.\n\n' "$ENV_FILE" "$ENV_FILE"
  unset SECRETO
fi
# Claves que se generan solas si faltan. Ninguna se muestra: no tienen que
# quedar en ningún log. Se leen con: sudo grep NOMBRE /etc/root-lab.env
generar_clave() {   # nombre, bytes, comentario
  if ! grep -qE "^$1=.{24,}" "$ENV_FILE"; then
    local valor
    valor="$(head -c "$2" /dev/urandom | base64 | tr -d '\n/+=')"
    printf '\n# %s\n%s=%s\n' "$3" "$1" "$valor" >> "$ENV_FILE"
    unset valor
    printf '\033[1;33m!!\033[0m %s nueva en %s (no se muestra). Guardá una copia fuera del servidor:\n     sudo grep %s %s\n' "$1" "$ENV_FILE" "$1" "$ENV_FILE"
  fi
}
generar_clave ROOTLAB_ADMIN_CLAVE 36 'Administración (/api/admin/*): fábrica, firmware y métricas. docs/operacion.md'
# Quiénes entran a la trastienda con un código a su email. Se pregunta una
# sola vez, cuando todavía no está: sin esto sólo se entra con la clave.
if ! grep -qE '^ROOTLAB_ADMINS=' "$ENV_FILE"; then
  printf '
# Quiénes entran a la trastienda (/admin) con un código a su email.
# A estos no se les puede sacar el rol desde el panel. docs/trastienda.md
ROOTLAB_ADMINS='"'"'%s'"'"'
'     "$(grep -E '^ROOTLAB_ADMIN_EMAIL=' "$ENV_FILE" | cut -d= -f2-)" >> "$ENV_FILE"
  echo "ROOTLAB_ADMINS quedó en $ENV_FILE: agregá ahí los emails que entran a la trastienda"
fi
generar_clave ROOTLAB_RESPALDO_CLAVE 36 'Cifra los respaldos que salen del servidor. Sin ella no se pueden abrir. docs/operacion.md'
# La confianza al primer uso abierta a cualquiera era del prototipo: desde que
# existe la estación de fábrica, sólo los emuladores se registran solos.
if grep -qE '^ROOTLAB_TOFU=1$' "$ENV_FILE"; then
  sed -i 's/^ROOTLAB_TOFU=1$/ROOTLAB_TOFU=emulador/' "$ENV_FILE"
  echo "ROOTLAB_TOFU pasó a 'emulador': las placas nuevas las registra la fábrica (tools/fabrica.py en root-kit)"
fi
if grep -qE '^ROOTLAB_RESPALDO_DESTINO=.+' "$ENV_FILE" && ! command -v rclone >/dev/null 2>&1; then
  apt-get install -y -qq rclone || echo "no pude instalar rclone: los respaldos quedan sólo en el servidor"
fi
# Un valor con espacios y sin comillas rompe `. /etc/root-lab.env` en la
# consola (systemd lo lee igual, hace su propio parseo). Pasó con
# ROOTLAB_ADMINS al agregar un segundo email separado por ", ".
sed -i -E "s/^([A-Z_][A-Z0-9_]*)=([^\"'#]*[[:blank:]][^\"'#]*)\$/\\1='\\2'/" "$ENV_FILE"
# 600 y no 640: los servicios lo reciben por EnvironmentFile, que lo lee
# systemd como root antes de bajar a rootlab. Nadie más tiene por qué leerlo.
chmod 600 "$ENV_FILE"
chown root:root "$ENV_FILE"
# El vapid.json es una clave privada; las que quedaron abiertas se cierran.
if [ -f "$DATOS/vapid.json" ]; then chmod 600 "$DATOS/vapid.json"; fi
permisos_respaldos

paso "Servicio y respaldo diario"
install -m 644 "$DIR/deploy/root-lab.service" /etc/systemd/system/root-lab.service
install -m 644 "$DIR/deploy/root-lab-respaldo.service" /etc/systemd/system/root-lab-respaldo.service
install -m 644 "$DIR/deploy/root-lab-respaldo.timer" /etc/systemd/system/root-lab-respaldo.timer
install -m 644 "$DIR/deploy/root-lab-verificar-respaldo.service" /etc/systemd/system/root-lab-verificar-respaldo.service
install -m 644 "$DIR/deploy/root-lab-verificar-respaldo.timer" /etc/systemd/system/root-lab-verificar-respaldo.timer
systemctl daemon-reload
systemctl enable --quiet root-lab
systemctl enable --quiet --now root-lab-respaldo.timer
systemctl enable --quiet --now root-lab-verificar-respaldo.timer
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
