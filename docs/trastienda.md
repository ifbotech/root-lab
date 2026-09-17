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
| **El vivero** | Todo lo que habría que mejorar, ordenado por lo que rinde |

## Cómo se entra

Con la clave de administración del servidor:

```bash
sudo grep ROOTLAB_ADMIN_CLAVE /etc/root-lab.env
```

Se pone una vez y el servidor devuelve un **token de doce horas**, que vive
sólo en esa pestaña del navegador (`sessionStorage`). La clave maestra no
queda guardada en el navegador, cerrar el servidor cierra todas las sesiones, y
"Salir" cierra la propia. Diez intentos fallidos desde una IP en diez minutos y
se corta.

Sin `ROOTLAB_ADMIN_CLAVE` configurada, las rutas de administración **no
existen** (404, igual que cualquier ruta inventada) y la trastienda no se puede
abrir. La página lleva `noindex` y no registra el service worker de la app.

## Qué NO muestra, a propósito

Ni emails, ni nombres de plantas, ni charlas, ni fotos, ni el id de ninguna
planta. Todo lo que se ve es **del aparato** —que es nuestro hasta que lo
vendemos— o un **agregado**.

Se puede saber si el producto anda sin leerle la casa a nadie:

- que un aparato mida poco se ve en el conteo de lecturas, sin mirar qué midió;
- que un sensor esté roto se ve en el porcentaje de lecturas sin ese dato;
- que la app se use se ve en contadores anónimos por día, sin cuenta ni planta.

Esa línea es una decisión, no un olvido, y hay una prueba que la sostiene:
`test/trastienda.test.mjs` verifica que la flota no devuelva ni el email de la
cuenta, ni el nombre de la planta, ni su id.

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
```

## Las rutas

Todas piden `Authorization: Bearer <clave o token de sesión>`.

| Ruta | Qué hace |
|---|---|
| `POST /api/admin/sesion` | `{ clave }` → `201 { token, vence }`: entrar (la única que no pide estar adentro) |
| `DELETE /api/admin/sesion` | cierra esta sesión |
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
