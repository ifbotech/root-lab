/* rooties.mjs — los cinco Rooties y sus tres pieles.
 *
 * GENERADO desde rootkit/firmware/core/persona.c por
 * tools/sincronizar-firmware.mjs (npm run firmware). No editar a mano: para
 * cambiar un color o un lema se edita persona.c y se vuelve a generar, así
 * la pantalla de la maceta y la app no se separan nunca.
 *
 * `idx` es la posición en la tabla del firmware (la clave del módulo de
 * caras). Cada piel es una rareza del cofre: común, rara o épica.
 *
 * Los colores de una piel: `piel` es el cuerpo en 3D y también el fondo de
 * la cara (van iguales: la cara se pinta sobre el cuerpo), `acento` es lo de
 * arriba (hojas, sombrero, flor, brote), `ojos` y `rubor` la cara, y
 * `escena` —derivado— un tinte claro del cuerpo para poner DETRAS del Rooti.
 */

export const RAREZAS = ['comun', 'raro', 'epico'];

export const MODELOS = [
  {
    idx: 0, id: 'brote', nombre: 'Brote', carcasa: 'carcasas/brote.stl',
    lema: 'Todo le parece nuevo. Sobre todo vos.',
    pieles: {
      comun: {
        nombre: 'Brote Tierno', fondo: '#d4f26e', ojos: '#2a2140', piel: '#d4f26e',
        rubor: '#ff7da6', acento: '#3dbf6b', escena: '#f7fde5', adornos: [],
      },
      raro: {
        nombre: 'Cereza', fondo: '#ffb3d0', ojos: '#4a1530', piel: '#ffb3d0',
        rubor: '#ff6f9e', acento: '#e8457a', escena: '#fff1f7', adornos: ['brillos'],
      },
      epico: {
        nombre: 'Sol Dorado', fondo: '#ffda5c', ojos: '#3a2015', piel: '#ffda5c',
        rubor: '#ff5e6c', acento: '#ff8a2b', escena: '#fff8e2', adornos: ['corona', 'brillos'],
      },
    },
  },
  {
    idx: 1, id: 'musgo', nombre: 'Musgo', carcasa: 'carcasas/musgo.stl',
    lema: 'No hay apuro. Nunca hubo.',
    pieles: {
      comun: {
        nombre: 'Musgo', fondo: '#74ddb5', ojos: '#113329', piel: '#74ddb5',
        rubor: '#ff8fa0', acento: '#ff9a3c', escena: '#e6f9f2', adornos: [],
      },
      raro: {
        nombre: 'Glaciar', fondo: '#94deff', ojos: '#0f2e4a', piel: '#94deff',
        rubor: '#ff9ec8', acento: '#3f6bff', escena: '#ecf9ff', adornos: ['brillos'],
      },
      epico: {
        nombre: 'Aurora', fondo: '#ffa9dc', ojos: '#3d1238', piel: '#ffa9dc',
        rubor: '#ff5fa8', acento: '#ffe066', escena: '#fff0f9', adornos: ['aura', 'luces'],
      },
    },
  },
  {
    idx: 2, id: 'pinchito', nombre: 'Pinchito', carcasa: 'carcasas/pinchito.stl',
    lema: '¡Hola! ¿Ya regaste? ¡Hola!',
    pieles: {
      comun: {
        nombre: 'Desierto', fondo: '#8fe27a', ojos: '#16361c', piel: '#8fe27a',
        rubor: '#ff7fb0', acento: '#ff4fa0', escena: '#ebfae7', adornos: [],
      },
      raro: {
        nombre: 'Atardecer', fondo: '#ffb47c', ojos: '#4a1e14', piel: '#ffb47c',
        rubor: '#ff6a8a', acento: '#e8447f', escena: '#fff2e7', adornos: ['brillos'],
      },
      epico: {
        nombre: 'Neón', fondo: '#9caeff', ojos: '#161b55', piel: '#9caeff',
        rubor: '#ff6fd8', acento: '#ff4fe0', escena: '#edf0ff', adornos: ['aura', 'luces'],
      },
    },
  },
  {
    idx: 3, id: 'bulbo', nombre: 'Bulbo', carcasa: 'carcasas/bulbo.stl',
    lema: 'Sueña con flores que todavía no existen.',
    pieles: {
      comun: {
        nombre: 'Lavanda', fondo: '#c8a4ff', ojos: '#2a1450', piel: '#c8a4ff',
        rubor: '#ff86c8', acento: '#6fdb7e', escena: '#f5efff', adornos: [],
      },
      raro: {
        nombre: 'Menta', fondo: '#8aecd2', ojos: '#0e3a32', piel: '#8aecd2',
        rubor: '#ff8fb0', acento: '#ff7aa0', escena: '#eafcf7', adornos: ['brillos'],
      },
      epico: {
        nombre: 'Galáctico', fondo: '#9c9cff', ojos: '#15114a', piel: '#9c9cff',
        rubor: '#ff6fc0', acento: '#ffd84d', escena: '#ededff', adornos: ['aura', 'brillos'],
      },
    },
  },
  {
    idx: 4, id: 'champi', nombre: 'Champi', carcasa: 'carcasas/champi.stl',
    lema: 'Tiene hambre. Y sed. Y ganas de charlar.',
    pieles: {
      comun: {
        nombre: 'Amanita', fondo: '#ffe8cb', ojos: '#3a1e14', piel: '#ffe8cb',
        rubor: '#ff8a7a', acento: '#ff5a4f', escena: '#fffbf6', adornos: [],
      },
      raro: {
        nombre: 'Violeta', fondo: '#f2e5ff', ojos: '#2a1850', piel: '#f2e5ff',
        rubor: '#ff8fc8', acento: '#9b6bff', escena: '#fdfaff', adornos: ['brillos'],
      },
      epico: {
        nombre: 'Bioluminiscente', fondo: '#dbfff3', ojos: '#0e3a33', piel: '#dbfff3',
        rubor: '#ff7fb2', acento: '#22d9a8', escena: '#f9fffd', adornos: ['aura', 'luces'],
      },
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
