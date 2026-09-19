/* Cuánto tarda en aparecer algo, con red y sin red. docs/sin-red.md dice
 * "menos de 100 ms": a ver si es cierto. */
import { chromium } from 'playwright';
import { preparar } from './preparar.mjs';
const BASE = process.env.BASE_URL || 'http://localhost:8090';
const a = await preparar({ BASE, persona: 'brote', nombre: 'Monsterita' });
const br = await chromium.launch();
const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await ctx.addInitScript((t) => { localStorage.setItem('rootkit:token', t); }, a.token);
const p = await ctx.newPage();
await p.goto(`${BASE}/#hoy`, { waitUntil: 'networkidle' });
await p.waitForTimeout(2500);

const medir = async (etiqueta) => {
  await p.reload({ waitUntil: 'networkidle' }).catch(() => {});
  await p.waitForTimeout(1500);
  const m = await p.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const fcp = performance.getEntriesByName('first-contentful-paint')[0];
    const pintadas = performance.getEntriesByType('paint').map((e) => `${e.name} ${Math.round(e.startTime)}`);
    return {
      fcp: fcp ? Math.round(fcp.startTime) : null,
      domInteractivo: Math.round(nav.domInteractive),
      cargado: Math.round(nav.loadEventEnd),
      pintadas,
    };
  });
  console.log(`${etiqueta}: primera pintada ${m.fcp} ms · DOM ${m.domInteractivo} ms · cargado ${m.cargado} ms`);
};
await medir('con red   ');
await ctx.setOffline(true);
await medir('sin red   ');
await fetch(`${BASE}/api/cuenta`, { method: 'DELETE', headers: { 'content-type': 'application/json', authorization: `Bearer ${a.token}` }, body: JSON.stringify({ clave: 'una clave segura' }) }).catch(() => {});
await br.close();
