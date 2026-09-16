/* push.mjs — mandar notificaciones con la app cerrada.
 *
 * Web Push estándar con claves VAPID. Las claves se generan la primera vez
 * que arranca el servidor y se guardan junto a los datos: si cambian, todas
 * las suscripciones existentes dejan de valer, así que se respaldan con el
 * resto (docs/notificaciones.md).
 *
 * En iPhone las notificaciones web sólo existen para la app instalada en la
 * pantalla de inicio (iOS 16.4 o posterior). Por eso el flujo de la app pide
 * instalar ANTES de pedir permiso.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import webpush from 'web-push';

export function crearPush({
  dirDatos,
  contacto = process.env.ROOTLAB_CONTACTO || 'https://github.com/ifbotech/root-lab',
} = {}) {
  let claves;
  const archivo = dirDatos ? join(dirDatos, 'vapid.json') : null;

  if (archivo && existsSync(archivo)) {
    claves = JSON.parse(readFileSync(archivo, 'utf8'));
  } else {
    claves = webpush.generateVAPIDKeys();
    if (archivo) {
      mkdirSync(dirDatos, { recursive: true });
      writeFileSync(archivo, JSON.stringify(claves, null, 2));
    }
  }
  webpush.setVapidDetails(contacto, claves.publicKey, claves.privateKey);

  return {
    clavePublica: claves.publicKey,
    /** Devuelve 'ok', 'vencida' (hay que borrar la suscripción) o 'error'. */
    async enviar(suscripcion, carga) {
      try {
        await webpush.sendNotification(suscripcion, JSON.stringify(carga), {
          TTL: 6 * 3600,
          urgency: carga.urgente ? 'high' : 'normal',
          topic: String(carga.tag || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || undefined,
        });
        return 'ok';
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) return 'vencida';
        return 'error';
      }
    },
  };
}

/** Un push de mentira para tests y para correr sin red. */
export function crearPushDePrueba() {
  const enviados = [];
  return {
    clavePublica: 'BPrueba',
    enviados,
    async enviar(suscripcion, carga) {
      if (suscripcion.endpoint?.includes('vencida')) return 'vencida';
      enviados.push({ endpoint: suscripcion.endpoint, ...carga });
      return 'ok';
    },
  };
}
