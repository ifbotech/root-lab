#!/usr/bin/env bash
# endurecer-vps.sh — lo que la MÁQUINA necesita, además de lo que instala
# instalar.sh para la app. Se corre como root; se puede correr cuantas veces
# se quiera (cada paso mira antes de tocar).
#
#   sudo bash /opt/root-lab/deploy/endurecer-vps.sh
#
# Qué hace, y por qué (docs/seguridad.md, "El servidor"):
#
#   1. SSH sólo con llave. Root entraba con contraseña desde cualquier IP, y
#      los repositorios son públicos y dicen cuál es el servidor.
#   2. Un usuario `respaldos` que sólo puede BAJAR los respaldos cifrados, por
#      SFTP, encerrado y de sólo lectura. La tarea diaria de la computadora
#      usa esa llave y no la de root: si esa llave se pierde, lo que se lleva
#      son archivos que sin la caja fuerte no se abren.
#   3. El Node propio, de root. Venía del tar con el uid 1001 (nadie, hoy): el
#      primer usuario que se creara con ese número podía reemplazar el
#      programa que corre ROOTLAB y que el instalador corre como root.
#   4. La API de administración de Caddy, por un socket que sólo abre Caddy.
#      En 127.0.0.1:2019 cualquier proceso de la máquina —ROOTLAB incluido,
#      si alguien lo tomara— podía reconfigurar el proxy de ifbotech.com.
#   5. Reinicio automático cuando una actualización de seguridad lo pide, a
#      las 5:10 UTC (2:10 en Argentina), después del respaldo de las 4:30.
#      El núcleo llevaba desde marzo sin cargar los parches instalados.
#
# La llave pública de la computadora que trae los respaldos va en
# /etc/ssh/claves-respaldos (una por línea; ver docs/operacion.md).
set -euo pipefail

paso() { printf '\n\033[1;32m==>\033[0m %s\n' "$*"; }
DATOS=/var/lib/root-lab
JAULA=/srv/respaldos

[ "$(id -u)" = 0 ] || { echo "Hay que correrlo como root."; exit 1; }

# ------------------------------------------------------------------ 1. SSH ---
paso "SSH: sólo con llave"
# El nombre empieza con 01 para leerse antes que 50-cloud-init.conf, que dice
# PasswordAuthentication yes: en sshd gana el PRIMER valor que aparece.
cat > /etc/ssh/sshd_config.d/01-endurecido.conf <<'EOF'
# endurecer-vps.sh (root-lab). Se lee antes que el resto: gana.
PermitRootLogin prohibit-password
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitEmptyPasswords no
X11Forwarding no
MaxAuthTries 3
LoginGraceTime 30
EOF
chmod 644 /etc/ssh/sshd_config.d/01-endurecido.conf

# ------------------------------------------------------------- 2. respaldos ---
paso "Usuario respaldos: SFTP, encerrado, sólo lectura"
getent group respaldos >/dev/null || groupadd --system respaldos
if ! id respaldos >/dev/null 2>&1; then
  useradd --system --gid respaldos --no-create-home --home-dir /nonexistent \
    --shell /usr/sbin/nologin respaldos
fi
# '*' y no '!': sin contraseña, pero no "bloqueado" (sshd rechaza las llaves
# de una cuenta bloqueada cuando no usa PAM).
usermod -p '*' respaldos

# La jaula tiene que ser de root hasta arriba (lo exige ChrootDirectory). Los
# respaldos se ven adentro montados de sólo lectura.
mkdir -p "$JAULA/rootlab"
chown root:root "$JAULA" "$JAULA/rootlab"
chmod 755 "$JAULA"
# La carpeta de verdad: el grupo respaldos puede listar y leer SÓLO los .enc
# (setgid: lo nuevo nace con ese grupo). instalar.sh y respaldar.mjs cuidan
# que las copias sin cifrar queden 600.
chgrp respaldos "$DATOS/respaldos"
chmod 2750 "$DATOS/respaldos"
find "$DATOS/respaldos" -type f -name '*.db.enc' -exec chgrp respaldos {} + -exec chmod 640 {} +
find "$DATOS/respaldos" -type f ! -name '*.db.enc' -exec chmod 600 {} +

