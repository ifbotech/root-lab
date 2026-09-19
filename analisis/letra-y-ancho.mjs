/* La app con la letra del sistema agrandada: alguien que no ve de cerca pone
 * el teléfono en "texto grande" y la interfaz tiene que aguantar. */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { preparar } from './preparar.mjs';

/* Al lado de este archivo, no donde esté parada la terminal. */
const CAPTURAS = fileURLToPath(new URL('capturas/', import.meta.url));
mkdirSync(CAPTURAS, { recursive: true });
const BASE = process.env.BASE_URL || 'http://localhost:8090';
const a = await preparar({ BASE, persona: 'brote', nombre: 'Monsterita' });
await a.demo('tres-dias');
await preparar({ BASE, persona: 'champi', nombre: 'Pinchudo', token: a.token });

const br = await chromium.launch();
for (const [etiqueta, px, ancho] of [['320px', 16, 320], ['grande', 24, 360], ['enorme', 32, 360]]) {
  const ctx = await br.newContext({ viewport: { width: ancho, height: 780 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await ctx.addInitScript(([t, tam]) => {
    localStorage.setItem('rootkit:token', t);
    localStorage.setItem('rootlab:modo', 'dia');
    addEventListener('DOMContentLoaded', () => {
      /* Lo que hace el teléfono cuando se agranda la letra del sistema. */
      document.documentElement.style.fontSize = `${tam}px`;
    });
  }, [a.token, px]);
  const p = await ctx.newPage();
  const problemas = [];
  for (const [nombre, hash] of [['hoy', 'hoy'], ['plantas', 'plantas'], ['ficha', `planta/${a.planta.id}`], ['ajustes', 'ajustes']]) {
    await p.goto(`${BASE}/#${hash}`, { waitUntil: 'networkidle' });
    await p.waitForTimeout(1400);
    const real = await p.evaluate(() => document.documentElement.scrollWidth);
    if (real > ancho + 1) problemas.push(`${nombre}: la página se sale (${real} px de ${ancho})`);
    /* Texto cortado: un elemento cuyo contenido no entra y queda tapado. */
    const cortados = await p.evaluate(() => {
      const malos = [];
      for (const el of document.querySelectorAll('h1,h2,h3,b,span,p,button,dd,dt,label,summary')) {
        const e = getComputedStyle(el);
        if (el.classList.contains('oculto-visual')) continue;
        if (e.overflow === 'hidden' && el.scrollHeight > el.clientHeight + 2 && el.clientHeight > 0) {
          malos.push(`${el.className || el.tagName}: "${(el.textContent || '').trim().slice(0, 30)}"`);
        }
        if (el.getBoundingClientRect().right > innerWidth + 1 && el.clientWidth > 0) {
          malos.push(`fuera de pantalla → ${el.className || el.tagName}: "${(el.textContent || '').trim().slice(0, 30)}"`);
        }
      }
      return [...new Set(malos)].slice(0, 6);
    });
    for (const c of cortados) problemas.push(`${nombre}: ${c}`);
    await p.screenshot({ path: `cap-letra/${etiqueta}-${nombre}.png`, fullPage: true });
  }
  console.log(`\nletra ${etiqueta} (${px}px):`);
  if (!problemas.length) console.log('  todo entra');
  for (const x of problemas) console.log(`  · ${x}`);
  await ctx.close();
}
await br.close();
