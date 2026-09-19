# La trastienda

El panel de quien hace el producto, en `/rootkit/admin`. No es una pantalla de
cliente: es la herramienta para saber si lo que estamos vendiendo funciona, si
lo usan, y qué habría que mejorar.

Contesta cinco preguntas:

| Pantalla | Qué contesta |
|---|---|
| **Resumen** | ¿Cuántos ROOTKIT hay en la calle, cuántos siguen hablando y están midiendo bien? |
| **La flota** | Aparato por aparato: lote, firmware, batería, wifi, lecturas, cuándo habló |
| **Firmware** | Qué se firmó y publicó, y quién corre qué |
| **Uso** | Dónde se cae el alta y qué pantallas de la app se usan |
| **Cuentas** | Quiénes se registraron, quién administra, y los tokens de los agentes |
| **El vivero** | Todo lo que habría que mejorar, ordenado por lo que rinde |

## Cómo se entra

**Con tu email.** Ponés la dirección, te llega un código de seis dígitos y con
eso entrás. El servidor devuelve un **token de doce horas** que vive sólo en
esa pestaña del navegador (`sessionStorage`).

Quién puede pedir un código:

- los emails de `ROOTLAB_ADMINS` (en `/etc/root-lab.env`), que son el arranque
  y la red de seguridad: a esos **no** se les puede sacar el rol desde el
  panel, así que la trastienda nunca queda sin nadie adentro;
- cualquier cuenta a la que se le haya dado el rol de administración desde
  **Cuentas**.

Lo que cuida esa puerta:

- Pedir un código contesta **lo mismo** exista o no ese email y sea o no de
  administración: si contestara distinto, esta ruta sería una forma de
  averiguar quién administra el servidor.
- El código vence a los **diez minutos**, sirve **una sola vez** y aguanta
  **cinco intentos**; al sexto se quema y hay que pedir otro.
- El rol se mira **al entrar** y **en cada pedido**: si se lo sacaron entre
  que pidió el código y lo usó, no entra; si se lo sacan con la sesión
  abierta, la pierde en el pedido siguiente.
- Diez pedidos de código por IP cada diez minutos, y cinco por email.
- Un email aguanta **veinte códigos equivocados por día**. Seis dígitos son un
  millón de posibilidades y `admin@` se adivina: sin ese techo, desde muchas
  IPs, se probaban miles por día. Pasado el techo, ese día se entra sólo con
  la clave del servidor.
- Del código se guarda el **hash**, nunca el código.

**Con la clave del servidor** (`ROOTLAB_ADMIN_CLAVE`) sigue entrando quien la
tenga: es la salida de emergencia para cuando el correo no anda, y es como
entran las herramientas (`tools/fabrica.py`, `publicar-firmware.mjs`).

Sin `ROOTLAB_ADMIN_CLAVE` configurada, las rutas de administración **no
existen** (404, igual que cualquier ruta inventada) y la trastienda no se puede
abrir. La página lleva `noindex` y no registra el service worker de la app.

## Dónde está la línea

**Los emails se ven; lo que la gente hace con sus plantas, no.**

En **Cuentas** están las direcciones, el nombre, cuándo se registró cada uno,
si confirmó el email, cuántas plantas tiene y cuándo entró por última vez. Está
para poder escribirles: avisar de una actualización de software o de firmware,
y ofrecer servicio técnico cuando un aparato deja de hablar. Sin las
direcciones, un ROOTKIT que falla es un cliente que se queda solo.

Fuera de esa pantalla, **nada de ninguna cuenta**: ni en el resumen, ni en la
flota, ni en las lecturas, ni en el uso. Ahí todo es del aparato —que es
nuestro hasta que lo vendemos— o un agregado:

- que un aparato mida poco se ve en el conteo de lecturas, sin mirar qué midió;
- que un sensor esté roto se ve en el porcentaje de lecturas sin ese dato;
- que la app se use se ve en contadores anónimos por día, sin cuenta ni planta.

Y lo que no se ve **desde ningún lado** del panel: las charlas con las plantas,
las fotos del álbum, los nombres de las plantas, la ciudad de nadie. Eso sigue
cifrado y es de cada quien.

Esa línea es una decisión, no un olvido, y hay pruebas que la sostienen:
`test/trastienda.test.mjs` verifica que la flota no devuelva ni el email de la
cuenta, ni el nombre de la planta, ni su id, y
`test/trastienda-cuentas.test.mjs` que la lista de cuentas no traiga el hash de
la contraseña, la colección ni la ubicación.

## "Vendidos" todavía no existe

