/* cofre.mjs — la ceremonia de abrir el cofre.
 *
 * Es el momento en que el Rooti deja de ser un aparato y pasa a ser
 * alguien, y por eso se toma su tiempo: tres toques, cada uno más fuerte,
 * y recién al tercero se abre. El pedido al servidor sale en ese tercer
 * toque y no antes, porque en el mismo instante en que la nube registra el
 * cofre abierto, la maceta de verdad —la que está en la mesa— se entera en
 * su próxima consulta (cada 3 s) y abre los ojos. Adelantar el pedido haría
 * que la maceta se despierte antes que el cofre del teléfono, y el truco es
 * que pasen juntos.
 *
 * QUÉ SORTEA
 *
 * El cofre NO decide qué Rooti es: eso lo dice la figura (sale de fábrica
 * con su personaje) y la app lo reconoce desde el QR, antes del cofre
 * ("¡Conectaste a tu Brote!"). Lo que sortea es la PIEL: común (70 %),
 * rara (25 %) o épica (5 %). La nube guarda la rareza y la manda en el
 * sync; la maceta se pinta con esa paleta al abrir los ojos.
 *
 * Lo que sale es el Rooti entero (lib/cuerpo.mjs) con la animación de
 * despertar del firmware en la ventana de su pantalla, y la app se pinta con
 * los colores de la piel: un círculo que crece desde el cofre (`alPintar`,
 * ver lib/tema.mjs).
 */
import { h, render } from '../lib/ui.mjs';
import { cuerpo } from '../lib/cuerpo.mjs';
import { pielDe } from '../lib/rooties.mjs';

/* Cómo se festeja cada rareza. El confeti de la común y la rara usa los
   colores de la piel que salió; la épica, además, oro. */
export const RAREZA = {
  comun: { texto: 'COMÚN', clase: 'comun', oro: false },
  raro: { texto: 'RARA', clase: 'raro', oro: false },
  epico: { texto: 'ÉPICA', clase: 'epico', oro: true },
};

/** Los colores del confeti para una piel. */
export function coloresConfeti(piel, rareza) {
  const base = [piel?.fondo, piel?.piel, piel?.rubor, piel?.ojos, '#ffffff'].filter(Boolean);
  return RAREZA[rareza]?.oro ? [...base, '#ffd54f', '#ffb300', '#fff8e1'] : base;
}

function svgCofre() {
  const ns = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs, ...hijos) => {
    const e = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    hijos.forEach((x) => e.append(x));
    return e;
  };
  return el('svg', { viewBox: '0 0 240 210', class: 'cofre-svg', 'aria-hidden': 'true' },
    el('ellipse', { cx: 120, cy: 196, rx: 92, ry: 10, fill: 'rgba(0,0,0,.35)' }),
    /* cuerpo */
    el('rect', { x: 28, y: 96, width: 184, height: 96, rx: 16, fill: '#8a4a22' }),
    el('rect', { x: 28, y: 96, width: 184, height: 70, rx: 16, fill: '#a85a2a' }),
    el('rect', { x: 28, y: 96, width: 184, height: 12, fill: '#ffc800' }),
    el('rect', { x: 48, y: 96, width: 18, height: 96, fill: '#ffc800' }),
    el('rect', { x: 174, y: 96, width: 18, height: 96, fill: '#ffc800' }),
    el('rect', { x: 48, y: 150, width: 18, height: 42, fill: '#d9a200' }),
    el('rect', { x: 174, y: 150, width: 18, height: 42, fill: '#d9a200' }),
    /* tapa */
    el('g', { class: 'tapa' },
      el('path', { d: 'M24 100 V72 Q24 28 120 28 Q216 28 216 72 V100 Z', fill: '#b8662f' }),
      el('path', { d: 'M40 70 Q44 42 120 40 Q196 42 200 70', fill: 'none', stroke: 'rgba(255,255,255,.25)', 'stroke-width': 8, 'stroke-linecap': 'round' }),
      el('path', { d: 'M48 100 V60 Q52 38 66 34 V100 Z', fill: '#ffc800' }),
      el('path', { d: 'M192 100 V60 Q188 38 174 34 V100 Z', fill: '#ffc800' }),
      el('rect', { x: 24, y: 92, width: 192, height: 12, rx: 4, fill: '#ffc800' }),
      el('rect', { x: 24, y: 100, width: 192, height: 4, fill: '#d9a200' })),
    /* cerradura */
    el('rect', { x: 100, y: 82, width: 40, height: 44, rx: 10, fill: '#ffc800', stroke: '#d9a200', 'stroke-width': 4 }),
    el('circle', { cx: 120, cy: 100, r: 6, fill: '#5a2e12' }),
    el('rect', { x: 117, y: 102, width: 6, height: 12, rx: 3, fill: '#5a2e12' }),
    /* brillo */
    el('path', { d: 'M196 18 l4 10 10 4 -10 4 -4 10 -4 -10 -10 -4 10 -4 Z', fill: '#fff', opacity: '.9' }));
}

