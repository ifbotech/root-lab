/* dispositivo.mjs — lo que la app necesita saber del teléfono.
 *
 * Instalación, notificaciones y fotos se comportan distinto en cada
 * sistema, y el flujo de alta depende de eso: en iPhone las notificaciones
 * web sólo existen con la app instalada, Android ofrece un botón de
 * instalar y el escritorio no instala nada. Todas las decisiones están acá
 * para que las vistas sólo pregunten.
 */

export const esIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const esAndroid = () => /android/i.test(navigator.userAgent);

export const instalada = () => window.matchMedia?.('(display-mode: standalone)').matches
  || window.navigator.standalone === true;

/* ------------------------------------------------------------- instalar --- */
let promptInstalar = null;
const oyentes = new Set();
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  promptInstalar = e;
  oyentes.forEach((f) => f());
});
window.addEventListener('appinstalled', () => {
  promptInstalar = null;
  oyentes.forEach((f) => f());
});
export const puedeInstalarConBoton = () => Boolean(promptInstalar);
export const alCambiarInstalable = (f) => { oyentes.add(f); return () => oyentes.delete(f); };
export async function instalar() {
  if (!promptInstalar) return false;
  promptInstalar.prompt();
  const r = await promptInstalar.userChoice.catch(() => null);
  promptInstalar = null;
  return r?.outcome === 'accepted';
}

/* ------------------------------------------------------- notificaciones --- */
export function soportaAvisos() {
  return window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window
    && 'Notification' in window;
}

/** Por qué no se pueden activar, en palabras, o null si se puede. */
export function motivoSinAvisos() {
  if (!window.isSecureContext) return 'Las notificaciones necesitan que la app se abra por HTTPS.';
  if (esIOS() && !instalada()) return 'En iPhone, primero agregá la app a la pantalla de inicio.';
  if (!soportaAvisos()) return 'Este navegador no soporta notificaciones.';
  if (Notification.permission === 'denied') return 'Las bloqueaste. Activalas desde los ajustes del navegador.';
  return null;
}

const base64aBytes = (b64) => {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

export async function activarAvisos(api) {
  if (motivoSinAvisos()) throw new Error(motivoSinAvisos());
  const permiso = await Notification.requestPermission();
  if (permiso !== 'granted') throw new Error('Sin permiso no te puedo avisar.');
  const reg = await navigator.serviceWorker.ready;
  const { clave } = await api('/api/push/clave');
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64aBytes(clave) });
  }
  await api('/api/push/suscripcion', { metodo: 'POST', cuerpo: { suscripcion: sub.toJSON() } });
  return true;
}

export async function avisosActivos() {
  if (!soportaAvisos() || Notification.permission !== 'granted') return false;
  const reg = await navigator.serviceWorker.getRegistration();
  return Boolean(await reg?.pushManager.getSubscription());
}

/* ----------------------------------------------------------------- fotos --- */
/**
 * Achica la foto antes de mandarla. Una foto de teléfono pesa 3 a 8 MB y
 * para reconocer una planta alcanza con 1280 pixeles: se sube diez veces
 * más rápido y el modelo la mira igual.
 */
export async function prepararFoto(archivo, maximo = 1280) {
  const url = URL.createObjectURL(archivo);
  try {
    const img = await new Promise((ok, mal) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => mal(new Error('No pude abrir la foto'));
      i.src = url;
    });
    const k = Math.min(1, maximo / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * k);
    const h = Math.round(img.naturalHeight * k);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    const dataUrl = c.toDataURL('image/jpeg', 0.85);
    return { image_b64: dataUrl.split(',')[1], mime: 'image/jpeg', vista: dataUrl };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Lee un QR con la cámara si el navegador sabe (BarcodeDetector). */
export const puedeLeerQR = () => 'BarcodeDetector' in window;
