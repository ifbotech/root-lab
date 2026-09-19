/* probar-correo.mjs — manda un email de prueba con la configuración real.
 *
 *   node tools/probar-correo.mjs destino@ejemplo.com
 *
 * En el VPS, con las variables del servicio. El .env sólo lo lee root (600),
 * así que se carga primero y recién después se baja a rootlab:
 *   sudo bash -c 'set -a; . /etc/root-lab.env; set +a; runuser -p -u rootlab -- \
 *     /opt/root-lab-node/bin/node /opt/root-lab/tools/probar-correo.mjs "$ROOTLAB_ADMIN_EMAIL"'
 *
 * Verifica la conexión y la autenticación con el relay y manda la plantilla de
 * verificación (con un enlace que no sirve para nada) para ver cómo llega:
 * bandeja de entrada o spam, colores, enlaces. Sale con código 1 si falla.
 */
import { configCorreoDesdeEntorno, crearCorreo } from '../server/correo.mjs';
import { verificarEmail } from '../server/plantillas-correo.mjs';
import { enmascararEmail } from '../server/cripto.mjs';

const destino = process.argv[2];
if (!destino || !destino.includes('@')) {
  console.error('uso: node tools/probar-correo.mjs destino@ejemplo.com');
  process.exit(1);
}

const correo = crearCorreo({ ...configCorreoDesdeEntorno(process.env, process.env.ROOTLAB_DATOS || 'data'), reintentos: [] });
console.log(`transporte ${correo.transporte}, remitente ${correo.remitente}`);
try {
  await correo.verificar();
  console.log('relay: conexión y autenticación correctas');
} catch (e) {
  console.error(`relay: ${e.message}`);
  process.exit(1);
}
const m = verificarEmail({
  nombre: 'equipo de ROOTLAB',
  url: `${(process.env.ROOTLAB_URL_PUBLICA || 'http://localhost:8080').replace(/\/+$/, '')}/#verificar/prueba-sin-efecto`,
  horas: 48,
});
const ok = await correo.enviar({ ...m, asunto: `[Prueba] ${m.asunto}`, para: destino, tipo: 'prueba' });
correo.cerrar();
console.log(ok ? `enviado a ${enmascararEmail(destino)}` : 'no se pudo enviar');
process.exitCode = ok ? 0 : 1;
