/* particulas.mjs — los corazones que suben cuando acariciás a tu Rooti.
 *
 * Unos pocos elementos que flotan, giran y se desvanecen con la Web
 * Animations API y se sacan solos al terminar. Sin canvas ni bucle propio:
 * el navegador los compone en la GPU y la cara sigue dibujándose a su
 * ritmo. Los colores son de la paleta (tokens); las formas, tres: corazón,
 * hoja y la burbuja de la esponja (un círculo de CSS). Con "menos movimiento" activado no aparecen.
 */
import { icono } from './ui.mjs';

export const FORMAS = ['corazon', 'corazon', 'hoja'];
export const COLORES = ['var(--acento-texto)', 'var(--urgente-texto)', 'var(--primario-texto)'];

const menosMovimiento = () => typeof window !== 'undefined'
  && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Los cuadros de una partícula que sale de (0,0) hacia arriba, con azar:
 *  aparece enseguida, sube entera la mayor parte del viaje y se va al final. */
export function trayectoria(al = Math.random) {
  const dx = (al() - 0.5) * 90;
  const giro = (al() - 0.5) * 70;
  const paso = (k, y, escala, op) => ({
    transform: `translate(calc(-50% + ${(dx * k).toFixed(0)}px), calc(-50% - ${y}px)) scale(${escala}) rotate(${(giro * k).toFixed(0)}deg)`,
    opacity: op,
  });
  return {
    cuadros: [
      paso(0, 0, 0.5, 0),
      { ...paso(0.15, 14, 1.05, 1), offset: 0.15 },
      { ...paso(0.7, 70, 1, 1), offset: 0.7 },
      paso(1, 120, 0.85, 0),
    ],
    duracion: 1300 + Math.round(al() * 600),
  };
}

/**
 * Suelta `cantidad` partículas desde (x, y), relativas al `contenedor`
 * (que tiene que tener position: relative o fixed).
 */
export function soltarParticulas(contenedor, { x, y, cantidad = 5, al = Math.random, formas = FORMAS } = {}) {
  if (!contenedor || menosMovimiento()) return 0;
  for (let i = 0; i < cantidad; i++) {
    const forma = formas[Math.floor(al() * formas.length)];
    const el = document.createElement('span');
    el.className = forma === 'burbuja' ? 'particula burbuja' : 'particula';
    el.style.left = `${Math.round(x + (al() - 0.5) * 30)}px`;
    el.style.top = `${Math.round(y + (al() - 0.5) * 20)}px`;
    el.style.color = COLORES[Math.floor(al() * COLORES.length)];
    if (forma === 'burbuja') {
      const lado = 8 + Math.round(al() * 12);
      el.style.width = `${lado}px`;
      el.style.height = `${lado}px`;
    } else {
      el.append(icono(forma, 18 + Math.round(al() * 12)));
    }
    contenedor.append(el);
    const { cuadros, duracion } = trayectoria(al);
    if (typeof el.animate === 'function') {
      const a = el.animate(cuadros, { duration: duracion, easing: 'cubic-bezier(.25,.5,.5,1)', fill: 'forwards' });
      a.onfinish = () => el.remove();
      a.oncancel = () => el.remove();
    } else {
      setTimeout(() => el.remove(), duracion);
    }
  }
  return cantidad;
}