if ! grep -qE "[[:space:]]$JAULA/rootlab[[:space:]]" /etc/fstab; then
  echo "$DATOS/respaldos $JAULA/rootlab none bind,ro 0 0" >> /etc/fstab
fi
if ! mountpoint -q "$JAULA/rootlab"; then
  mount --bind "$DATOS/respaldos" "$JAULA/rootlab"
  mount -o remount,bind,ro "$JAULA/rootlab"
fi

touch /etc/ssh/claves-respaldos
chown root:root /etc/ssh/claves-respaldos
chmod 644 /etc/ssh/claves-respaldos

# El bloque Match va al FINAL de sshd_config: un Match dura hasta el próximo
# Match o el fin del archivo, y puesto en un archivo incluido arriba se
# llevaría puesto todo lo que viene después.
if ! grep -q '^Match User respaldos' /etc/ssh/sshd_config; then
  cat >> /etc/ssh/sshd_config <<EOF

# endurecer-vps.sh (root-lab): quien baja los respaldos cifrados.
Match User respaldos
	AuthorizedKeysFile /etc/ssh/claves-respaldos
	ChrootDirectory $JAULA
	ForceCommand internal-sftp -R
	PermitTTY no
	AllowTcpForwarding no
	AllowAgentForwarding no
	X11Forwarding no
	PermitTunnel no
EOF
fi

sshd -t
systemctl reload ssh
echo "sshd: $(sshd -T | grep -E '^(permitrootlogin|passwordauthentication) ' | tr '\n' ' ')"

# ------------------------------------------------------------------ 3. Node ---
paso "El Node propio, de root"
if [ -d /opt/root-lab-node ]; then
  chown -R root:root /opt/root-lab-node
  echo "archivos que no son de root: $(find /opt/root-lab-node ! -user root | wc -l)"
fi

# ----------------------------------------------------------------- 4. Caddy ---
paso "Caddy: la administración por un socket propio"
CADDYFILE=/etc/caddy/Caddyfile
if [ -f "$CADDYFILE" ] && ! grep -q 'admin unix//' "$CADDYFILE"; then
  mkdir -p /root/respaldos
  cp "$CADDYFILE" "/root/respaldos/Caddyfile.$(date +%Y%m%d-%H%M%S)"
  {
    echo '# Opciones globales (endurecer-vps.sh): la API de administración, por un'
    echo '# socket en la carpeta de Caddy (750 caddy) y no en 127.0.0.1:2019.'
    echo '{'
    echo '	admin unix//var/lib/caddy/admin.sock'
    echo '}'
    echo
    cat "$CADDYFILE"
  } > "$CADDYFILE.nuevo"
  caddy validate --config "$CADDYFILE.nuevo" --adapter caddyfile >/dev/null
  mv "$CADDYFILE.nuevo" "$CADDYFILE"
  # Cambiar la dirección de la administración pide reiniciar, no recargar:
  # la recarga le habla a la dirección nueva, que todavía no existe.
  systemctl restart caddy
  sleep 2
fi
systemctl is-active caddy
if ss -tln | grep -q '127.0.0.1:2019'; then echo "OJO: la 2019 sigue abierta"; else echo "2019 cerrada"; fi

# ------------------------------------------------------ 5. reinicios solos ---
paso "Reinicio automático cuando un parche lo pide"
cat > /etc/apt/apt.conf.d/52root-lab-reinicio <<'EOF'
// endurecer-vps.sh (root-lab): un núcleo parchado que no se carga no protege.
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-WithUsers "true";
Unattended-Upgrade::Automatic-Reboot-Time "05:10";
EOF
if [ -f /var/run/reboot-required ]; then
  echo "hay un reinicio pendiente: se hace solo a las 05:10 UTC, o ya con: systemctl reboot"
else
  echo "sin reinicio pendiente"
fi

paso "Listo"
