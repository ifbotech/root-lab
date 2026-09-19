# Seguridad

Qué protege ROOTLAB, de qué, y qué queda por hacer. Las pruebas de todo esto
están en `test/seguridad.test.mjs`, `test/db.test.mjs`,
`test/recuperar.test.mjs`, `test/http.test.mjs`, `test/auditoria.test.mjs`,
`test/caja-fuerte.test.mjs`, `test/firma-cifrada.test.mjs` y en
`tools/verificar-despliegue.mjs`, que las repite contra producción.

Lo que encontró la última auditoría completa, y qué se hizo con cada cosa,
está al final: [La auditoría de septiembre de 2026](#la-auditoría-de-septiembre-de-2026).


## La trastienda ve los emails

El panel de administración (`/admin`, [trastienda.md](trastienda.md)) tiene una
pantalla —y sólo una— que muestra las direcciones de las cuentas, con su
nombre, cuándo se registraron y cuántas plantas tienen. Está para poder
escribirles: avisar de una actualización de firmware, u ofrecer servicio
técnico cuando un aparato deja de hablar.

Lo que **no** se ve desde ningún lado del panel: las charlas con las plantas,
las fotos, los nombres de las plantas y la ciudad de cada cuenta. Eso sigue
cifrado y no lo descifra ninguna pantalla de administración.

Quién puede abrir esa pantalla: los emails de `ROOTLAB_ADMINS` y las cuentas a
las que se les haya dado el rol, entrando con un código de seis dígitos que
llega por correo (vence en diez minutos, sirve una vez, aguanta cinco intentos
y del código se guarda sólo el hash). Y quien tenga la clave del servidor.

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

- **Dónde vive**: en `/etc/root-lab.env` (permisos 600, lo lee systemd como
  root y se lo pasa al servicio), **fuera** de la base y de los respaldos. Un
  respaldo solo no expone a nadie.
- **Quién la crea**: `deploy/instalar.sh`, la primera vez, si no existe. No la
  imprime (no tiene que quedar en logs).
- **Tiene que haber una copia fuera del servidor.** No a mano: en la caja
  fuerte (abajo). **Si se pierde, los emails y las contraseñas no se
  recuperan**: las cuentas quedarían inutilizables. Si el VPS se pierde,
  restaurar necesita el respaldo **y** esta clave.
- **No se cambia a mano.** Rotarla es re-cifrar la base con la clave nueva
  (está en el roadmap: `tools/rotar-secreto.mjs`). Los datos cifrados llevan
  un prefijo de versión (`v1.`) para poder convivir durante la rotación.
- En desarrollo, sin la variable, se crea `data/secreto.key` y se avisa.

## Dónde vive cada secreto

| Secreto | Dónde | Permisos | ¿Hay copia afuera? |
|---|---|---|---|
| `ROOTLAB_SECRETO` (maestra) | `/etc/root-lab.env` | 600 root | **en la caja fuerte** |
| `ROOTLAB_RESPALDO_CLAVE` | `/etc/root-lab.env` | 600 root | **en la caja fuerte** |
| `ROOTLAB_ADMIN_CLAVE` | `/etc/root-lab.env` | 600 root | en la caja fuerte |
| `ROOTLAB_SMTP_CLAVE` | `/etc/root-lab.env` | 600 root | en la caja fuerte |
| `ANTHROPIC_API_KEY` | `/etc/root-lab.env` | 600 root | en la caja fuerte (y se puede volver a emitir) |
| VAPID (avisos push) | `/var/lib/root-lab/vapid.json` | 600 `rootlab` | en la caja fuerte |
| Tokens de los agentes | `/root/vivero-tokens.txt` y cada rutina | 600 root | no hace falta: se revocan y se emiten de nuevo |
| **Clave privada del firmware** | **sólo en la computadora de quien firma** (`~/.rootkit/firmware.key`), para cifrar con frase (`cifrar-clave`, ver Pendiente) | — | gestor de contraseñas + pendrive; **nunca en el servidor ni en GitHub**, ver abajo |
| Llave SSH de root | la computadora de casa (`~/.ssh/rootkit_vps`) | — | se puede volver a emitir desde la consola del proveedor |
| Llave de los respaldos | la computadora de casa (`~/.ssh/rootlab_respaldos`) | — | sólo baja archivos cifrados; se reemplaza en un minuto |
| Secretos en GitHub | **ninguno** | — | el CI falla si un flujo usa `secrets.` |

El disco del VPS **no** está cifrado en reposo (no hay LUKS, y en un VPS no
sirve de mucho: la clave tendría que estar en el mismo lugar para arrancar
solo). Lo que protege de verdad es que lo personal ya está cifrado *dentro* de
la base, con una clave que no está en la base.

## La caja fuerte

Las dos claves que hacen falta para abrir un respaldo vivían **sólo en el
servidor**. Si el VPS desaparecía, quedaban los respaldos y ninguna forma de
leerlos: un respaldo que no se puede restaurar no es un respaldo.

`tools/caja-fuerte.mjs` saca esas claves del servidor a un archivo `.rkc`
cifrado con una frase que elegís vos y que no está en ninguna máquina:

```bash
sudo /opt/root-lab-node/bin/node /opt/root-lab/tools/caja-fuerte.mjs \
  sellar --salida /root/caja-fuerte.rkc          # pide la frase por teclado
node tools/caja-fuerte.mjs listar caja-fuerte.rkc   # qué hay, sin los valores
node tools/caja-fuerte.mjs abrir  caja-fuerte.rkc --clave ROOTLAB_SECRETO
```

Mismo formato que los respaldos (AES-256-GCM, clave derivada con scrypt
N=2¹⁵), así que se puede dejar al lado de ellos sin pensarlo. La frase se pide
dos veces y no se ve al escribirla; **no hay forma de recuperarla**.

`test/caja-fuerte.test.mjs` prueba el camino entero del día malo: con un
`.db.enc` y la caja, y nada más, se vuelve a abrir una base y las cuentas
salen enteras.

Se vuelve a sellar cuando cambia alguna clave. No pasa seguido, pero cuando
pase, la caja vieja abre los respaldos viejos y no los nuevos.

## La clave del firmware: ni en el servidor ni en GitHub

`firmware.key` (ECDSA P-256) es la única cosa del proyecto que está **sólo**
en la computadora de quien firma, y es a propósito: es lo que hace que tomar
el servidor no alcance para instalarle algo a una maceta. El servidor tiene la
**pública** y nada más.

**Tampoco va a GitHub.** Hubo un flujo (`publicar-firmware.yml`, que nunca se
corrió) que la esperaba como secreto del repositorio para firmar en un
runner. Se sacó: en ese runner corren `pip install platformio`, las
toolchains que baja PlatformIO, las pruebas del repo y un clon de root-lab
sin fijar, y cualquiera de esas cosas comprometida se llevaba la clave de
todos los aparatos. Además recibía la dirección de la nube como parámetro, y
con ella la clave de administración. Hoy el CI compila y deja el binario con
su SHA-256; se firma y se publica desde la computadora
([operacion.md](operacion.md), "Actualizaciones por aire"). El CI falla si
algún flujo vuelve a usar un secreto.

**Y en la computadora, cifrada.** Estaba como un PEM en claro: cualquier
programa que corriera con ese usuario podía llevársela. Ahora:

```bash
node tools/publicar-firmware.mjs cifrar-clave ~/.rootkit/firmware.key --publica deploy/firmware-publica.pem
```

La cifra con una frase (PKCS#8 estándar, AES-256: la abre también openssl),
después de comprobar que es el par de la pública que llevan los aparatos y
que cifrada firma igual. Desde ahí `firmar` y `publicar` piden la frase.

Subirla al VPS "para no perderla" cambiaría un riesgo chico por el peor de
todos: quien entre al servidor podría firmar un firmware y mandárselo a todos
los aparatos vendidos, y cada aparato lo instalaría porque la firma sería
válida. Tampoco va en la caja fuerte, y hay una prueba que lo vigila
(`test/caja-fuerte.test.mjs`).

Lo que sí hay que hacer con ella —perderla obliga a cambiar la pública
compilada en cada placa, o sea a no poder actualizar las que ya se vendieron—
es tener **dos copias que no estén en el mismo lugar**:

1. Una entrada en el gestor de contraseñas, con el PEM pegado como nota
   segura **antes** de cifrarlo, y la frase en otra entrada.
2. Un pendrive guardado en otro lado con el archivo ya cifrado (sin la frase
   no sirve), o el PEM impreso en papel (son unas pocas líneas).

Si algún día firma más de una persona, lo que corresponde no es copiar el
archivo: es una sub-CA o un token de hardware.

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
| Pedir código de la trastienda | 10 cada 10 min por IP, 5 por email |
| Usar un código de la trastienda | 10 cada 10 min por IP, 5 por código, **20 equivocados por email por día** |
| Rutas de administración | 240 por minuto por IP; 10 claves malas cada 10 min bloquean la IP |
| IA | ver [ia.md](ia.md): cuotas diarias por plan y tope de gasto global |

**De qué IP viene un pedido.** Detrás de Caddy todo llega desde 127.0.0.1, así
que la IP real sale de `X-Forwarded-For`. Ese encabezado lo puede escribir
cualquiera: `server/http.mjs` sólo le cree cuando el pedido llega desde la
misma máquina (donde está el proxy), y toma el **último** valor, el que agregó
el proxy. Antes tomaba el primero, que manda el cliente: cambiarlo en cada
pedido esquivaba todos los límites de esta tabla.

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
texto y a los emails escapado. `h()` (`public/lib/ui.mjs`) arma nodos y **no
tiene** forma de escribir `innerHTML`: la tenía, sin usar, y era una trampa
para el primero que la necesitara. `test/auditoria.test.mjs` falla si
`public/` o `admin/` escriben HTML crudo (`innerHTML`, `insertAdjacentHTML`,
`document.write`, `eval`).

La trastienda y la API llevan `X-Robots-Tag: noindex, nofollow`: no tienen nada
que hacer en un buscador.

La API no usa cookies: la sesión va en `Authorization: Bearer`, así que no hay
CSRF posible.

## El servidor

La app corre en un VPS que comparte con ifbotech.com (el hub, en Docker). Lo
que es de la máquina lo deja `deploy/endurecer-vps.sh`; lo que es de la app,
`deploy/instalar.sh`. Los dos se pueden volver a correr cuando se quiera.

- **SSH sólo con llave.** Root entraba con contraseña desde cualquier IP, y
  los repositorios —públicos— dicen cuál es el servidor. Ahora
  `PermitRootLogin prohibit-password`, `PasswordAuthentication no`,
  `MaxAuthTries 3`, sin X11. La consola de emergencia del proveedor (VNC)
  sigue entrando con la contraseña de root si alguna vez se pierde la llave.
  Sin contraseña que adivinar, fail2ban y el límite de conexiones del
  firewall no suman: no se instalaron.
- **Firewall**: entra 22, 80 y 443; todo lo demás, no. ROOTLAB (8090), el hub
  (3000) y la administración de Caddy escuchan sólo adentro.
- **La administración de Caddy, por un socket** en `/var/lib/caddy` (750
  caddy), y no en `127.0.0.1:2019`, donde cualquier proceso de la máquina
  —ROOTLAB incluido, si alguien lo tomara— podía reconfigurar el proxy de
  todo ifbotech.com. Probado: `rootlab` no llega ni a uno ni a otro.
- **Parches**: `unattended-upgrades` instala los de seguridad y, si piden
  reiniciar, reinicia a las 05:10 UTC, después del respaldo. El núcleo había
  quedado desde marzo sin cargar los parches que ya estaban instalados.
- **Usuario propio sin privilegios** (`rootlab`), Node propio en
  `/opt/root-lab-node`, **de root** (venía del tar con el uid 1001, que no era
  de nadie: el primer usuario con ese número podía cambiar el programa que
  corre ROOTLAB y que el instalador corre como root) y **al día**: el
  instalador baja cada versión nueva de la v24, no sólo la primera.
- **systemd encerrado**, el servicio y los dos de respaldo: sistema de
  archivos de sólo lectura salvo `/var/lib/root-lab`, sin `/home`, sin
  dispositivos, sin capacidades del kernel, sin nuevos privilegios, familias
  de red limitadas, `umask 077`. `systemd-analyze security` da 2,9 en los
  tres (los de respaldo daban 5,0).
- **Escucha sólo en 127.0.0.1**; al mundo sale por Caddy con HTTPS (sólo TLS
  1.3, HTTP redirige, HSTS de un año).
- **`/etc/root-lab.env` 600 de root**: lo lee systemd antes de bajar a
  `rootlab`. Los valores con espacios van entre comillas, para que también se
  pueda cargar desde la consola.
- **Lo que el servidor le pide a otros.** Sale a Open-Meteo (dirección fija),
  a la API de Anthropic, al relay de correo y a los servicios de avisos
  push. Una suscripción push es una URL que manda el teléfono y a la que el
  servidor le hace un POST: sólo se aceptan las de FCM, Mozilla, Apple y
  Windows, por HTTPS y en el 443. Antes alcanzaba con que empezara con
  `https://`, y cualquier cuenta podía hacer que el servidor le pegara a
  `127.0.0.1:3000`, a la red del proveedor o a un tercero, y ver en la
  respuesta si había algo (SSRF).
- **`/api/salud`** desde afuera dice que está vivo, la versión y el esquema.
  Cuántas cuentas, aparatos y lecturas hay sólo lo ve quien pregunta desde el
  mismo servidor.
- **Emails**: STARTTLS obligatorio con TLS 1.2+ hacia el relay; los logs
  muestran el destino enmascarado (`a***@gmail.com`).
- **Un error inesperado** devuelve "Error interno" y queda en el log: su
  mensaje podía traer rutas del disco.
- **Respaldos** diarios: los sin cifrar, 600; los cifrados, 640 para el grupo
  que los baja (abajo).

## El Rooti

- Se autentica con un token derivado de un secreto de fábrica (HMAC); la nube
  guarda sólo su hash.
- Habla por HTTPS **verificando el certificado** contra las raíces de Let's
  Encrypt y ZeroSSL (`root-kit/firmware/esp32/certificados.h`): nadie en el
  camino puede hacerse pasar por la nube.
- **Sólo entra si lo registró la fábrica.** En producción
  (`ROOTLAB_TOFU=emulador`) una placa desconocida recibe `401`: la estación
  de fábrica registra antes el hash de su token (`tools/fabrica.py` en
  root-kit). Los únicos que se registran solos son los emuladores del
  navegador, que no son clientes: 20 nuevos por IP por día, no cuentan para
  nada y se borran a los 30 días sin uso. Un aparato o un lote se pueden
  deshabilitar.
- **Sus actualizaciones van firmadas.** Cada firmware se publica con una
  firma ECDSA P-256 hecha con una clave que **no está en el servidor**. El
  servidor verifica con la pública antes de aceptar un binario, y el aparato
  vuelve a verificar con la misma pública compilada adentro antes de
  instalar: tomar el servidor no alcanza para instalarle nada a una maceta.
  El binario se baja sólo con el token del aparato.
- **Su token sólo sale por HTTPS, y sólo a su nube.** El portal de
  configuración es una red wifi abierta, y tenía un campo "Servidor": quien
  estuviera cerca en el momento de configurarlo podía mandar el aparato —y su
  token— a otro lado, o a `http://`, donde el token viaja en claro. En el
  producto (`c3-144`) la nube es fija, el portal no ofrece el campo, lo
  guardado en la memoria se ignora, y el aparato se niega a mandar el token a
  una URL que no sea `https://` exacto (`rk_nube_url_aceptable`, en
  `root-kit/firmware/net/nube.c`, con sus pruebas). Sólo las placas de banco
  (`RK_BANCO=1`) pueden elegir servidor y usar `http://` para hablar con
  root-lab en la PC.
- **Un emulador no le gana a la fábrica.** Quien adivinara las MAC que van a
  salir de fábrica podía registrarlas antes como emuladores y vincularlas; la
  fábrica recibía `409` y esa placa quedaba afuera. Ahora lo que graba la
  fábrica manda, y la planta del emulador se suelta.

## La administración

`/api/admin/*` (fábrica, firmware, métricas, trastienda) se abre de tres
maneras, y ninguna se confunde con una cuenta común:

- **Con el código del email**: quien esté en `ROOTLAB_ADMINS` o tenga el rol
  en la base pide un código de seis dígitos, entra, y le queda una sesión de
  doce horas. Del código se guarda sólo el hash; vence a los diez minutos,
  sirve una vez y aguanta cinco intentos. Un email aguanta **veinte códigos
  equivocados por día** en total: seis dígitos son un millón de
  posibilidades, `admin@` se adivina, y sin ese techo, desde muchas IPs, se
  podían probar miles por día. Pasado el techo, ese día sólo se entra con la
  clave del servidor.
- **El rol se mira en cada pedido**, no sólo al entrar: a quien se le saca el
  rol, o se le borra la cuenta, se le corta la sesión en el acto.
- **Con la clave del servidor** (`ROOTLAB_ADMIN_CLAVE`), comparada en tiempo
  constante: es la puerta de atrás para cuando el correo no anda.
- **Con un token de agente**, que sólo sirve para las rutas de su alcance
  (`vivero` o `jardinero`) y se revoca de a uno.

Sin ninguna de las tres, las rutas no existen; diez intentos fallidos en diez
minutos bloquean la IP. Dar el rol de administrador es una acción de la
trastienda y queda registrada.

## Los respaldos que salen del servidor

Van cifrados **enteros** (AES-256-GCM, clave derivada con scrypt) con
`ROOTLAB_RESPALDO_CLAVE`, que no es la clave maestra: quien custodia los
respaldos no puede leer producción, y al revés. Una prueba mensual los
descifra y los abre.

Viven en tres lugares —el VPS, la computadora de casa y OneDrive— y los
últimos dos se los **trae** la computadora, no se los manda el servidor: el
VPS no tiene credenciales para llegar a ninguno, así que quien entre al
servidor no puede borrar las copias de afuera. Ver [operacion.md](operacion.md).

La tarea diaria no usa la llave de root. Entra como `respaldos`, un usuario
que sólo habla SFTP, encerrado (`ChrootDirectory`) en una carpeta montada de
sólo lectura donde se ven los respaldos, y que por grupo puede leer **sólo**
los cifrados. Probado desde afuera: no abre terminal, no lee un `.db`, no
escribe, no borra, no sale de su carpeta. Si esa llave se pierde, lo que se
lleva son archivos que sin la caja fuerte no se abren.

## Las métricas

Contadores por día con el nombre del evento y cuántas veces: ni cuenta, ni
planta, ni IP, ni nada de terceros. La lista de eventos es cerrada.

## La auditoría de septiembre de 2026

Una pasada completa por el servidor, la app, el firmware, GitHub y la
computadora donde viven las claves. Cada arreglo tiene su prueba o su
verificación contra producción.

| # | Qué había | Gravedad | Qué se hizo |
|---|---|---|---|
| 1 | Root entraba por SSH **con contraseña** desde cualquier IP | crítica | Sólo llave (`endurecer-vps.sh`); verificado que la contraseña se rechaza |
| 2 | Las claves para abrir un respaldo vivían sólo en el VPS | crítica | Caja fuerte, sellada y probada: una base se recupera con el `.enc` y la caja |
| 3 | La clave de firma del firmware, en claro en la computadora | alta | `cifrar-clave`: la cifra con frase; `test/firma-cifrada.test.mjs` |
| 4 | Un flujo de GitHub esperaba la clave de firma y la de administración como secretos, al lado de pip y PlatformIO, y con la nube como parámetro | alta | Flujo borrado (nunca había corrido); se firma en la computadora; el CI falla si un flujo usa secretos |
| 5 | SSRF por la URL de las suscripciones push | alta | Sólo servicios de avisos de verdad; `test/auditoria.test.mjs` |
| 6 | El aparato mandaba su token por `http://` si la nube lo era, y el portal abierto dejaba elegir la nube | alta | Producto: nube fija y sólo HTTPS; 18 comprobaciones en `test_red.c` |
| 7 | Núcleo sin reiniciar desde marzo (parches instalados, no cargados) | alta | Reiniciado (5.15.0-191) y reinicio automático a las 05:10 UTC |
| 8 | `X-Forwarded-For` del cliente esquivaba todos los límites | media | Sólo se cree al proxy local, último salto |
| 9 | El código de seis dígitos de la trastienda se podía adivinar de a poco | media | 20 equivocados por email por día |
| 10 | Sacar el rol de administración no cortaba la sesión (12 h) | media | El rol se mira en cada pedido |
| 11 | La administración de Caddy en 127.0.0.1:2019, abierta a cualquier proceso | media | Socket en la carpeta de Caddy |
| 12 | Node del servicio con dueño uid 1001, y sin parches menores | media | De root, y al día en cada despliegue |
| 13 | La tarea de respaldos de la computadora usaba la llave de root | media | Usuario `respaldos`: SFTP, encerrado, sólo lectura, sólo cifrados |
| 14 | `vapid.json` 0644 y `/etc/root-lab.env` legible por el grupo | media | 600, y el instalador lo sostiene |
| 15 | El respaldo previo a cada actualización salía sin cifrar | media | Lo dispara el servicio, que tiene la clave |
| 16 | Un emulador podía quedarse con la MAC de una placa de fábrica | baja | La fábrica manda |
| 17 | `/api/salud` contaba cuentas, aparatos y lecturas al mundo | baja | Sólo desde el mismo servidor |
| 18 | Unidades de respaldo con exposición 5,0 | baja | Endurecidas como el servicio: 2,9 |
| 19 | `h()` tenía una puerta a `innerHTML` sin usar | baja | Cerrada, y una prueba vigila `public/` y `admin/` |
| 20 | Errores inesperados devolvían su mensaje; la trastienda se podía indexar | baja | "Error interno" y `noindex` |
| 21 | `.gitignore` no cubría claves, cajas ni respaldos, en repos públicos | baja | Cubiertos en los dos |

Lo que se revisó y estaba bien: la historia de git de los dos repositorios
(ningún secreto, sólo la clave pública), las dependencias (`npm audit`: cero),
las cabeceras y el TLS de producción, la escritura de SQL (todo con
parámetros), los emails (todo escapado), la IA (sin herramientas, con tope de
gasto), los logs (sin secretos), el historial de la consola de root (sin
claves en la línea de comandos).

### Lo que se acepta, y por qué

- **Crear cuenta dice si el email ya existe.** Es la única ruta que lo
  revela (entrar y "olvidé" no). Cerrarlo obliga a que el alta sea "te
  mandamos un email", que cambia el flujo de la app; con 10 altas por hora por
  IP no sirve para recorrer listas grandes.
- **Las fotos no se validan por su contenido**, sólo por el tipo declarado.
  Las ve únicamente su dueño, se piden con su sesión (nunca por una URL
  pública) y van con su tipo de imagen y `nosniff`: no hay forma de que una
  "foto" se ejecute en el navegador de otro.
- **Quien tiene el aparato en la mano puede leer su memoria** (el secreto y el
  wifi están en NVS sin cifrar). Afecta sólo a ese aparato, y el remedio —flash
  encryption y secure boot— quema eFuses de forma irreversible: es una decisión
  de la estación de fábrica, antes de vender (pendiente, abajo).
- **El portal de configuración es una red abierta** que muestra el código de
  vínculo. Alguien a metros, en esos minutos, podría vincular el aparato
  antes que su dueño; el dueño lo ve en la app y un reinicio largo invalida el
  vínculo. Cerrarlo del todo es un portal con clave mostrada en la pantalla:
  cambia el alta y es una decisión de producto (en el vivero).
- **El servidor puede ofrecer una versión anterior de firmware** (bien
  firmada): "volver atrás" es una función. El día que exista una versión con
  un problema de seguridad, se le pone un piso compilado en el firmware.
- **ROOTLAB y el hub comparten máquina.** Si uno de los dos cayera, el otro
  queda a un paso (el hub escucha en 127.0.0.1:3000). Separarlos es otro VPS.
- **Los repositorios son públicos.** No hay secretos en ellos y la seguridad
  no depende de que el código no se vea; sí dicen cuál es el servidor, y por
  eso importó tanto cerrar la contraseña de SSH.

## Pendiente

Lo que depende de una persona (no se puede hacer desde el código):

- **Cifrar la clave de firma** en la computadora con `cifrar-clave`, después
  de copiar el PEM al gestor de contraseñas.
- **Proteger `main` en GitHub** (los dos repos): bloquear force-push y borrado.
  Hoy cualquiera con acceso de escritura —una rutina incluida— puede
  reescribir la historia; que el jardinero no empuje a `main` lo dice su
  prompt, no una regla. Y encender *secret scanning* y *push protection*
  (gratis en repos públicos).
- **Una frase para la llave SSH de root** (`ssh-keygen -p -f ~/.ssh/rootkit_vps`)
  con el agente de Windows prendido para no tipearla a cada rato. Hoy
  quien copie ese archivo de la computadora entra al servidor.
- **Un tope de gasto en la consola de Anthropic**, por encima del que ya
  aplica la app: si la clave se filtra, el tope de la app no la protege.

Y en el código, cuando llegue su momento:

- **Antes de vender**: flash encryption y secure boot en la estación de
  fábrica, y el portal de configuración con clave.
- Rotación de la clave maestra (`tools/rotar-secreto.mjs`). Cuando exista, la
  caja fuerte hay que volver a sellarla el mismo día.
- Un cuarto lugar para los respaldos que no dependa de una sola cuenta de
  Microsoft (`ROOTLAB_RESPALDO_DESTINO` con rclone a B2, por ejemplo). Con
  tres alcanza para empezar; con clientes pagando, no.
- Segundo factor opcional (passkeys) para las cuentas.
- Cambiar el email de una cuenta (con verificación del nuevo).
- Auditoría externa antes de vender.
