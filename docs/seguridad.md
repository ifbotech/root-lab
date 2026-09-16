# Seguridad

Qué protege ROOTLAB, de qué, y qué queda por hacer. Las pruebas de todo esto
están en `test/seguridad.test.mjs`, `test/db.test.mjs`,
`test/recuperar.test.mjs`, `test/http.test.mjs` y en
`tools/verificar-despliegue.mjs`, que las repite contra producción.

## Datos personales, cifrados en la base

| Dato | Cómo se guarda | Por qué así |
|---|---|---|
| Email | AES-256-GCM + **índice ciego** (HMAC-SHA256) | Cifrado para que una base robada no sirva; el índice permite encontrar la cuenta al entrar sin guardar el email en claro. Un hash sin clave se revierte probando listas de emails; el HMAC, sin la clave, no. |
| Nombre | AES-256-GCM | Es un dato personal. |
| Charlas con las plantas | AES-256-GCM | Lo que alguien le cuenta a su planta es suyo. |
| Contraseña | **Argon2id** + **pimienta** | Nunca se cifra: se deriva. Ver abajo. |
| Sesión, enlaces de email | SHA-256 del token | Con la base sola no se puede usar ninguno. |
| Lecturas de sensores, plantas | en claro | No identifican a nadie y hacen falta para consultar. |

Todo el cifrado y descifrado pasa en `server/db.mjs`: quien llama a la base
pasa y recibe emails normales, así que es imposible olvidarse de cifrar en una
ruta nueva. `test/db.test.mjs` abre el archivo de la base y comprueba que no
aparece ningún email, nombre ni mensaje.

GCM detecta cualquier modificación: un byte cambiado en un dato cifrado hace
fallar la lectura en vez de devolver basura.

## La clave maestra

`ROOTLAB_SECRETO`: 32 bytes al azar, en base64. De ella se derivan con HKDF
tres claves independientes (cifrado, índice, pimienta), así que comprometer un
uso no compromete otro.

- **Dónde vive**: en `/etc/root-lab.env` (permisos 640, grupo `rootlab`),
  **fuera** de la base y de los respaldos. Un respaldo solo no expone a nadie.
- **Quién la crea**: `deploy/instalar.sh`, la primera vez, si no existe. No la
  imprime (no tiene que quedar en logs).
- **Guardá una copia fuera del servidor**, en un gestor de contraseñas:
  ```bash
  sudo grep ROOTLAB_SECRETO /etc/root-lab.env
  ```
  **Si se pierde, los emails y las contraseñas no se recuperan**: las
  cuentas quedarían inutilizables. Si el VPS se pierde, restaurar necesita el
  respaldo **y** esta clave.
- **No se cambia a mano.** Rotarla es re-cifrar la base con la clave nueva
  (está en el roadmap: `tools/rotar-secreto.mjs`). Los datos cifrados llevan
  un prefijo de versión (`v1.`) para poder convivir durante la rotación.
- En desarrollo, sin la variable, se crea `data/secreto.key` y se avisa.

## Contraseñas

- **Argon2id** (recomendación de OWASP), 19 MiB, 2 pasadas, 1 hilo: unos
  50 ms por intento en el VPS. Necesita Node 24.7+ (`crypto.argon2`).
- **Pimienta**: antes de Argon2id la contraseña pasa por un HMAC con una clave
  que no está en la base. Quien se lleve la base no puede ni empezar a probar
  contraseñas.
- **Parámetros en el hash**: `argon2id$p1$m=19456,t=2,p=1$<sal>$<hash>`. Si
  un día se suben, los hashes viejos siguen andando y se rehacen solos al
  entrar. Así se migraron los de scrypt de la versión anterior.
- Mínimo 8 caracteres, máximo 200. Sin reglas de composición (NIST 800-63B:
  largo, no símbolos obligatorios).
- **Mismo tiempo exista o no el email**: si no existe, se verifica contra un
  hash inventado. La respuesta no dice qué emails tienen cuenta.

## Sesiones y enlaces por email

| | Vida | Un solo uso | Al usarse |
|---|---|---|---|
| Sesión | 180 días sin uso | — | — |
| Restablecer contraseña | 30 minutos | sí | cierra **todas** las sesiones, avisa por email, abre una nueva |
| Verificar email | 48 horas | sí | marca el email como verificado |

- El token viaja en el **fragmento** de la URL (`#clave/<token>`), que los
  navegadores no mandan al servidor ni en el Referer: no queda en logs de
  Caddy ni de nadie.
