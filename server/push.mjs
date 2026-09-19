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
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import webpush from 'web-push';

/* Los servicios de avisos de los navegadores. Una suscripción es una URL a la
 * que el SERVIDOR le hace un POST: si se aceptara cualquiera, una cuenta
 * podría hacer que el servidor le pegue a lo que quiera —127.0.0.1, la red
 * del VPS, un tercero— y usar la respuesta ("enviados: 1") para ver qué hay.
 * Sólo estos, por HTTPS y en el puerto de siempre. */
export const SERVICIOS_PUSH = [
  'fcm.googleapis.com',                 /* Chrome, Android, Opera, Samsung */
  'android.googleapis.com',             /* Chrome viejo */
  'push.services.mozilla.com',          /* Firefox (updates.push.…) */
  'push.apple.com',                     /* Safari: web.push.apple.com */
  'notify.windows.com',                 /* Edge en Windows: wns2-….notify.windows.com */
];

/** Si esa URL es de un servicio de avisos de verdad. */
export function endpointPushValido(endpoint) {
  if (typeof endpoint !== 'string' || endpoint.length > 1000) return false;
  let u;
  try { u = new URL(endpoint); } catch { return false; }
  if (u.protocol !== 'https:' || u.username || u.password) return false;
  if (u.port && u.port !== '443') return false;
  const host = u.hostname.toLowerCase();
  return SERVICIOS_PUSH.some((s) => host === s || host.endsWith(`.${s}`));
}

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
      /* Adentro va una clave PRIVADA: la lee su dueño y nadie más. Sin esto
         quedaba 0644 y cualquier usuario del servidor podía mandar
         notificaciones en nombre de ROOTLAB. */
      writeFileSync(archivo, JSON.stringify(claves, null, 2), { mode: 0o600 });
    }
  }
  if (archivo && existsSync(archivo)) {
    /* Y si venía de antes con permisos abiertos, se cierran igual. */
    try { chmodSync(archivo, 0o600); } catch { /* otro dueño: no es nuestro */ }
  }
  webpush.setVapidDetails(contacto, claves.publicKey, claves.privateKey);

  return {
    clavePublica: claves.publicKey,
    /** Devuelve 'ok', 'vencida' (hay que borrar la suscripción) o 'error'. */
    async enviar(suscripcion, carga) {
      /* Una que se guardó antes de que existiera el control, o que alguien
         metió a mano en la base: no sale, y se borra como vencida. */
      if (!endpointPushValido(suscripcion?.endpoint)) return 'vencida';
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
