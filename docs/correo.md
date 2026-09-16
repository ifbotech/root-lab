# Correo

ROOTLAB manda cuatro emails: **restablecer la contraseña**, **confirmar el
email**, **tu contraseña cambió** y, a quien administra, **alerta de gasto de
la IA**. Las plantillas están en `server/plantillas-correo.mjs` y el envío en
`server/correo.mjs`.

## Nodemailer + un relay SMTP

**Nodemailer** es la librería de correo más usada del ecosistema Node: código
abierto (MIT), sin dependencias, mantenida desde 2010. No manda el correo
ella misma: se lo entrega por SMTP a un **relay**, que es quien tiene la
reputación y la autenticación del dominio para que el email llegue a la
bandeja de entrada y no a spam. Mandar directo desde el VPS (Postfix) no
funciona bien hoy: sin historial de envíos, Gmail y Outlook lo tratan como
sospechoso.

En el VPS el relay es **Brevo** (plan gratis: 300 emails por día), el mismo
que ya usa ifbotech.com. El dominio ya está autenticado:

| Registro DNS | Estado | Para qué |
|---|---|---|
| SPF `v=spf1 include:_spf.google.com include:spf.sendinblue.com ~all` | ✔ | autoriza a Brevo a mandar como `@ifbotech.com` |
| DKIM `brevo1._domainkey`, `brevo2._domainkey` | ✔ | firma cada email |
| DMARC `p=none; rua=...@dmarc.brevo.com` | ✔ (en observación) | cuando los reportes estén limpios, subir a `p=quarantine` |

Cambiar de relay (Amazon SES, Postmark, el SMTP del dominio propio de
ROOTLAB) es cambiar cuatro variables.

## Configuración

| Variable | Ejemplo |
|---|---|
| `ROOTLAB_SMTP_HOST` | `smtp-relay.brevo.com` |
| `ROOTLAB_SMTP_PORT` | `587` (STARTTLS) o `465` (TLS directo) |
| `ROOTLAB_SMTP_USUARIO`, `ROOTLAB_SMTP_CLAVE` | las credenciales SMTP del relay |
| `ROOTLAB_CORREO_REMITENTE` | `"ROOTLAB <no-reply@ifbotech.com>"` |
| `ROOTLAB_ADMIN_EMAIL` | quien recibe las alertas de gasto |

Sin `ROOTLAB_SMTP_HOST`, cada email queda como `.eml` en `data/correos`: se
abre con cualquier cliente de correo y los enlaces funcionan con la app local.

Al arrancar, el servidor prueba la conexión y la autenticación con el relay
sin mandar nada (`correo: relay SMTP conectado` en el log).

## Cómo se manda

- **Nunca bloquea una respuesta**: el email se encola y la API contesta
  enseguida. Pedir "olvidé mi contraseña" tarda lo mismo exista o no la
  cuenta.
- **Reintentos**: 3, a los 2 s, 15 s y 60 s. Si igual falla, queda en el log
  con el destino enmascarado.
- **TLS obligatorio**: STARTTLS requerido y TLS 1.2 como mínimo; nada viaja en
  claro. Pool de 2 conexiones.
- **Dominios de prueba nunca salen**: `*.invalid`, `*.test`, `*.example`,
  `localhost` y `example.com/net/org` se omiten en el relay. Las cuentas de
  verificación usan `@rootlab.invalid`: un rebote a un dominio inexistente le
  baja la reputación al remitente.
- Cabeceras `Auto-Submitted: auto-generated` y
  `X-Auto-Response-Suppress: All`: los "fuera de oficina" no contestan.
- Al apagar, el servidor espera hasta 10 s a que salga la cola.

## Las plantillas

Cada una tiene versión de **texto y HTML** con el mismo contenido: hay
clientes que sólo muestran texto, y los filtros de spam desconfían de un email
que es sólo HTML. El HTML es de tablas y estilos en línea (lo único que Gmail,
Outlook y Apple Mail dibujan igual) y toma los **colores de la paleta de la
cuenta**: el email se ve como la app de esa persona. Todo lo que escribió el
usuario (el nombre) va escapado.

## Probar

```bash
npm test                                   # test/correo.test.mjs, test/recuperar.test.mjs
node tools/verificar-despliegue.mjs https://ifbotech.com/rootkit --flujo
```

Para ver un email de verdad: crear una cuenta con tu email en la app, o
"¿Olvidaste tu contraseña?". En Brevo, *Transactional → Logs* muestra cada
envío, si se entregó, abrió o rebotó.