- Pedir un enlace nuevo anula el anterior.
- Cambiar la contraseña cierra las sesiones de los otros teléfonos y avisa
  por email ("si no fuiste vos...").
- "Olvidé mi contraseña" responde `202` exista o no la cuenta, y el email se
  manda en segundo plano: ni la respuesta ni el tiempo dicen si el email está
  registrado.

## Límites contra abuso

| | Límite |
|---|---|
| Crear cuenta | 10 por hora por IP |
| Entrar | 30 cada 15 min por IP, 10 por email |
| Olvidé mi contraseña | 10 por hora por IP, 3 por email |
| Restablecer / verificar | 30 cada 15 min por IP |
| Reenviar verificación | 3 por hora por cuenta |
| Cambiar contraseña / borrar cuenta | 10 y 5 cada 15 min por cuenta |
| Adivinar códigos de vínculo | 90 por minuto por IP (40 bits) |
| IA | ver [ia.md](ia.md): cuotas diarias por plan y tope de gasto global |

## La app en el navegador

`server/http.mjs` pone en **todas** las respuestas:

| Cabecera | Valor | Para qué |
|---|---|---|
| `Content-Security-Policy` | `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'` | Ningún script que no sea de la app. `wasm-unsafe-eval` es lo mínimo para el renderer de caras (no habilita `eval`). Estilos en línea sí: las vistas pintan colores de Rooties en atributos `style`, que no ejecutan código. |
| `X-Frame-Options` | `DENY` | Nadie puede meter la app en un iframe (clickjacking). |
| `Referrer-Policy` | `no-referrer` | |
| `X-Content-Type-Options` | `nosniff` | |
| `Cross-Origin-Opener-Policy` / `-Resource-Policy` | `same-origin` | Aislamiento de otras pestañas y sitios. |
| `Permissions-Policy` | cámara sólo para la app; micrófono, ubicación, pagos, USB: no | |
| `Strict-Transport-Security` | la pone Caddy | HTTPS siempre, también la próxima vez. |

**Nada de terceros**: la fuente Nunito se sirve desde la app
(`public/fuentes`, licencia OFL), igual que íconos, módulos y el WASM. Ningún
pedido sale a Google ni a un CDN: ni rastreo, ni dependencia de que estén
arriba. `test/http.test.mjs` falla si aparece una URL externa.

Todo lo que viene del usuario (nombres, mensajes, errores) entra al DOM como
texto (`h()` en `public/lib/ui.mjs` escapa siempre) y a los emails escapado.

La API no usa cookies: la sesión va en `Authorization: Bearer`, así que no hay
CSRF posible.

## El servidor

- **Usuario propio sin privilegios** (`rootlab`), Node propio en
  `/opt/root-lab-node`.
- **systemd encerrado**: sistema de archivos de sólo lectura salvo
  `/var/lib/root-lab`, sin `/home`, sin dispositivos, sin capacidades del
  kernel, sin nuevos privilegios, familias de red limitadas, `umask 077`.
  `systemd-analyze security root-lab` da el puntaje.
- **Escucha sólo en 127.0.0.1**; al mundo sale por Caddy con HTTPS.
- **Emails**: STARTTLS obligatorio con TLS 1.2+ hacia el relay; los logs
  muestran el destino enmascarado (`a***@gmail.com`).
- **Respaldos** diarios con permisos 640, sin la clave maestra.

## El Rooti

- Se autentica con un token derivado de un secreto de fábrica (HMAC); la nube
  guarda sólo su hash.
- Habla por HTTPS **verificando el certificado** contra las raíces de Let's
  Encrypt y ZeroSSL (`root-kit/firmware/esp32/certificados.h`): nadie en el
  camino puede hacerse pasar por la nube.
- Confianza al primer uso (`ROOTLAB_TOFU=1`) mientras no haya estación de
  fábrica: cualquiera que invente un aparato puede registrarlo. El tope de
  gasto de la IA acota el daño; `ROOTLAB_TOFU=0` lo cierra (roadmap, fase 3).

## Pendiente

- Rotación de la clave maestra (`tools/rotar-secreto.mjs`).
- Respaldos fuera del VPS (snapshots del proveedor o un bucket cifrado).
- Registro de fábrica y `ROOTLAB_TOFU=0`.
- Segundo factor opcional (passkeys) para las cuentas.
- Cambiar el email de una cuenta (con verificación del nuevo).
- Auditoría externa antes de vender.
