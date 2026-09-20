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
    idx: 0, id: 'kip', nombre: 'Kip', carcasa: 'carcasas/kip.stl',
    lema: 'Si sale mal, por lo menos sale rápido.',
    pieles: {
      comun: {
        nombre: 'Naranja Piloto', fondo: '#faa307', ojos: '#03071e', piel: '#faa307',
        rubor: '#ff4d4d', acento: '#d00000', escena: '#feeed2', adornos: [],
      },
      raro: {
        nombre: 'Ascua', fondo: '#ffba08', ojos: '#03071e', piel: '#ffba08',
        rubor: '#ff4d4d', acento: '#d00000', escena: '#fff3d3', adornos: ['brillos'],
      },
      epico: {
        nombre: 'Llamarada', fondo: '#ffba08', ojos: '#03071e', piel: '#ffba08',
        rubor: '#d00000', acento: '#d00000', escena: '#fff3d3', adornos: ['brillos'],
      },
    },
  },
  {
    idx: 1, id: 'nori', nombre: 'Nori', carcasa: 'carcasas/nori.stl',
    lema: 'Lo estás haciendo bien. Por ahora.',
    pieles: {
      comun: {
        nombre: 'Azul Marea', fondo: '#b8d0ea', ojos: '#023e7d', piel: '#b8d0ea',
        rubor: '#0466c8', acento: '#023e7d', escena: '#f2f7fb', adornos: [],
      },
      raro: {
        nombre: 'Acero', fondo: '#cbdef2', ojos: '#023e7d', piel: '#cbdef2',
        rubor: '#0353a4', acento: '#979dac', escena: '#f6f9fd', adornos: [],
      },
      epico: {
        nombre: 'Cristal', fondo: '#cbdef2', ojos: '#023e7d', piel: '#cbdef2',
        rubor: '#0466c8', acento: '#0353a4', escena: '#f6f9fd', adornos: ['brillos'],
      },
    },
  },
  {
    idx: 2, id: 'blink', nombre: 'Blink', carcasa: 'carcasas/blink.stl',
    lema: '¡Todo increíble! ¿Cuál era el problema?',
    pieles: {
      comun: {
        nombre: 'Sol', fondo: '#ffe169', ojos: '#6b4a0b', piel: '#ffe169',
        rubor: '#edc531', acento: '#c9a227', escena: '#fffae4', adornos: [],
      },
      raro: {
        nombre: 'Mostaza', fondo: '#fad643', ojos: '#6b4a0b', piel: '#fad643',
        rubor: '#edc531', acento: '#c9a227', escena: '#fef8dd', adornos: ['brillos'],
      },
      epico: {
        nombre: 'Oro Real', fondo: '#ffe169', ojos: '#6b4a0b', piel: '#ffe169',
        rubor: '#edc531', acento: '#c9a227', escena: '#fffae4', adornos: ['corona'],
      },
    },
  },
  {
    idx: 3, id: 'plum', nombre: 'Plum', carcasa: 'carcasas/plum.stl',
    lema: 'Te extrañó, y estuviste todo el tiempo acá.',
    pieles: {
      comun: {
        nombre: 'Malva', fondo: '#e0aaff', ojos: '#10002b', piel: '#e0aaff',
        rubor: '#c77dff', acento: '#5a189a', escena: '#f9f0ff', adornos: [],
      },
      raro: {
        nombre: 'Amatista', fondo: '#c77dff', ojos: '#10002b', piel: '#c77dff',
        rubor: '#9d4edd', acento: '#5a189a', escena: '#f5e8ff', adornos: ['brillos', 'aura'],
      },
      epico: {
        nombre: 'Nocturna', fondo: '#c77dff', ojos: '#10002b', piel: '#c77dff',
        rubor: '#e0aaff', acento: '#7b2cbf', escena: '#f5e8ff', adornos: ['aura', 'luces'],
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
