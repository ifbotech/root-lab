/* Cuánto trabaja la app quieta. En un teléfono, trabajo es batería. */
import { chromium } from 'playwright';
import { preparar } from './preparar.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:8090';
const a = await preparar({ BASE, persona: 'brote', nombre: 'Monsterita' });
await a.demo('tres-dias');
for (const [persona, nombre] of [['champi', 'Pinchudo'], ['musgo', 'Musguito'], ['bulbo', 'Bulbito']]) {
  await preparar({ BASE, persona, nombre, token: a.token });
}

const br = await chromium.launch();
const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await ctx.addInitScript((t) => { localStorage.setItem('rootkit:token', t); }, a.token);
const p = await ctx.newPage();
const cdp = await ctx.newCDPSession(p);
await cdp.send('Performance.enable');

const metrica = async (nombre) => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));

const medir = async (titulo, hash, segundos = 6) => {
  await p.goto(`${BASE}/#${hash}`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(2500);
  const antes = await metrica();
  const t0 = Date.now();
  await p.waitForTimeout(segundos * 1000);
  const despues = await metrica();
  const reales = (Date.now() - t0) / 1000;
  const cpu = ((despues.TaskDuration - antes.TaskDuration) / reales) * 100;
  const script = ((despues.ScriptDuration - antes.ScriptDuration) / reales) * 100;
  const pintado = (((despues.LayoutDuration - antes.LayoutDuration) + (despues.RecalcStyleDuration - antes.RecalcStyleDuration)) / reales) * 100;
  const lienzos = await p.evaluate(() => document.querySelectorAll('canvas').length);
  console.log(`${titulo.padEnd(22)} cpu ${cpu.toFixed(1).padStart(5)} %  (script ${script.toFixed(1)} %, estilo+layout ${pintado.toFixed(1)} %) · ${lienzos} lienzos · ${Math.round(despues.JSHeapUsedSize / 1e6)} MB`);
};

await medir('Hoy (4 caras)', 'hoy');
await medir('Plantas (4 filas)', 'plantas');
await medir('Ficha', `planta/${a.planta.id}`);
await medir('Invernadero (4)', 'invernadero');
await medir('Colección', 'coleccion');
await medir('Ajustes', 'ajustes');

/* Con la pestaña en segundo plano no tendría que hacer nada. */
await p.goto(`${BASE}/#hoy`, { waitUntil: 'networkidle' });
await p.waitForTimeout(2000);
const otra = await ctx.newPage();
await otra.goto('about:blank');
await otra.bringToFront();
const antes = await metrica();
await otra.waitForTimeout(6000);
const despues = await metrica();
console.log(`escondida               cpu ${(((despues.TaskDuration - antes.TaskDuration) / 6) * 100).toFixed(1)} %`);

await fetch(`${BASE}/api/cuenta`, {
  method: 'DELETE',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${a.token}` },
  body: JSON.stringify({ clave: 'una clave segura' }),
});
await br.close();
