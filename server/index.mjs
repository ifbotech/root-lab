/* index.mjs — arranca root-lab.
 *
 *   npm start                     http://localhost:8080
 *   PORT=9000 npm start
 *
 * Sirve desde el mismo proceso:
 *
 *   /             ROOTLAB, la app (public/), instalable como PWA
 *   /v/<CÓDIGO>   la misma app, entrando por el QR de un Rooti
 *   /emulador/    un Rooti virtual para recorrer el flujo sin placa
 *   /api/...      la API de la app y la de los aparatos (server/api.mjs)
 *
 * Todo eso puede ir debajo de una subruta (ROOTLAB_BASE=/rootkit). Ver
 * server/http.mjs y docs/despliegue.md.
 *
 * Configuración por variables de entorno o un archivo .env (ver
 * .env.example). Nada es obligatorio para desarrollar: sin SMTP los emails
 * quedan en data/correos, sin clave de Anthropic la IA es simulada y sin
 * ROOTLAB_SECRETO se genera uno en data/secreto.key.
 */
import { existsSync, readFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { abrirBase } from './db.mjs';
import { crearApi } from './api.mjs';
import { crearIA, probarClaveAnthropic } from './ia.mjs';
import { cargarSecreto, crearCripto, enmascararEmail } from './cripto.mjs';
import { crearClaves } from './claves.mjs';
import { configCorreoDesdeEntorno, crearCorreo } from './correo.mjs';
import { crearPresupuesto, LIMITES_POR_DEFECTO, PRECIOS_POR_DEFECTO } from './presupuesto.mjs';
import { alertaGasto } from './plantillas-correo.mjs';
import { crearPush } from './push.mjs';
import { crearServidorHttp, normalizarBase } from './http.mjs';

const RAIZ = resolve(fileURLToPath(new URL('..', import.meta.url)));

function cargarEnv(archivo) {
  if (!existsSync(archivo)) return;
  for (const linea of readFileSync(archivo, 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}
cargarEnv(join(RAIZ, '.env'));

const PUERTO = Number(process.env.PORT) || 8080;
const HOST = process.env.ROOTLAB_HOST || '0.0.0.0';
const BASE = normalizarBase(process.env.ROOTLAB_BASE);
const DATOS = resolve(RAIZ, process.env.ROOTLAB_DATOS || 'data');
const VERSION = JSON.parse(readFileSync(join(RAIZ, 'package.json'), 'utf8')).version;

/* La URL que va en el QR y que abre el teléfono. En la red de la casa es la
   IP de esta PC; detrás de un proxy HTTPS, la que se configure. */
function ipLocal() {
  for (const lista of Object.values(networkInterfaces())) {
    for (const i of lista || []) {
      if (i.family === 'IPv4' && !i.internal && !i.address.startsWith('169.254.')) return i.address;
    }
  }
  return 'localhost';
}
const URL_PUBLICA = (process.env.ROOTLAB_URL_PUBLICA || `http://${ipLocal()}:${PUERTO}${BASE}`).replace(/\/+$/, '');

const numero = (v, def) => (v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : def);
function jsonDe(nombre, def) {
  if (!process.env[nombre]) return def;
  try { return { ...def, ...JSON.parse(process.env[nombre]) }; } catch {
    console.warn(`${nombre} no es JSON válido: se usan los valores por defecto`);
    return def;
  }
}

const cripto = crearCripto(cargarSecreto({ archivo: join(DATOS, 'secreto.key') }));
const claves = crearClaves(cripto);
const db = abrirBase(join(DATOS, 'rootkit.db'), { cripto });
/* Una clave revocada o mal copiada haría fallar cada foto y cada mensaje:
   mejor arrancar en modo simulado, que la app avisa, y decirlo fuerte en el
   log. Sin red no se desactiva nada. */
let ia = crearIA();
if (ia.proveedor === 'claude' && await probarClaveAnthropic(process.env.ANTHROPIC_API_KEY) === 'invalida') {
  console.error('IA: Anthropic rechaza ANTHROPIC_API_KEY (401). Se usa la IA simulada hasta que se cargue una clave válida.');
  ia = crearIA({ clave: '', motivoSimulada: 'la clave de Anthropic no es válida' });
}
const correo = crearCorreo(configCorreoDesdeEntorno(process.env, DATOS));
const ADMIN = process.env.ROOTLAB_ADMIN_EMAIL || '';
const presupuesto = crearPresupuesto({
  db,
  topeDiaUsd: numero(process.env.ROOTLAB_IA_TOPE_DIA_USD, 2),
  topeMesUsd: numero(process.env.ROOTLAB_IA_TOPE_MES_USD, 20),
  precios: jsonDe('ROOTLAB_IA_PRECIOS', PRECIOS_POR_DEFECTO),
  limites: {
    ...LIMITES_POR_DEFECTO,
    gratis: {
      chat: numero(process.env.ROOTLAB_CUOTA_CHAT, LIMITES_POR_DEFECTO.gratis.chat),
      identificar: numero(process.env.ROOTLAB_CUOTA_IDENTIFICAR, LIMITES_POR_DEFECTO.gratis.identificar),
      diagnosticar: numero(process.env.ROOTLAB_CUOTA_DIAGNOSTICAR, LIMITES_POR_DEFECTO.gratis.diagnosticar),
    },
  },
  alAlerta: ({ periodo, gastado, tope, umbral }) => {
    console.warn(`IA: ${umbral}% del tope ${periodo} (US$ ${gastado.toFixed(2)} de ${tope.toFixed(2)})`);
    if (ADMIN) correo.enviar({ tipo: 'alerta-gasto', para: ADMIN, ...alertaGasto({ gastado, tope, periodo }) });
  },
});
let push = null;
try {
  push = crearPush({ dirDatos: DATOS });
} catch (e) {
  console.warn(`notificaciones desactivadas: ${e.message}`);
}
const api = crearApi({
  db, ia, push, correo, claves, presupuesto,
  tofu: process.env.ROOTLAB_TOFU !== '0',
  urlPublica: () => URL_PUBLICA,
  version: VERSION,
});

const servidor = crearServidorHttp({ api, raiz: RAIZ, base: BASE });
servidor.listen(PUERTO, HOST, () => {
  const local = `http://localhost:${PUERTO}${BASE}`;
  console.log(`\n  ROOTLAB ${VERSION}`);
  console.log(`  app        ${local}/`);
  console.log(`  emulador   ${local}/emulador/`);
  console.log(`  pública    ${URL_PUBLICA}/   (lo que va en el QR)`);
  console.log(`  IA         ${ia.proveedor}${ia.modelo ? ` (${ia.modelo}, chat ${ia.modeloChat})` : ` (${ia.motivo})`}`);
  const e = presupuesto.estado();
  console.log(`  tope IA    US$ ${e.tope_dia_usd}/día, US$ ${e.tope_mes_usd}/mes (gastado: ${e.gastado_dia_usd.toFixed(2)} hoy, ${e.gastado_mes_usd.toFixed(2)} este mes)`);
  console.log(`  correo     ${correo.transporte}${correo.transporte === 'archivo' ? ` (${join(DATOS, 'correos')})` : ''}, remitente ${correo.remitente}${ADMIN ? `, alertas a ${enmascararEmail(ADMIN)}` : ''}`);
  console.log(`  avisos     ${push ? 'web push listo' : 'desactivados'}`);
  console.log(`  base       ${join(DATOS, 'rootkit.db')} (esquema ${db.version()}, datos personales cifrados)\n`);
});

const temporizador = setInterval(() => { api.revisar().catch(() => {}); }, 10 * 60 * 1000);
temporizador.unref();

if (correo.transporte === 'smtp') {
  correo.verificar()
    .then(() => console.log('  correo: relay SMTP conectado'))
    .catch((err) => console.error(`  correo: el relay SMTP no responde (${err.message})`));
}

for (const senal of ['SIGINT', 'SIGTERM']) {
  process.on(senal, async () => {
    servidor.close();
    /* Los emails en cola salen antes de apagar (hasta 10 s). */
    await Promise.race([correo.esperar(), new Promise((ok) => setTimeout(ok, 10000))]);
    correo.cerrar();
    db.cerrar();
    process.exit(0);
  });
}