No hay pedidos ni facturas en el sistema, así que lo más cerca que estamos es:

| Número | Qué es de verdad |
|---|---|
| **salidos de fábrica** | aparatos que registró `tools/fabrica.py` (`origen: fabrica`) |
| **estrenados** | aparatos que alguien vinculó alguna vez: llegaron a una casa |
| **activos** | hablaron en los últimos 7 días |
| **callados** | vinculados que no hablan hace más de 3 días: o se quedaron sin wifi, o sin batería, o se colgaron |

Las dos últimas ventanas se pisan a propósito: un aparato que habló hace cinco
días está en las dos, y eso es lo que hay que ver.

## Los sensores

De cada ventana de lecturas sale cuántas llegaron **sin** cada medida. Un
sensor que no responde manda un hueco, no un cero, así que ese porcentaje es
directamente "cuántas veces falló el sensor". Se marca en rojo arriba del 5 %.

El capacitivo tiene además su propia señal: `crudo_extremo` cuenta las lecturas
con el valor crudo por debajo de 150 o arriba de 4000, que es un sensor
desconectado, en corto o sin sellar.

Y el ritmo: un ROOTKIT sano manda **96 lecturas por día** (una cada quince
minutos). Los que mandan menos de la mitad se cuentan aparte.

## El vivero

Es la lista de todo lo que habría que mejorar. La llenan los
[agentes](../agentes/README.md) que revisan el proyecto sin parar, cada uno en
su área, y también se puede anotar a mano desde la trastienda o con
`tools/vivero.mjs`.

**Cinco áreas**: `infraestructura`, `experiencia`, `firmware`, `producto`,
`seguridad`.

**Cada idea** tiene impacto (alto/medio/bajo), esfuerzo (bajo/medio/alto), de
dónde salió (evidencia) y quién la propuso. La lista viene ordenada por lo que
conviene mirar primero: **impacto alto y esfuerzo bajo arriba**.

**Cuatro estados**: `nueva` (sin decidir) → `en_curso` → `plantada`, o
`descartada` con su motivo.

### Una idea repetida no se duplica

Un agente que da vueltas para siempre va a volver a encontrar lo mismo, dicho
de otra manera. El servidor reconoce la idea por una **huella** del título —sin
acentos, sin signos, sin palabras de relleno, con las palabras ordenadas— y en
vez de duplicarla la cuenta: en la lista aparece "propuesta 3 veces", que es
señal y no ruido.

Ordenar las palabras tiene un precio: dos títulos con las mismas palabras en
otro orden caen juntos. Se paga barato porque **lo que trae la segunda no se
pierde**: su título, su detalle y su evidencia se le suman a la primera.

## Las cuentas

La pantalla de **Cuentas** muestra quiénes se registraron y deja hacer tres
cosas:

**Dar o sacar el rol de administración.** Quien lo tenga puede entrar a la
trastienda con un código a su email. A los de `ROOTLAB_ADMINS` no se les puede
sacar desde acá (dice "del entorno"): eso se cambia en `/etc/root-lab.env`.

**Borrar una cuenta.** Se lleva sus plantas, sus lecturas y sus charlas, y sus
Rooties quedan libres para que otro los vincule. Pide dos confirmaciones y
escribir el email: no se puede deshacer. Es lo mismo que pasa cuando alguien se
borra solo desde la app.

**Copiar las direcciones** para escribirles desde el correo, con copia oculta.

Mandar avisos masivos **desde el servidor** todavía no existe, y no es un
descuido: hace falta antes una forma de darse de baja de cada tipo de aviso, o
los correos terminan en spam y se quema la reputación del dominio con el que
salen también los emails de recuperar la contraseña. Está anotado en el vivero.

## Los tokens de los agentes

Los agentes que revisan el proyecto no usan la clave de administración: cada
uno tiene su **token**, que se crea en Cuentas → Los agentes y se muestra una
sola vez.

| Alcance | Qué puede, método por método |
|---|---|
| `vivero` | `GET` estado, flota, lecturas y métricas; `GET` y `POST` ideas; `PATCH` una idea (moverla de estado). Nada más: no borra ideas |
| `jardinero` | lo mismo, y `POST` informe: un correo a quien administra |

El permiso mira **el método además de la ruta** (`PERMISOS_AGENTE` en
`server/api.mjs`). No es un detalle: `/api/admin/aparatos` por `GET` lista,
pero por `POST` registra una placa de fábrica y por `PATCH` la deshabilita. Un
permiso que mirara sólo la ruta le daría todo eso a quien sólo tenía que leer.

