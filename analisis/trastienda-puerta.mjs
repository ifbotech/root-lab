/* Entrar a la trastienda con el código del email, y el ABM de cuentas. */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { preparar } from './preparar.mjs';

/* Al lado de este archivo, no donde esté parada la terminal. */
const CAPTURAS = fileURLToPath(new URL('capturas/', import.meta.url));
mkdirSync(CAPTURAS, { recursive: true });
const BASE = process.env.BASE_URL || 'http://localhost:8090';
/* Dónde deja el servidor local los emails como .eml: por defecto `data/correos`
   del repositorio, que es lo que usa `npm start`. */
const CORREOS = process.env.CORREOS || '../data/correos';
const DUENIO = process.env.ADMIN_EMAIL || 'duenio@ejemplo.com';
const errs = [];
const bien = (t, ok, extra = '') => { console.log(`${ok ? '✔' : '✖'} ${t}${extra ? ` — ${extra}` : ''}`); if (!ok) errs.push(t); };

/* Dos cuentas de gente común, para que el ABM tenga algo. */
const a = await preparar({ BASE, persona: 'brote', nombre: 'Monsterita' });
await preparar({ BASE, persona: 'musgo', nombre: 'Musguito' });

/** El último código que se mandó por correo (el servidor los deja en .eml). */
const ultimoCodigo = () => {
  const archivos = readdirSync(CORREOS).map((f) => ({ f, t: readFileSync(join(CORREOS, f), 'utf8') }))
    .filter((x) => /trastienda/i.test(x.t));
  const texto = archivos.at(-1)?.t || '';
  const m = texto.match(/Tu c=C3=B3digo es: (\d{6})/) || texto.match(/Tu código es: (\d{6})/) || texto.match(/(\d{6}) es tu c/);
  return m?.[1] || null;
};

const br = await chromium.launch();
const ctx = await br.newContext({ viewport: { width: 1280, height: 1000 } });
const p = await ctx.newPage();
p.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errs.push(`consola: ${m.text()}`); });
p.on('pageerror', (e) => errs.push(`PAGEERROR ${e.message}`));

await p.goto(`${BASE}/admin/`, { waitUntil: 'networkidle' });
await p.waitForTimeout(700);
bien('la puerta pide el email', await p.locator('#form-email').isVisible() && !(await p.locator('#form-codigo').isVisible()));
await p.screenshot({ path: join(CAPTURAS, '01-email.png') });

/* Un email que no administra: la respuesta es la misma, y no llega nada. */
await p.fill('#email', 'cualquiera@ejemplo.com');
await p.click('#form-email button[type=submit]');
await p.waitForTimeout(900);
bien('con un email cualquiera contesta igual', await p.locator('#form-codigo').isVisible());
bien('pero no manda ningún código', ultimoCodigo() === null);

await p.click('#b-otro-email');
await p.fill('#email', DUENIO);
await p.click('#form-email button[type=submit]');
await p.waitForTimeout(1200);
const codigo = ultimoCodigo();
bien('al administrador le llega un código de seis dígitos', /^\d{6}$/.test(codigo || ''), codigo || 'ninguno');
await p.screenshot({ path: join(CAPTURAS, '02-codigo.png') });

/* Un código equivocado. */
await p.fill('#codigo', '000000');
await p.click('#form-codigo button[type=submit]');
await p.waitForTimeout(900);
bien('un código equivocado no entra', await p.locator('#error-entrar').isVisible(), (await p.textContent('#error-entrar')).trim());

await p.fill('#codigo', codigo);
await p.click('#form-codigo button[type=submit]');
await p.waitForSelector('#app:not([hidden])', { timeout: 15000 });
await p.waitForTimeout(2000);
bien('con el código correcto se entra', await p.locator('.pestana[aria-current=true]').isVisible());

/* La pestaña de cuentas. */
await p.click('.pestana[data-vista="cuentas"]');
await p.waitForTimeout(2000);
const texto = (await p.textContent('#vista')).replace(/\s+/g, ' ');
bien('se ven las cuentas con su email', texto.includes('@ejemplo.com'));
bien('y quién entra a la trastienda', texto.includes(DUENIO) && texto.includes('ROOTLAB_ADMINS'));
await p.screenshot({ path: join(CAPTURAS, '03-cuentas.png'), fullPage: true });

/* Dar admin a alguien. */
const fila = p.locator('tbody tr', { hasText: 'prueba-' }).first();
await fila.locator('button:has-text("Hacer admin")').click();
await p.waitForTimeout(1600);
bien('se puede dar el rol de admin', (await p.textContent('#vista')).includes('admin'));

/* Crear un token de agente. */
p.once('dialog', (d) => d.accept('agente-infra'));
await p.click('button:has-text("Crear un token de agente")');
await p.waitForTimeout(1600);
const tokenVisible = await p.locator('textarea').first().inputValue().catch(() => '');
bien('el token del agente se muestra una vez', /^agt_[0-9a-f]{48}$/.test(tokenVisible.trim()), tokenVisible.slice(0, 12) + '…');
await p.screenshot({ path: join(CAPTURAS, '04-agente.png'), fullPage: true });

/* Y ese token sólo sirve para el vivero. */
const prueba = await fetch(`${BASE}/api/admin/cuentas`, { headers: { authorization: `Bearer ${tokenVisible.trim()}` } });
const vivero = await fetch(`${BASE}/api/admin/ideas`, { headers: { authorization: `Bearer ${tokenVisible.trim()}` } });
bien('el token del agente no abre las cuentas', prueba.status === 403, `cuentas: ${prueba.status}`);
bien('pero sí el vivero', vivero.status === 200, `vivero: ${vivero.status}`);

await p.click('button:has-text("Listo, lo copié")');
await p.waitForTimeout(800);
await p.click('#b-salir');
await p.waitForTimeout(1000);
bien('al salir vuelve a pedir el email', await p.locator('#form-email').isVisible());

console.log(errs.length ? `\nFALLAS:\n${errs.join('\n')}` : '\nla puerta y el ABM andan, consola limpia');
await br.close();
