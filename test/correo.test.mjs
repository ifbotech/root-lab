/* Los emails: que salgan, que reintenten, que no revelen nada y que las
 * plantillas escapen lo que escribió la persona.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { crearCorreo, configCorreoDesdeEntorno, esDominioDePrueba } from '../server/correo.mjs';
import * as plantillas from '../server/plantillas-correo.mjs';

describe('correo', () => {
  test('en memoria queda en la lista, con remitente', async () => {
    const c = crearCorreo({ transporte: 'memoria', remitente: 'ROOTLAB <no-reply@x.com>', registro: {} });
    c.enviar({ para: 'ana@ejemplo.com', asunto: 'Hola', texto: 't', html: '<p>h</p>', tipo: 'prueba' });
    await c.esperar();
    assert.equal(c.enviados.length, 1);
    assert.equal(c.enviados[0].de, 'ROOTLAB <no-reply@x.com>');
  });

  test('en archivo cada email es un .eml con texto y HTML', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rootlab-correo-'));
    try {
      const c = crearCorreo({ transporte: 'archivo', dir, remitente: 'ROOTLAB <no-reply@localhost>', registro: {} });
      c.enviar({ para: 'ana@ejemplo.com', asunto: 'Restablecé tu contraseña', texto: 'enlace: https://x/#clave/abc', html: '<b>hola</b>', tipo: 'restablecer' });
      await c.esperar();
      const archivos = readdirSync(dir);
      assert.equal(archivos.length, 1);
      assert.match(archivos[0], /restablecer\.eml$/);
      const eml = readFileSync(join(dir, archivos[0]), 'utf8');
      assert.match(eml, /To: ana@ejemplo\.com/);
      assert.match(eml, /text\/plain/);
      assert.match(eml, /text\/html/);
      assert.match(eml, /Auto-Submitted: auto-generated/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('un relay caído se reintenta y, si no vuelve, se registra sin el email completo', async () => {
    const logs = [];
    const c = crearCorreo({
      transporte: 'smtp',
      smtp: { host: '127.0.0.1', port: 1, secure: false, user: '', pass: '' },
      reintentos: [5, 5],
      registro: { info: (m) => logs.push(m), error: (m) => logs.push(m) },
    });
    const ok = await c.enviar({ para: 'secreta@ejemplo.com', asunto: 'x', texto: 'x', tipo: 'prueba' });
    c.cerrar();
    assert.equal(ok, false);
    assert.equal(logs.length, 1);
    assert.match(logs[0], /s\*\*\*@ejemplo\.com: falló/);
    assert.ok(!logs[0].includes('secreta@'), 'el log no muestra el email');
  });

  test('los dominios de prueba nunca salen por el relay', async () => {
    for (const e of ['a@rootlab.invalid', 'a@x.test', 'a@example.com', 'a@sub.example', 'a@localhost']) {
      assert.equal(esDominioDePrueba(e), true, e);
    }
    for (const e of ['a@gmail.com', 'a@ifbotech.com', 'a@examples.com']) assert.equal(esDominioDePrueba(e), false, e);
    const logs = [];
    const c = crearCorreo({
      transporte: 'smtp', smtp: { host: '127.0.0.1', port: 1, secure: false }, reintentos: [],
      registro: { info: (m) => logs.push(m), error: (m) => logs.push(m) },
    });
    assert.equal(await c.enviar({ para: 'verificacion@rootlab.invalid', asunto: 'x', texto: 'x', tipo: 'verificar' }), true);
    c.cerrar();
    assert.match(logs[0], /omitido \(dominio de prueba\)/, 'ni siquiera intenta conectarse');
  });

  test('la configuración sale del entorno; sin SMTP, a archivo', () => {
    const smtp = configCorreoDesdeEntorno({ ROOTLAB_SMTP_HOST: 'smtp-relay.brevo.com', ROOTLAB_SMTP_PORT: '587', ROOTLAB_SMTP_USUARIO: 'u', ROOTLAB_SMTP_CLAVE: 'p' }, '/datos');
    assert.equal(smtp.transporte, 'smtp');
    assert.equal(smtp.smtp.secure, false, '587 es STARTTLS');
    assert.equal(configCorreoDesdeEntorno({ ROOTLAB_SMTP_HOST: 'h', ROOTLAB_SMTP_PORT: '465' }).smtp.secure, true);
    const archivo = configCorreoDesdeEntorno({}, '/datos');
    assert.equal(archivo.transporte, 'archivo');
    assert.match(archivo.dir.replace(/\\/g, '/'), /\/datos\/correos$/);
  });
});

describe('plantillas', () => {
  test('restablecer: enlace, vencimiento y aviso si no fuiste vos, en texto y HTML', () => {
    const m = plantillas.restablecerClave({ nombre: 'Ana', url: 'https://ifbotech.com/rootkit/#clave/abc', minutos: 30, paleta: 'vibrant' });
    assert.match(m.asunto, /Restablecé/);
    for (const cuerpo of [m.texto, m.html]) {
      assert.ok(cuerpo.includes('https://ifbotech.com/rootkit/#clave/abc'));
      assert.match(cuerpo, /30 minutos/);
      assert.match(cuerpo, /no lo pediste/);
    }
    assert.match(m.html, /ROOT<span[^>]*>LAB<\/span>/);
  });

  test('lo que escribió la persona se escapa en el HTML', () => {
    const m = plantillas.verificarEmail({ nombre: '<script>alert(1)</script>', url: 'https://x/#verificar/t', horas: 48 });
    assert.ok(!m.html.includes('<script>'));
    assert.ok(m.html.includes('&lt;script&gt;'));
  });

  test('el email toma los colores de la paleta de la cuenta', () => {
    const vibrant = plantillas.claveCambiada({ nombre: '', paleta: 'vibrant', url: 'https://x' });
    const glaciar = plantillas.claveCambiada({ nombre: '', paleta: 'musgo-raro', url: 'https://x' });
    assert.ok(glaciar.html.includes('#ecf9ff'), 'fondo de la piel Glaciar del Musgo');
    assert.ok(!vibrant.html.includes('#ecf9ff'));
    assert.ok(plantillas.claveCambiada({ nombre: '', paleta: 'no-existe', url: 'https://x' }).html.length > 0);
  });

  test('la alerta de gasto dice cuánto y cómo cambiar el tope', () => {
    const m = plantillas.alertaGasto({ gastado: 16.5, tope: 20, periodo: 'mensual' });
    assert.match(m.asunto, /83%/);
    assert.match(m.texto, /ROOTLAB_IA_TOPE_MES_USD/);
  });
});
