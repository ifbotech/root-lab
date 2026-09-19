/* Los bytes que de verdad pasan por el cable, contados con CDP
 * (encodedDataLength es 0 cuando la respuesta salió del caché). */
import { chromium } from 'playwright';
import { preparar } from './preparar.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:8090';
const a = await preparar({ persona: 'brote', nombre: 'Monsterita' });
await a.demo('tres-dias');

const br = await chromium.launch();
const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await ctx.addInitScript((t) => { localStorage.setItem('rootkit:token', t); }, a.token);
const p = await ctx.newPage();
const cdp = await ctx.newCDPSession(p);
await cdp.send('Network.enable');

let bytes = 0; let pedidos = 0; let deCache = 0; const estados = new Map();
cdp.on('Network.responseReceived', (e) => {
  estados.set(e.response.status, (estados.get(e.response.status) || 0) + 1);
  if (e.response.fromDiskCache || e.response.fromPrefetchCache) deCache += 1;
});
cdp.on('Network.loadingFinished', (e) => { pedidos += 1; bytes += e.encodedDataLength; });
const resumen = (t) => {
  const est = [...estados.entries()].sort().map(([k, v]) => `${k}:${v}`).join(' ');
  console.log(`${t}: ${pedidos} pedidos, ${(bytes / 1024).toFixed(1)} KB por el cable, ${deCache} del caché · ${est}`);
  bytes = 0; pedidos = 0; deCache = 0; estados.clear();
};

await p.goto(`${BASE}/#hoy`, { waitUntil: 'networkidle' });
await p.waitForTimeout(2000);
resumen('primera carga');

await p.reload({ waitUntil: 'networkidle' });
await p.waitForTimeout(2000);
resumen('segunda carga ');

await p.waitForTimeout(32000);
resumen('dos refrescos ');

await br.close();
