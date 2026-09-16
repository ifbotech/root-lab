/* correo.mjs — mandar emails.
 *
 * NODEMAILER + UN RELAY SMTP
 *
 * Nodemailer es la librería de correo más usada de Node (código abierto, MIT,
 * sin dependencias). No manda el correo ella misma: se lo entrega por SMTP a
 * un relay, que es quien tiene la reputación para que llegue a la bandeja de
 * entrada y no a spam. En el VPS el relay es Brevo (plan gratis: 300 emails
 * por día), que ya firma con DKIM el dominio ifbotech.com. Cambiar de relay
 * (SES, Postmark, el SMTP del dominio nuevo) es cambiar cuatro variables.
 *
 * Tres transportes:
 *
 *   smtp       producción: ROOTLAB_SMTP_HOST, _PORT, _USUARIO, _CLAVE
 *   archivo    desarrollo sin SMTP: cada email queda como .eml en
 *              <datos>/correos, para abrirlo con cualquier cliente
 *   memoria    tests: quedan en una lista
 *
 * NUNCA BLOQUEA UNA RESPUESTA
 *
 * `enviar()` encola y vuelve enseguida: pedir "olvidé mi contraseña" tarda
 * lo mismo exista o no la cuenta, y un relay lento no cuelga la app. La cola
 * reintenta tres veces con espera creciente. Los logs muestran el destino
 * enmascarado (a***@gmail.com), nunca el email completo.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import nodemailer from 'nodemailer';
import { enmascararEmail } from './cripto.mjs';

/* Dominios reservados para pruebas (RFC 2606 y 6761): nunca salen por el
   relay. Las cuentas de verificación usan @rootlab.invalid, y un rebote a un
   dominio que no existe le baja la reputación al remitente. */
export const esDominioDePrueba = (email) => {
  const d = String(email || '').split('@')[1]?.toLowerCase() || '';
  return /(^|\.)(invalid|test|example|localhost)$/.test(d) || /^example\.(com|net|org)$/.test(d);
};

export function configCorreoDesdeEntorno(env = process.env, dirDatos = 'data') {
  if (env.ROOTLAB_SMTP_HOST) {
    return {
      transporte: 'smtp',
      smtp: {
        host: env.ROOTLAB_SMTP_HOST,
        port: Number(env.ROOTLAB_SMTP_PORT) || 587,
        secure: Number(env.ROOTLAB_SMTP_PORT) === 465,
        user: env.ROOTLAB_SMTP_USUARIO || '',
        pass: env.ROOTLAB_SMTP_CLAVE || '',
      },
      remitente: env.ROOTLAB_CORREO_REMITENTE || 'ROOTLAB <no-reply@ifbotech.com>',
    };
  }
  return { transporte: 'archivo', dir: join(dirDatos, 'correos'), remitente: env.ROOTLAB_CORREO_REMITENTE || 'ROOTLAB <no-reply@localhost>' };
}

export function crearCorreo({
  transporte = 'memoria', smtp = null, dir = null, remitente = 'ROOTLAB <no-reply@localhost>',
  reintentos = [2000, 15000, 60000], registro = console,
} = {}) {
  const enviados = [];
  const pendientes = new Set();
  let nm = null;

  if (transporte === 'smtp') {
    nm = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      requireTLS: !smtp.secure,          /* STARTTLS obligatorio: nada viaja en claro */
      auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
      tls: { minVersion: 'TLSv1.2' },
      pool: true,
      maxConnections: 2,
      connectionTimeout: 15000,
      socketTimeout: 30000,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
  } else if (transporte === 'archivo') {
    nm = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'unix' });
  }

  async function entregar(m) {
    const mensaje = {
      from: remitente, to: m.para, subject: m.asunto, text: m.texto, html: m.html,
      headers: { 'X-Auto-Response-Suppress': 'All', 'Auto-Submitted': 'auto-generated' },
    };
    if (transporte === 'memoria') {
      enviados.push({ ...m, de: remitente });
      return;
    }
    if (transporte === 'smtp' && esDominioDePrueba(m.para)) {
      registro.info?.(`correo ${m.tipo || ''} -> ${enmascararEmail(m.para)}: omitido (dominio de prueba)`);
      return 'omitido';
    }
    const info = await nm.sendMail(mensaje);
    if (transporte === 'archivo') {
      mkdirSync(dir, { recursive: true });
      const nombre = `${new Date().toISOString().replace(/[:.]/g, '-')}-${m.tipo || 'correo'}.eml`;
      writeFileSync(join(dir, nombre), info.message);
    }
  }

  async function conReintentos(m) {
    for (let intento = 0; ; intento++) {
      try {
        if (await entregar(m) !== 'omitido') registro.info?.(`correo ${m.tipo || ''} -> ${enmascararEmail(m.para)}: enviado`);
        return true;
      } catch (e) {
        if (intento >= reintentos.length) {
          registro.error?.(`correo ${m.tipo || ''} -> ${enmascararEmail(m.para)}: falló (${e.message})`);
          return false;
        }
        await new Promise((ok) => setTimeout(ok, reintentos[intento]));
      }
    }
  }

  return {
    transporte,
    remitente,
    enviados,

    /** Encola y vuelve. `m`: { para, asunto, texto, html, tipo }. */
    enviar(m) {
      const p = conReintentos(m).finally(() => pendientes.delete(p));
      pendientes.add(p);
      return p;
    },

    /** Espera a que se vacíe la cola (tests, apagado ordenado). */
    async esperar() {
      while (pendientes.size) await Promise.allSettled([...pendientes]);
    },

    /** Prueba la conexión y la autenticación con el relay, sin mandar nada. */
    async verificar() {
      if (transporte !== 'smtp') return true;
      return nm.verify();
    },

    cerrar() { nm?.close?.(); },
  };
}
