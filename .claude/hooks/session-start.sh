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
# Dos caminos para llegar a la 24, en orden:
#   1. `nvm`, que está en la imagen pero es una función de shell: `command -v
#      nvm` no la encuentra hasta cargarla. Baja de nodejs.org.
#   2. Si nodejs.org no está en la lista de red del entorno, el paquete `node`
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
mayor() { node -v 2>/dev/null | sed -n 's/^v\([0-9]\{1,\}\)\..*/\1/p'; }
alcanza() { local v; v=$(mayor); [ -n "$v" ] && [ "$v" -ge "$MINIMO" ]; }

# 1. nvm
if ! alcanza; then
  for dir in "${NVM_DIR:-}" "$HOME/.nvm" /root/.nvm /usr/local/nvm; do
    [ -n "$dir" ] && [ -s "$dir/nvm.sh" ] || continue
    export NVM_DIR="$dir"
    # shellcheck disable=SC1091
    . "$dir/nvm.sh"
    break
  done
  if command -v nvm >/dev/null 2>&1; then
    nvm install "$MINIMO" >/dev/null 2>&1 && nvm use "$MINIMO" >/dev/null 2>&1
  fi
fi

# 2. el registro de npm
if ! alcanza && command -v npm >/dev/null 2>&1; then
  PREFIJO="$HOME/.node$MINIMO"
  if npm install --prefix "$PREFIJO" --no-save --no-audit --no-fund "node@$MINIMO" >/dev/null 2>&1; then
    export PATH="$PREFIJO/node_modules/.bin:$PATH"
  fi
fi

if alcanza; then
  echo "Node $(node -v)."
  # Que la versión sobreviva al hook: sin esto la sesión vuelve a la vieja.
  if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
    echo "export PATH=\"$(dirname "$(command -v node)"):\$PATH\"" >> "$CLAUDE_ENV_FILE"
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
