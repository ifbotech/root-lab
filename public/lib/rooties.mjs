/* rooties.mjs — los cinco Rooties y sus tres pieles.
 *
 * GENERADO desde rootkit/firmware/core/persona.c por
 * tools/sincronizar-firmware.mjs (npm run firmware). No editar a mano: para
 * cambiar un color o un lema se edita persona.c y se vuelve a generar, así
 * la pantalla de la maceta y la app no se separan nunca.
 *
 * `idx` es la posición en la tabla del firmware (la clave del módulo de
 * caras). Cada piel es una rareza del cofre: común, rara o épica.
 */

export const RAREZAS = ['comun', 'raro', 'epico'];

export const MODELOS = [
  {
    idx: 0, id: 'brote', nombre: 'Brote', carcasa: 'carcasas/brote.stl',
    lema: 'Todo le parece nuevo. Sobre todo vos.',
    pieles: {
      comun: { nombre: 'Hoja Nueva', fondo: '#e8f5e9', ojos: '#1b5e20', piel: '#a5d6a7', rubor: '#ff8a80', adornos: [] },
      raro: { nombre: 'Lavanda', fondo: '#f3e5f5', ojos: '#4a148c', piel: '#ce93d8', rubor: '#ea80fc', adornos: ['brillos'] },
      epico: { nombre: 'Flor de Cerezo Dorada', fondo: '#fff8e1', ojos: '#e65100', piel: '#ffe082', rubor: '#ff5252', adornos: ['corona', 'brillos'] },
    },
  },
  {
    idx: 1, id: 'musgo', nombre: 'Musgo', carcasa: 'carcasas/musgo.stl',
    lema: 'No hay apuro. Nunca hubo.',
    pieles: {
      comun: { nombre: 'Musgo', fondo: '#f1f8e9', ojos: '#33691e', piel: '#c5e1a5', rubor: '#aed581', adornos: [] },
      raro: { nombre: 'Glaciar', fondo: '#e0f7fa', ojos: '#006064', piel: '#80deea', rubor: '#4dd0e1', adornos: ['brillos'] },
      epico: { nombre: 'Otoño Tostado', fondo: '#fbe9e7', ojos: '#bf360c', piel: '#ffab91', rubor: '#ff7043', adornos: ['corona'] },
    },
  },
  {
    idx: 2, id: 'pinchito', nombre: 'Pinchito', carcasa: 'carcasas/pinchito.stl',
    lema: '¡Hola! ¿Ya regaste? ¡Hola!',
    pieles: {
      comun: { nombre: 'Desierto', fondo: '#e8f5e9', ojos: '#2e7d32', piel: '#fff176', rubor: '#ff80ab', adornos: [] },
      raro: { nombre: 'Melocotón', fondo: '#fce4ec', ojos: '#880e4f', piel: '#f8bbd0', rubor: '#ff4081', adornos: ['brillos'] },
      epico: { nombre: 'Medianoche Neón', fondo: '#eceff1', ojos: '#0d47a1', piel: '#90caf9', rubor: '#ffd600', adornos: ['aura', 'luces'] },
    },
  },
  {
    idx: 3, id: 'bulbo', nombre: 'Bulbo', carcasa: 'carcasas/bulbo.stl',
    lema: 'Sueña con flores que todavía no existen.',
    pieles: {
      comun: { nombre: 'Limonada', fondo: '#fffde7', ojos: '#827717', piel: '#fff59d', rubor: '#ffab91', adornos: [] },
      raro: { nombre: 'Lila Místico', fondo: '#ede7f6', ojos: '#311b92', piel: '#b39ddb', rubor: '#b388ff', adornos: ['brillos'] },
      epico: { nombre: 'Galáctico', fondo: '#e8eaf6', ojos: '#1a237e', piel: '#7986cb', rubor: '#ff4081', adornos: ['aura', 'brillos'] },
    },
  },
  {
    idx: 4, id: 'champi', nombre: 'Champi', carcasa: 'carcasas/champi.stl',
    lema: 'Tiene hambre. Y sed. Y ganas de charlar.',
    pieles: {
      comun: { nombre: 'Bosque', fondo: '#efebe9', ojos: '#3e2723', piel: '#d7ccc8', rubor: '#ff8a80', adornos: [] },
      raro: { nombre: 'Amanita Rosa', fondo: '#fce4ec', ojos: '#ad1457', piel: '#f48fb1', rubor: '#ffcdd2', adornos: ['brillos'] },
      epico: { nombre: 'Bioluminiscente', fondo: '#e0f2f1', ojos: '#004d40', piel: '#80cbc4', rubor: '#69f0ae', adornos: ['aura', 'luces'] },
    },
  },
];

export const modeloPorId = (id) => MODELOS.find((x) => x.id === id) || null;

/** La piel de un Rooti en una rareza (la común si la rareza no existe). */
export const pielDe = (id, rareza) => {
  const m = modeloPorId(id);
  return m ? (m.pieles[rareza] || m.pieles.comun) : null;
};

/** La clave de una piel: "brote-epico". Es también el id de su paleta. */
export const idPiel = (id, rareza) => `${id}-${RAREZAS.includes(rareza) ? rareza : 'comun'}`;
