/* plantillas-correo.mjs — los emails que manda ROOTLAB.
 *
 * Cada plantilla devuelve { asunto, texto, html }. Las dos versiones dicen
 * lo mismo: hay clientes que sólo muestran texto, y los filtros de spam
 * desconfían de un email que es sólo HTML.
 *
 * El HTML es de tablas y estilos en línea, que es lo único que Gmail,
 * Outlook y Apple Mail dibujan igual. Los colores salen de la paleta de la
 * cuenta (public/lib/paletas.mjs): el email se ve como la app de esa persona.
 * Todo lo que viene del usuario (el nombre) se escapa.
 */
import { paletaPorId, PALETA_POR_DEFECTO, temaDesdePaleta } from '../public/lib/paletas.mjs';

const escapar = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

function marco({ paleta, titulo, parrafos, boton, pie }) {
  const t = temaDesdePaleta(paletaPorId(paleta) || paletaPorId(PALETA_POR_DEFECTO));
  const p = (x) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.55;color:${t['tinta-2']}">${x}</p>`;
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<meta name="color-scheme" content="dark light"><title>${escapar(titulo)}</title></head>
<body style="margin:0;padding:0;background:${t.fondo}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${t.fondo};padding:32px 16px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:${t.panel};border:2px solid ${t.borde};border-radius:20px">
<tr><td style="padding:28px 28px 8px;font-family:Nunito,Segoe UI,Helvetica,Arial,sans-serif">
<div style="font-weight:900;font-size:20px;letter-spacing:.08em;color:${t.tinta}">ROOT<span style="color:${t.primario}">LAB</span></div>
</td></tr>
<tr><td style="padding:12px 28px 8px;font-family:Nunito,Segoe UI,Helvetica,Arial,sans-serif">
<h1 style="margin:0 0 16px;font-size:24px;line-height:1.2;color:${t.tinta}">${escapar(titulo)}</h1>
${parrafos.map(p).join('\n')}
${boton ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px"><tr><td style="border-radius:14px;background:${t.primario}">
<a href="${escapar(boton.url)}" style="display:inline-block;padding:14px 26px;font-weight:900;font-size:15px;letter-spacing:.04em;text-transform:uppercase;color:${t['sobre-primario']};text-decoration:none;border-radius:14px">${escapar(boton.texto)}</a>
</td></tr></table>
<p style="margin:0 0 16px;font-size:13px;line-height:1.5;color:${t['tinta-3']}">Si el botón no anda, copiá este enlace:<br><span style="word-break:break-all;color:${t['tinta-2']}">${escapar(boton.url)}</span></p>` : ''}
</td></tr>
<tr><td style="padding:8px 28px 28px;font-family:Nunito,Segoe UI,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.5;color:${t['tinta-3']}">${pie}</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

const saludo = (nombre) => (nombre ? `Hola, ${nombre}.` : 'Hola.');

export function restablecerClave({ nombre, url, minutos, paleta }) {
  const asunto = 'Restablecé tu contraseña de ROOTLAB';
  const texto = `${saludo(nombre)}

Pediste restablecer la contraseña de tu cuenta de ROOTLAB. Entrá a este enlace para elegir una nueva:

${url}

El enlace sirve una sola vez y vence en ${minutos} minutos.

Si no lo pediste vos, ignorá este email: tu contraseña sigue igual y nadie entró a tu cuenta.

— ROOTLAB`;
  const html = marco({
    paleta,
    titulo: 'Restablecé tu contraseña',
    parrafos: [escapar(saludo(nombre)), 'Pediste restablecer la contraseña de tu cuenta de ROOTLAB. Tocá el botón para elegir una nueva.',
      `El enlace sirve una sola vez y vence en ${minutos} minutos.`],
    boton: { texto: 'Elegir contraseña nueva', url },
    pie: 'Si no lo pediste vos, ignorá este email: tu contraseña sigue igual y nadie entró a tu cuenta.',
  });
  return { asunto, texto, html };
}

export function verificarEmail({ nombre, url, horas, paleta }) {
  const asunto = 'Confirmá tu email de ROOTLAB';
  const texto = `${saludo(nombre)}

Bienvenida o bienvenido a ROOTLAB. Confirmá que este email es tuyo, así podemos ayudarte si alguna vez olvidás la contraseña:

${url}

El enlace vence en ${horas} horas.

Si no creaste una cuenta en ROOTLAB, ignorá este email.

— ROOTLAB`;
  const html = marco({
    paleta,
    titulo: 'Confirmá tu email',
    parrafos: [escapar(saludo(nombre)), 'Tu cuenta de ROOTLAB está lista. Confirmá que este email es tuyo, así podemos ayudarte si alguna vez olvidás la contraseña.'],
    boton: { texto: 'Confirmar email', url },
    pie: `El enlace vence en ${horas} horas. Si no creaste una cuenta en ROOTLAB, ignorá este email.`,
  });
  return { asunto, texto, html };
}

export function claveCambiada({ nombre, paleta, url }) {
  const asunto = 'Tu contraseña de ROOTLAB cambió';
  const texto = `${saludo(nombre)}

La contraseña de tu cuenta de ROOTLAB se acaba de cambiar, y se cerró la sesión en los demás teléfonos.

Si fuiste vos, no tenés que hacer nada.

Si no fuiste vos, restablecela ya desde ${url} ("¿Olvidaste tu contraseña?").

— ROOTLAB`;
  const html = marco({
    paleta,
    titulo: 'Tu contraseña cambió',
    parrafos: [escapar(saludo(nombre)), 'La contraseña de tu cuenta de ROOTLAB se acaba de cambiar, y se cerró la sesión en los demás teléfonos.',
      'Si fuiste vos, no tenés que hacer nada.'],
    boton: null,
    pie: `Si no fuiste vos, restablecela ya desde <a href="${escapar(url)}" style="color:inherit">ROOTLAB</a> con “¿Olvidaste tu contraseña?”.`,
  });
  return { asunto, texto, html };
}

/**
 * El código de seis dígitos para entrar a la trastienda.
 *
 * No lleva enlace: quien entra ya está en el panel esperando, y un enlace que
 * abre una sesión de administración desde el correo es una puerta de más.
 */
export function codigoTrastienda({ codigo, minutos, ip = '' }) {
  const asunto = `${codigo} es tu código para entrar a la trastienda`;
  const espaciado = String(codigo).split('').join(' ');
  const texto = `Hola.

Alguien pidió entrar a la trastienda de ROOTLAB (el panel de administración) con este email.

Tu código es: ${codigo}

Vence en ${minutos} minutos y sirve una sola vez.${ip ? `

El pedido vino de ${ip}.` : ''}

Si no fuiste vos, no hagas nada: sin el código nadie entra. Pero avisale a quien administra el servidor, porque alguien sabe que este email es de administración.

— ROOTLAB`;
  const html = marco({
    titulo: 'Tu código para la trastienda',
    parrafos: [
      'Alguien pidió entrar a la trastienda de ROOTLAB (el panel de administración) con este email.',
      `<div style="font:900 34px/1.2 Nunito,system-ui,sans-serif;letter-spacing:.24em;text-align:center;margin:18px 0;padding:14px;border-radius:14px;background:#f1f4ec">${escapar(espaciado)}</div>`,
      `Vence en ${minutos} minutos y sirve una sola vez.${ip ? ` El pedido vino de ${escapar(ip)}.` : ''}`,
    ],
    pie: 'Si no fuiste vos, no hagas nada: sin el código nadie entra. Pero avisale a quien administra el servidor.',
  });
  return { asunto, texto, html };
}

/**
 * El informe de un agente: lo que hizo en su vuelta.
 *
 * Llega como texto, tal cual lo escribió el agente, porque lo que importa es
 * qué cambió y por qué; el marco sólo lo hace legible en un cliente de correo.
 */
export function informeDeAgente({ agente, asunto, cuerpo }) {
  const titulo = asunto || `Informe de ${agente}`;
  const texto = `${cuerpo}\n\n— ${agente}, desde la trastienda de ROOTLAB`;
  const html = marco({
    titulo,
    parrafos: [
      `<pre style="white-space:pre-wrap;font:600 14px/1.5 ui-monospace,Menlo,Consolas,monospace;margin:0">${escapar(cuerpo)}</pre>`,
    ],
    pie: `${escapar(agente)}, desde la trastienda de ROOTLAB.`,
  });
  return { asunto: titulo, texto, html };
}

export function alertaGasto({ gastado, tope, periodo }) {
  const pct = tope > 0 ? Math.round((gastado / tope) * 100) : 100;
  const asunto = `ROOTLAB: la IA lleva ${pct}% del tope ${periodo}`;
  const texto = `La IA de ROOTLAB lleva gastados US$ ${gastado.toFixed(2)} de un tope ${periodo} de US$ ${tope.toFixed(2)} (${pct}%).

Al llegar al tope, el reconocimiento de plantas, el diagnóstico y el chat se pausan hasta el período siguiente.

Para ver el detalle en el servidor: node tools/uso-ia.mjs
Para cambiar el tope: ROOTLAB_IA_TOPE_MES_USD / ROOTLAB_IA_TOPE_DIA_USD en /etc/root-lab.env`;
  const html = marco({
    paleta: PALETA_POR_DEFECTO,
    titulo: `La IA lleva ${pct}% del tope ${periodo}`,
    parrafos: [`Gastado: <b>US$ ${gastado.toFixed(2)}</b> de US$ ${tope.toFixed(2)}.`,
      'Al llegar al tope, el reconocimiento de plantas, el diagnóstico y el chat se pausan hasta el período siguiente.',
      'Detalle en el servidor: <code>node tools/uso-ia.mjs</code>.'],
    boton: null,
    pie: 'Aviso automático de ROOTLAB para quien administra el servidor.',
  });
  return { asunto, texto, html };
}

/** A quien opera el servicio: muchos Rooties se callaron a la vez. */
export function alertaOperacion({ activos = 0, callados = 0, juntos = 0, desde = null } = {}) {
  const cuando = desde ? new Date(desde).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : 'hace un rato';
  const asunto = `ROOTLAB: ${callados} de ${activos} Rooties dejaron de reportar a la vez`;
  const texto = `${callados} de los ${activos} Rooties activos no reportan hace más de 45 minutos, y ${juntos} se callaron casi juntos (desde ${cuando}).

Eso no suelen ser ${juntos} casas sin wifi: revisá el servidor, el dominio y el certificado.

  systemctl status root-lab
  journalctl -u root-lab -n 100
  node tools/verificar-despliegue.mjs <url>

Este aviso no se repite antes de 6 horas.`;
  const html = marco({
    paleta: PALETA_POR_DEFECTO,
    titulo: `${callados} de ${activos} Rooties se callaron a la vez`,
    parrafos: [`${juntos} dejaron de reportar casi juntos, desde <b>${cuando}</b>.`,
      'Eso no suelen ser muchas casas sin wifi: revisá el servidor, el dominio y el certificado.',
      '<code>systemctl status root-lab</code> · <code>node tools/verificar-despliegue.mjs</code>'],
    boton: null,
    pie: 'Aviso automático de ROOTLAB para quien administra el servidor. No se repite antes de 6 horas.',
  });
  return { asunto, texto, html };
}

/** A quien opera el servicio: cómo salió la prueba de restauración del respaldo. */
export function informeRespaldo({ ok, archivo = '', detalle = '', conteo = null } = {}) {
  const asunto = ok ? 'ROOTLAB: el respaldo se restaura bien' : 'ROOTLAB: EL RESPALDO NO SE PUDO RESTAURAR';
  const lineas = [
    ok ? `La prueba de restauración del respaldo salió bien.` : `La prueba de restauración del respaldo FALLÓ.`,
    archivo ? `Archivo: ${archivo}` : '',
    conteo ? `Adentro: ${conteo.cuentas} cuentas, ${conteo.plantas} plantas, ${conteo.lecturas} lecturas (esquema ${conteo.esquema}).` : '',
    detalle,
  ].filter(Boolean);
  const html = marco({
    paleta: PALETA_POR_DEFECTO,
    titulo: ok ? 'El respaldo se restaura bien' : 'El respaldo NO se pudo restaurar',
    parrafos: lineas.slice(1).map((l) => l.replace(/&/g, '&amp;').replace(/</g, '&lt;')),
    boton: null,
    pie: 'Prueba automática de ROOTLAB (tools/restaurar.mjs --verificar).',
  });
  return { asunto, texto: lineas.join('\n'), html };
}