Lo que un agente lee son recuentos y ritmos: la flota pasa por `aparatoAdmin`,
que deja al dueño afuera (dice si un aparato está vinculado, no a quién), y
ninguna de las cuatro rutas trae emails, nombres, plantas ni ciudades. Hay una
prueba que arma una cuenta con todo eso y comprueba que no aparece.

Un token de agente que se filtre no sirve para ver cuentas, ni aparatos uno
por uno, ni publicar firmware: lo peor que puede hacer quien lo tenga es leer
cuántos aparatos hay y cómo andan, y escribir ideas en una lista. Se revoca
desde la misma pantalla y deja de servir al instante.

Los seis del proyecto ya están creados y guardados en el VPS, en
`/root/vivero-tokens.txt` (sólo lo lee root). Para leer uno:

```bash
ssh -i ~/.ssh/rootkit_vps root@31.97.31.58   "grep '^agente-infra' /root/vivero-tokens.txt | cut -f3"
```

Cómo se los deja corriendo todos los días está en
[agentes/RUTINAS.md](../agentes/RUTINAS.md).

### Desde la terminal

```bash
export ROOTLAB_NUBE=https://ifbotech.com/rootkit
export ROOTLAB_ADMIN_CLAVE=...

node tools/vivero.mjs listar --area infraestructura
node tools/vivero.mjs proponer --area firmware \
     --titulo "Medir el consumo real en deep sleep" \
     --impacto alto --esfuerzo medio --autor agente-fw \
     --detalle "La autonomía publicada es una estimación, no una medición." \
     --evidencia "root-kit/docs/hardware.md"
node tools/vivero.mjs mover 12 --estado plantada --motivo "salió en la 0.7.0"
node tools/vivero.mjs informe --asunto "Planté una idea" --texto "Qué cambié y cómo se prueba."
```

En `ROOTLAB_ADMIN_CLAVE` va la clave del servidor **o** el token de un agente:
la herramienta no distingue, y el servidor sí.

## Las rutas

Todas piden `Authorization: Bearer <clave o token de sesión>`.

| Ruta | Qué hace |
|---|---|
| `POST /api/admin/codigo` | `{ email }` → `202` **siempre**: si ese email puede entrar, le llega un código de seis dígitos |
| `POST /api/admin/sesion` | `{ email, codigo }` o `{ clave }` → `201 { token, vence, email }` |
| `DELETE /api/admin/sesion` | cierra esta sesión |
| `GET /api/admin/yo` | con qué se está entrando: `clave`, `sesion` o `agente` |
| `GET /api/admin/cuentas` | las cuentas, con su email y su rol |
| `PATCH /api/admin/cuentas/:id` | `{ rol: "admin" \| "persona" }` |
| `DELETE /api/admin/cuentas/:id` | borra la cuenta y todo lo suyo |
| `GET /api/admin/agentes` | los tokens de agente que hay |
| `POST /api/admin/agentes` | `{ nombre, alcance? }` → `201 { token }`, que se muestra una sola vez |
| `DELETE /api/admin/agentes/:id` | revoca ese token |
| `POST /api/admin/informe` | `{ asunto, cuerpo }`: se lo manda por correo a quien administra (alcance `jardinero`) |
| `GET /api/admin/flota` | resumen, repartos por lote/versión/placa/canal/origen, y los aparatos |
| `GET /api/admin/lecturas?dias=30` | lecturas por día, salud de los sensores, ritmo por aparato |
| `GET /api/admin/ideas?area=&estado=` | el vivero |
| `POST /api/admin/ideas` | `{ area, titulo, detalle?, evidencia?, impacto?, esfuerzo?, autor? }` → `201` nueva, `200` repetida |
| `PATCH /api/admin/ideas/:id` | `{ estado?, impacto?, esfuerzo?, area?, motivo?, detalle? }` |
| `DELETE /api/admin/ideas/:id` | la borra del todo (para lo que se anotó por error) |

Las demás rutas de administración —estado, métricas, aparatos, lotes,
firmware— están en [operacion.md](operacion.md).

## Qué falta

- **Pedidos y ventas**: hoy "vendidos" se estima con "estrenados". Cuando haya
  una forma de vender, la trastienda tendría que saber qué lote se vendió a
  quién y cuándo.
- **Series en el tiempo**: hoy la flota es una foto de ahora. Ver cómo se
  mueven los números semana a semana hace falta para saber si algo mejora.
- **Un mapa**: tendría sentido cuando haya aparatos en más de una ciudad y algo
  que responder con eso. Hoy sería un adorno.
