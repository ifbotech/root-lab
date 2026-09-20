#!/bin/bash
# Deja la sesión lista para correr `npm test`.
#
# Por qué existe: el proyecto pide Node 24.7 o más —usa `argon2` de
# `node:crypto`, que antes no está— y la imagen de las sesiones trae una
# anterior. Con la vieja fallan quince pruebas solas, sin que nadie haya
# tocado nada. Eso es caro para los agentes del vivero, que corren sin nadie
# mirando: el que ve ese rojo pierde la vuelta persiguiendo un fantasma, y el
# jardinero, que no puede distinguir su error del ruido, se abstiene de
# plantar (agentes/jardinero.md).
#
# Tres caminos para llegar a la 24, en orden de menos a más costoso:
#   1. El binario que la imagen YA trae instalado, en el árbol de versiones de
#      nvm. No baja nada y no necesita red: sólo se pone adelante en el PATH.
#      Es el que funciona en la práctica.
#   2. `nvm`, que no vive donde uno esperaría —el script está en /opt/nvm y el
#      árbol de versiones en ~/.nvm— y además es una función de shell, así que
#      `command -v nvm` no lo ve hasta cargarlo. Baja de nodejs.org.
#   3. Si nodejs.org no está en la lista de red del entorno, el paquete `node`
#      del registro de npm, que trae el mismo binario oficial y baja de
#      registry.npmjs.org, que el entorno ya deja salir para `npm install`.
#
# Lo registra .claude/settings.json (SessionStart). En una máquina propia no
# hace nada: manda lo que tenga puesto su dueño.
set -uo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

# La raíz de root-lab es la de este script, sea cual sea la carpeta en la que
# arrancó la sesión (las rutinas clonan root-lab y root-kit juntos).
cd "$(dirname "$0")/../.." || exit 0

MINIMO=24
MINIMO_MENOR=7
# La puerta mira mayor Y menor: el proyecto pide 24.7, y una 24.0 pasaría un
# `-ge 24` dejando las quince fallas intactas y el aviso apagado.
alcanza() {
  local v may men
  v=$(node -v 2>/dev/null) || return 1
  v=${v#v}; may=${v%%.*}; men=${v#*.}; men=${men%%.*}
  case "$may$men" in *[!0-9]*|'') return 1 ;; esac
  [ "$may" -gt "$MINIMO" ] && return 0
  [ "$may" -eq "$MINIMO" ] && [ "$men" -ge "$MINIMO_MENOR" ]
}

# 1. el binario que ya está en la imagen
if ! alcanza; then
  ORIGINAL="$PATH"
  for bin in "$HOME"/.nvm/versions/node/v*/bin /opt/nvm/versions/node/v*/bin \
             /usr/local/nvm/versions/node/v*/bin /opt/node2[4-9]/bin; do
    [ -x "$bin/node" ] || continue
    PATH="$bin:$ORIGINAL"; export PATH
    alcanza && break
    PATH="$ORIGINAL"; export PATH
  done
fi

# 2. nvm
if ! alcanza; then
  for dir in "${NVM_DIR:-}" /opt/nvm "$HOME/.nvm" /usr/local/nvm; do
    [ -n "$dir" ] && [ -s "$dir/nvm.sh" ] || continue
    [ -n "${NVM_DIR:-}" ] || export NVM_DIR="$dir"
    # shellcheck disable=SC1091
    . "$dir/nvm.sh" >/dev/null 2>&1
    break
  done
  if command -v nvm >/dev/null 2>&1; then
    nvm install "$MINIMO" >/dev/null 2>&1 && nvm use "$MINIMO" >/dev/null 2>&1
  fi
fi

# 3. el registro de npm
if ! alcanza && command -v npm >/dev/null 2>&1; then
  PREFIJO="$HOME/.node$MINIMO"
  if npm install --prefix "$PREFIJO" --no-save --no-audit --no-fund "node@$MINIMO" >/dev/null 2>&1; then
    export PATH="$PREFIJO/node_modules/.bin:$PATH"
  fi
fi

if alcanza; then
  # Que la versión sobreviva al hook: sin esto la sesión vuelve a la vieja.
  # SessionStart se dispara también al reanudar y al compactar, así que la
  # línea se agrega sólo si no está: si no, el PATH crece en cada evento.
  LINEA="export PATH=\"$(dirname "$(command -v node)"):\$PATH\""
  if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
    grep -qxF "$LINEA" "$CLAUDE_ENV_FILE" 2>/dev/null || echo "$LINEA" >> "$CLAUDE_ENV_FILE"
    echo "Node $(node -v)."
  else
    echo "Node $(node -v), pero sin CLAUDE_ENV_FILE no sobrevive a este hook." >&2
  fi
else
  # No es motivo para abortar el arranque: las pruebas son de quien las corre,
  # y los cinco agentes que sólo miran no las necesitan para proponer.
  echo "AVISO: quedó Node $(node -v 2>/dev/null || echo ninguno), y el proyecto pide ${MINIMO}.7 o más." >&2
  echo "AVISO: 'npm test' va a dar quince fallas que no son del código. No las persigas." >&2
fi

# `install` y no `ci`: el contenedor se cachea después del hook, así que la
# próxima sesión arranca con esto ya hecho. Sin scripts de instalación: las
# dos dependencias no los necesitan, y una sesión que corre sola no tiene por
# qué ejecutar lo que traiga un paquete al instalarse.
npm install --no-audit --no-fund --ignore-scripts >/dev/null 2>&1 \
  || echo "AVISO: npm install no terminó; 'npm test' puede fallar por dependencias." >&2
exit 0
