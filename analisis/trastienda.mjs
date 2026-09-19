/* La trastienda en el navegador: entrar, recorrer las cinco pantallas y
 * mover una idea del vivero. */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

/* Al lado de este archivo, no donde esté parada la terminal. */
const CAPTURAS = fileURLToPath(new URL('capturas/', import.meta.url));
mkdirSync(CAPTURAS, { recursive: true });
const BASE = process.env.BASE_URL || 'http://localhost:8090';
const CLAVE = process.env.ADMIN || 'clave-local-de-administracion-para-pruebas';
const errs = [];
const bien = (t, ok, extra = '') => { console.log(`${ok ? '✔' : '✖'} ${t}${extra ? ` — ${extra}` : ''}`); if (!ok) errs.push(t); };

const br = await chromium.launch();
const ctx = await br.newContext({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 1 });
const p = await ctx.newPage();
p.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errs.push(`consola: ${m.text()}`); });
p.on('pageerror', (e) => errs.push(`PAGEERROR ${e.message}`));
p.on('response', (r) => { if (r.status() >= 400 && r.status() !== 401) errs.push(`HTTP ${r.status()} ${r.url()}`); });

await p.goto(`${BASE}/admin/`, { waitUntil: 'networkidle' });
await p.waitForTimeout(800);
bien('sin clave sólo se ve la puerta', await p.locator('#puerta').isVisible() && !(await p.locator('#app').isVisible()));
await p.screenshot({ path: join(CAPTURAS, '00-puerta.png') });

/* Clave equivocada. */
await p.fill('#clave', 'no es');
await p.click('#form-entrar button[type=submit]');
await p.waitForTimeout(900);
bien('una clave equivocada no entra', await p.locator('#error-entrar').isVisible(), (await p.textContent('#error-entrar')).trim());

await p.fill('#clave', CLAVE);
await p.click('#form-entrar button[type=submit]');
await p.waitForSelector('#app:not([hidden])', { timeout: 15000 });
await p.waitForTimeout(2000);
bien('con la clave se entra', await p.locator('.pestana[aria-current=true]').isVisible());

const mirar = async (vista, nombre, espera) => {
  await p.click(`.pestana[data-vista="${vista}"]`);
  await p.waitForTimeout(1800);
  const texto = (await p.textContent('#vista')).replace(/\s+/g, ' ');
  bien(`${vista}: ${espera}`, texto.includes(espera), texto.slice(0, 90));
  await p.screenshot({ path: `cap-admin/${nombre}.png`, fullPage: true });
};

await mirar('resumen', '01-resumen', 'salidos de fábrica');
await mirar('flota', '02-flota', 'Por lote');
await mirar('firmware', '03-firmware', 'Quién corre qué');
await mirar('uso', '04-uso', 'El alta, paso por paso');
await mirar('vivero', '05-vivero', 'sin decidir');

/* Mover una idea: de "sin decidir" a "en curso". */
const antes = await p.locator('.idea').count();
await p.locator('.idea').first().locator('button:has-text("En curso")').click();
await p.waitForTimeout(1600);
const enCurso = await p.locator('.idea .marca:has-text("en curso")').count();
bien('una idea se puede mover', enCurso >= 1, `${antes} ideas, ${enCurso} en curso`);

/* Filtrar por área. */
await p.selectOption('#f-area', 'firmware');
await p.waitForTimeout(1500);
const soloFw = await p.locator('.idea').count();
bien('el filtro por área anda', soloFw >= 1 && soloFw < antes, `${soloFw} de ${antes}`);
await p.screenshot({ path: join(CAPTURAS, '06-vivero-filtrado.png'), fullPage: true });

/* Anotar una a mano. */
await p.selectOption('#f-area', '');
await p.waitForTimeout(1200);
await p.click('button:has-text("Anotar una idea")');
await p.waitForTimeout(600);
await p.fill('input[placeholder^="Qué mejorar"]', 'Probar la trastienda desde el teléfono');
await p.fill('textarea', 'Escrita desde la prueba automática.');
await p.click('button:has-text("Anotar")');
await p.waitForTimeout(1800);
bien('se puede anotar una idea a mano', (await p.textContent('#vista')).includes('Probar la trastienda desde el teléfono'));

/* Salir. */
await p.click('#b-salir');
await p.waitForTimeout(1200);
bien('al salir vuelve la puerta', await p.locator('#puerta').isVisible());

console.log(errs.length ? `\nFALLAS:\n${errs.join('\n')}` : '\nla trastienda anda, consola limpia');
await br.close();
