/* Una vuelta por toda la app, en teléfono, para mirarla con ojo crítico. */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { preparar } from './preparar.mjs';

/* Al lado de este archivo, no donde esté parada la terminal. */
const S = fileURLToPath(new URL('capturas/', import.meta.url));
mkdirSync(S, { recursive: true });
const BASE = process.env.BASE_URL || 'http://localhost:8090';
const errs = [];

const a = await preparar({ persona: 'brote', nombre: 'Monsterita' });
await a.demo('tres-dias');
const b = await preparar({ persona: 'champi', nombre: 'Pinchudo', token: a.token });
await b.sync({ estado: 'ACTIVO', lecturas: [{ hace: 0, suelo: 14, temp: 265, hr: 30, lux: 200, animo: 'THIRSTY', sev: 'URGENT' }] });
console.log('plantas listas:', a.planta.id, b.planta.id);

const br = await chromium.launch();
const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
await ctx.addInitScript((t) => { localStorage.setItem('rootkit:token', t); localStorage.setItem('rootlab:modo', 'dia'); }, a.token);
const p = await ctx.newPage();
p.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errs.push(`${m.type()}: ${m.text()}`); });
p.on('pageerror', (e) => errs.push(`PAGEERROR ${e.message}`));
p.on('response', (r) => { if (r.status() >= 400) errs.push(`HTTP ${r.status()} ${r.url()}`); });

const ver = async (hash, nombre, espera = '') => {
  await p.goto(`${BASE}/#${hash}`, { waitUntil: 'networkidle' });
  if (espera) await p.waitForSelector(espera, { timeout: 15000 }).catch(() => errs.push(`no apareció ${espera} en ${hash}`));
  await p.waitForTimeout(1400);
  await p.screenshot({ path: `${S}/${nombre}.png`, fullPage: true });
  const alto = await p.evaluate(() => document.documentElement.scrollHeight);
  const ancho = await p.evaluate(() => document.documentElement.scrollWidth);
  console.log(`${nombre}: ${ancho}x${alto}${ancho > 390 ? '  <-- SCROLL HORIZONTAL' : ''}`);
};

await ver('hoy', '01-hoy');
await ver('plantas', '02-plantas');
await ver(`planta/${a.planta.id}`, '03-ficha', '.panel-mascota');
await ver(`planta/${b.planta.id}`, '04-ficha-urgente', '.panel-mascota');
await ver('invernadero', '05-invernadero');
await ver('coleccion', '06-coleccion');
await ver('ajustes', '07-ajustes');
await ver('cuenta', '08-cuenta');
await ver(`chat/${a.planta.id}`, '09-chat');
await ver(`album/${a.planta.id}`, '10-album');
await ver(`calibrar/${a.planta.id}`, '11-calibrar');
await ver(`botanica/${a.planta.id}`, '12-botanica');
await ver(`pasaporte/${a.planta.id}`, '13-pasaporte');
await ver('agregar', '14-agregar');

console.log(errs.length ? `ERRORES:\n${errs.join('\n')}` : 'consola limpia');
await br.close();
