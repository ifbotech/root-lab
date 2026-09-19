/* El emulador: que levante, que dibuje la cara con el firmware real y que
 * "Probar lo nuevo" siga andando después de tocar el servidor. */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

/* Al lado de este archivo, no donde esté parada la terminal. */
const CAPTURAS = fileURLToPath(new URL('capturas/', import.meta.url));
mkdirSync(CAPTURAS, { recursive: true });
const BASE = process.env.BASE_URL || 'http://localhost:8090';
const errs = [];
const bien = (t, ok, extra = '') => { console.log(`${ok ? '✔' : '✖'} ${t}${extra ? ` — ${extra}` : ''}`); if (!ok) errs.push(t); };

const br = await chromium.launch();
const ctx = await br.newContext({ viewport: { width: 1200, height: 950 } });
const p = await ctx.newPage();
p.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errs.push(`consola: ${m.text()}`); });
p.on('pageerror', (e) => errs.push(`PAGEERROR ${e.message}`));

await p.goto(`${BASE}/emulador/`, { waitUntil: 'networkidle' });
await p.waitForTimeout(3000);

bien('el emulador levanta', await p.locator('canvas').first().isVisible());
const lienzos = await p.locator('canvas').count();
bien('dibuja la pantalla del Rooti', lienzos >= 1, `${lienzos} lienzos`);

/* La cara tiene que tener color: un lienzo en negro es el wasm que no cargó. */
const pintado = await p.evaluate(() => {
  const c = document.querySelector('canvas');
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  const colores = new Set();
  for (let i = 0; i < d.length; i += 4 * 97) colores.add(`${d[i]},${d[i + 1]},${d[i + 2]}`);
  return colores.size;
});
bien('la cara está pintada, no en negro', pintado > 3, `${pintado} colores`);

/* El panel de pruebas. */
const probar = p.locator('#d-fw, #s-persona').first();
bien('el panel de control está', await probar.count() > 0);

await p.selectOption('#s-persona', 'champi').catch(() => errs.push('no pude cambiar de Rooti'));
await p.waitForTimeout(1500);
await p.screenshot({ path: join(CAPTURAS, 'emulador.png') });

const fw = (await p.textContent('#d-fw').catch(() => '')) || '';
bien('dice qué firmware corre', /\d+\.\d+\.\d+/.test(fw), fw.trim());

console.log(errs.length ? `\nFALLAS:\n${errs.join('\n')}` : '\nel emulador anda, consola limpia');
await br.close();
