/* sw.js — el service worker: abrir sin red, actualizarse solo y avisar.
 *
 * LA REGLA QUE NO SE NEGOCIA: LOS DATOS NUNCA SE CACHEAN.
 *
 * Una lectura vieja mostrada como actual es peor que no mostrar nada: el
 * usuario riega mirando ese número. Todo /api/ va directo a la red.
 *
 * El armazón —HTML, CSS, módulos, íconos y el renderer de caras— sí se
 * cachea, porque es la misma interfaz muestre lo que muestre.
 */

/* Subir la versión invalida el caché entero. */
const CACHE = 'rootkit-v7';

/* La app puede estar montada en una subruta (/rootkit/): todo se resuelve
   contra el alcance del service worker, nunca contra la raíz del dominio. */
const ALCANCE = new URL(self.registration.scope);
const enAlcance = (ruta) => new URL(ruta, ALCANCE).href;
const relativa = (url) => (url.pathname.startsWith(ALCANCE.pathname)
  ? url.pathname.slice(ALCANCE.pathname.length) : null);

const ARMAZON = [
  './',
  'index.html',
  'app.js',
  'style.css',
  'lib/api.mjs',
  'lib/base.mjs',
  'lib/caras.mjs',
  'lib/diagnostico.mjs',
  'lib/dispositivo.mjs',
  'lib/gamificacion.mjs',
  'lib/model.mjs',
  'lib/tareas.mjs',
  'lib/ui.mjs',
  'vistas/ajustes.mjs',
  'vistas/alta.mjs',
  'vistas/cofre.mjs',
  'vistas/coleccion.mjs',
  'vistas/cuenta.mjs',
  'vistas/escaner.mjs',
  'vistas/hoy.mjs',
  'vistas/plantas.mjs',
  'caras/rootkit_caras.wasm',
  'caras/incognito.png',
  'iconos/icono-192.png',
  'iconos/icono-512.png',
  'iconos/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.allSettled(ARMAZON.map((u) => c.add(enAlcance(u)))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  const rel = relativa(url);
  if (url.origin !== location.origin || rel === null || rel.startsWith('api/') || e.request.method !== 'GET') {
    return;
  }
  /* Las rutas v/<código> son la misma app. */
  const indice = enAlcance('index.html');
  const pedido = /^v\/[^/]+\/?$/i.test(rel) ? new Request(indice) : e.request;

  /* Primero la red (así una versión nueva llega enseguida) y, si no hay,
     el caché. */
  e.respondWith(
    fetch(pedido)
      .then((r) => {
        if (r && r.ok && !rel.startsWith('manifest')) {
          const copia = r.clone();
          caches.open(CACHE).then((c) => c.put(pedido, copia));
        }
        return r;
      })
      .catch(() => caches.match(pedido).then((g) => g || caches.match(indice))),
  );
});

/* ------------------------------------------------------- notificaciones -- */
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { titulo: 'ROOTKIT', cuerpo: e.data?.text() || '' }; }
  e.waitUntil(self.registration.showNotification(d.titulo || 'ROOTKIT', {
    body: d.cuerpo || '',
    icon: enAlcance(d.icono || 'iconos/icono-192.png'),
    badge: enAlcance('iconos/icono-192.png'),
    tag: d.tag || undefined,
    renotify: Boolean(d.urgente),
    requireInteraction: Boolean(d.urgente),
    data: { url: enAlcance(d.url || './') },
    lang: 'es',
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const destino = e.notification.data?.url || ALCANCE.href;
  e.waitUntil((async () => {
    const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const v of ventanas) {
      if (new URL(v.url).origin === location.origin) {
        await v.focus();
        return v.navigate(destino);
      }
    }
    return self.clients.openWindow(destino);
  })());
});
