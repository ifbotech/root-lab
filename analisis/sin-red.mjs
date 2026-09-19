/* Sin red: que la app abra igual, muestre lo último que vio, deje hacer y
 * mande los cambios cuando vuelve. Es lo que promete docs/sin-red.md. */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { preparar } from './preparar.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:8090';
const errs = [];
const bien = (t, ok, extra = '') => { console.log(`${ok ? '✔' : '✖'} ${t}${extra ? ` — ${extra}` : ''}`); if (!ok) errs.push(t); };

const a = await preparar({ BASE, persona: 'brote', nombre: 'Monsterita' });
await a.demo('tres-dias');

const br = await chromium.launch();
const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
await ctx.addInitScript((t) => { localStorage.setItem('rootkit:token', t); }, a.token);
const p = await ctx.newPage();
p.on('pageerror', (e) => errs.push(`PAGEERROR ${e.message}`));

/* Una visita normal, para que quede guardado lo que vio. */
await p.goto(`${BASE}/#hoy`, { waitUntil: 'networkidle' });
await p.waitForTimeout(2500);
await p.goto(`${BASE}/#planta/${a.planta.id}`, { waitUntil: 'networkidle' });
await p.waitForSelector('.panel-mascota', { timeout: 20000 });
await p.waitForTimeout(1500);

/* Se corta la red. */
await ctx.setOffline(true);
const t0 = Date.now();
await p.reload({ waitUntil: 'domcontentloaded' });
await p.waitForSelector('.vista', { timeout: 15000 }).catch(() => {});
await p.waitForTimeout(2500);
const tardo = Date.now() - t0;
const texto = (await p.textContent('main')).replace(/\s+/g, ' ');
bien('sin red la app abre igual', texto.includes('Monsterita'), `${tardo} ms`);
bien('y avisa que está sin conexión', (await p.textContent('#barra-der')).includes('Sin conexión'));
await p.screenshot({ path: join(CAPTURAS, 'sinred-ficha.png'), fullPage: true });

/* Navegar entre pantallas sin red. */
await p.goto(`${BASE}/#hoy`, { waitUntil: 'domcontentloaded' }).catch(() => {});
await p.waitForTimeout(2000);
bien('se puede navegar a Hoy', (await p.textContent('main')).includes('Monsterita'));

/* Un cambio que se puede repetir sin daño: renombrar. */
await p.goto(`${BASE}/#planta/${a.planta.id}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
await p.waitForSelector('.panel-mascota', { timeout: 15000 }).catch(() => {});
await p.waitForTimeout(1200);
p.once('dialog', (d) => d.accept('Monsterita Offline'));
await p.click('button:has-text("Renombrar")');
await p.waitForTimeout(1500);
const cola = await p.textContent('#barra-der');
bien('el cambio queda en la cola', /por mandar/.test(cola), cola.replace(/\s+/g, ' ').trim());

/* Vuelve la red. */
await ctx.setOffline(false);
await p.evaluate(() => window.dispatchEvent(new Event('online')));
await p.waitForTimeout(4000);
const despues = await p.textContent('#barra-der');
bien('la cola se vacía sola', !/por mandar/.test(despues), despues.replace(/\s+/g, ' ').trim() || '(vacía)');

const enElServidor = await (await fetch(`${BASE}/api/estado`, { headers: { authorization: `Bearer ${a.token}` } })).json();
bien('y el cambio llegó al servidor', enElServidor.nodes[0].nombre === 'Monsterita Offline', enElServidor.nodes[0].nombre);

await fetch(`${BASE}/api/cuenta`, {
  method: 'DELETE',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${a.token}` },
  body: JSON.stringify({ clave: 'una clave segura' }),
});
console.log(errs.length ? `\nFALLAS:\n${errs.join('\n')}` : '\nla app anda sin red');
await br.close();