function lanzarConfeti(colores) {
  const c = h('canvas', { class: 'confeti', 'aria-hidden': 'true' });
  document.body.append(c);
  const ctx = c.getContext('2d');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = innerWidth * dpr;
  c.height = innerHeight * dpr;
  const piezas = Array.from({ length: 140 }, () => ({
    x: innerWidth / 2 + (Math.random() - 0.5) * 60,
    y: innerHeight * 0.42,
    vx: (Math.random() - 0.5) * 14,
    vy: -Math.random() * 16 - 6,
    r: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.4,
    w: 6 + Math.random() * 8,
    h: 4 + Math.random() * 6,
    color: colores[Math.floor(Math.random() * colores.length)],
  }));
  const t0 = performance.now();
  const paso = (t) => {
    const vida = t - t0;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of piezas) {
      p.vy += 0.45;
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.r += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.globalAlpha = Math.max(0, 1 - vida / 3200);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (vida < 3200) requestAnimationFrame(paso); else c.remove();
  };
  requestAnimationFrame(paso);
}

/**
 * La escena completa. `persona` es el Rooti que ya se sabe cuál es
 * ({ id, nombre }), `abrir()` hace el pedido y devuelve lo que salió;
 * `alSeguir(salida)` se llama cuando el usuario ya lo vio.
 */
export function escenaCofre({ abrir, alSeguir, alPintar = null, probabilidades = null, persona = null }) {
  const escena = h('div', { class: 'cofre-escena' });
  const rayos = h('div', { class: 'rayos', 'aria-hidden': 'true' });
  const toques = h('div', { class: 'cofre-toques', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'));
  const leyenda = h('p', { class: 'alta-texto' }, 'Tocalo tres veces');
  const boton = h('button', { class: 'cofre-boton', type: 'button', 'aria-label': 'Abrir el cofre' }, svgCofre());
  const reconocido = persona
    ? h('div', { class: 'cofre-reconocido' },
        cuerpo({ persona: persona.id, dormido: true, lado: 72, estatico: true, etiqueta: `${persona.nombre}, dormido` }),
        h('p', {}, h('b', {}, `¡Conectaste a tu ${persona.nombre}!`), h('span', {}, 'Su cofre guarda la piel con la que va a despertar.')))
    : null;
  const p = probabilidades || { comun: 700, raro: 250, epico: 50 };
  const odds = h('div', { class: 'probabilidades', 'aria-label': 'Probabilidades de la piel' },
    h('span', { class: 'chip rar-comun' }, 'Común ', h('b', {}, `${Math.round(p.comun / 10)} %`)),
    h('span', { class: 'chip rar-raro' }, 'Rara ', h('b', {}, `${Math.round(p.raro / 10)} %`)),
    h('span', { class: 'chip rar-epico' }, 'Épica ', h('b', {}, `${Math.round(p.epico / 10)} %`)));

  let n = 0;
  let abriendo = false;

  boton.addEventListener('click', async () => {
    if (abriendo) return;
    n += 1;
    [...toques.children].forEach((d, i) => d.classList.toggle('hecho', i < n));
    boton.classList.remove('tiembla-1', 'tiembla-2');
    void boton.offsetWidth;                       /* reinicia la animación */
    navigator.vibrate?.(n < 3 ? 30 * n : [60, 40, 120]);
    if (n < 3) {
      boton.classList.add(n === 1 ? 'tiembla-1' : 'tiembla-2');
      leyenda.textContent = n === 1 ? '¡Otra vez!' : '¡Una más!';
      return;
    }
    abriendo = true;
    boton.classList.add('tiembla-2');
    leyenda.textContent = 'Abriendo…';
    let modelo;
    try {
      [modelo] = await Promise.all([abrir(), new Promise((r) => setTimeout(r, 650))]);
    } catch (e) {
      abriendo = false;
      n = 0;
      [...toques.children].forEach((d) => d.classList.remove('hecho'));
      leyenda.textContent = `No se pudo abrir: ${e.message}. Probá de nuevo.`;
      return;
    }
    revelar(modelo);
  });

  function revelar(m) {
    const r = RAREZA[m.rareza] || RAREZA.comun;
    const piel = m.piel || pielDe(m.id, m.rareza);
    const destello = h('div', { class: `destello activo${r.oro ? ' oro' : ''}`, 'aria-hidden': 'true' });
    document.body.append(destello);
    setTimeout(() => destello.remove(), 800);
    escena.classList.add('abierto', `sale-${r.clase}`);
    lanzarConfeti(coloresConfeti(piel, m.rareza));

    const marco = h('div', { class: 'revelado-escena', style: piel ? `--piel-fondo:${piel.escena}` : '' },
      cuerpo({ persona: m.id, rareza: m.rareza, despertar: true, lado: 220, etiqueta: `${m.nombre} despertando con la piel ${piel?.nombre || ''}` }));
    setTimeout(() => {
      render(escena,
        rayos,
        h('div', { class: 'revelado' },
          marco,
          h('span', { class: `rareza-cinta ${r.clase}` }, `PIEL ${r.texto}`),
          h('h2', {}, m.nombre),
          h('p', { class: 'revelado-piel' }, piel?.nombre || ''),
          h('p', {}, m.lema),
          m.nuevo ? h('span', { class: 'nuevo' }, '¡PIEL NUEVA EN TU COLECCIÓN!') : null,
          m.pinta ? h('p', { class: 'nota' }, `ROOTLAB se pintó con los colores de ${piel?.nombre || m.nombre}.`) : null,
          h('p', { class: 'nota' }, 'Mirá tu Rooti: ya abrió los ojos con estos colores.'),
          h('button', { class: 'boton primario ancho', type: 'button', onClick: () => alSeguir(m) }, `¡Hola, ${m.nombre}!`)));
      if (m.pinta && alPintar) setTimeout(() => alPintar(m, marco), 650);
    }, 420);
  }

  render(escena, rayos, reconocido, boton, toques, leyenda, odds);
  return escena;
}
