/* Accesibilidad de cada pantalla, con axe-core (WCAG 2.1 AA), de día y de
 * noche. Es una herramienta de análisis: vive acá, no en el repo. */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { preparar } from './preparar.mjs';

const AXE = readFileSync('node_modules/axe-core/axe.min.js', 'utf8');
const BASE = process.env.BASE_URL || 'http://localhost:8090';

const CLAVE = 'una clave segura';
const a = await preparar({ BASE, persona: 'brote', nombre: 'Monsterita' });
await a.demo('tres-dias');
await preparar({ BASE, persona: 'champi', nombre: 'Pinchudo', token: a.token });

const br = await chromium.launch();
const total = new Map();

for (const modo of ['dia', 'noche']) {
  const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await ctx.addInitScript(([t, m]) => {
    localStorage.setItem('rootkit:token', t);
    localStorage.setItem('rootlab:modo', m);
    /* Abrir todas las secciones: lo plegado también tiene que estar bien. */
    localStorage.setItem('rootlab:secciones', JSON.stringify({
      'planta-especie': true, 'planta-sensor': true, 'planta-vinculo': true, 'planta-recuerdos': true,
      'planta-cuidador': true, 'planta-botanica': true, 'planta-aparato': true,
      'ajustes-paleta': true, 'ajustes-cuenta': true, 'ajustes-acerca': true,
    }));
  }, [a.token, modo]);
  const p = await ctx.newPage();

  for (const [nombre, hash] of [
    ['hoy', 'hoy'], ['plantas', 'plantas'], ['ficha', `planta/${a.planta.id}`],
    ['invernadero', 'invernadero'], ['coleccion', 'coleccion'], ['ajustes', 'ajustes'],
    ['chat', `chat/${a.planta.id}`], ['album', `album/${a.planta.id}`], ['agregar', 'agregar'],
  ]) {
    await p.goto(`${BASE}/#${hash}`, { waitUntil: 'networkidle' });
    await p.waitForTimeout(1600);
    await p.evaluate(AXE);
    const r = await p.evaluate(async () => window.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] },
    }));
    for (const v of r.violations) {
      const clave = `${v.id} · ${v.impact}`;
      if (!total.has(clave)) total.set(clave, { descripcion: v.help, donde: new Set(), ejemplo: '' });
      const e = total.get(clave);
      e.donde.add(`${modo}/${nombre}`);
      if (!e.ejemplo) e.ejemplo = v.nodes[0]?.html?.slice(0, 120) || '';
    }
  }
  await ctx.close();
}

/* La cuenta de prueba no queda dando vueltas. */
const borrada = await fetch(`${BASE}/api/cuenta`, {
  method: 'DELETE',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${a.token}` },
  body: JSON.stringify({ clave: CLAVE }),
});
console.log(`cuenta de prueba borrada: ${borrada.status}`);

if (!total.size) console.log('sin violaciones de accesibilidad');
for (const [k, v] of [...total].sort()) {
  console.log(`\n${k}\n  ${v.descripcion}\n  en: ${[...v.donde].join(', ')}\n  ej: ${v.ejemplo}`);
}
await br.close();
