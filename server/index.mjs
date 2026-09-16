/* index.mjs — arranca root-lab.
 *
 *   npm start                     http://localhost:8080
 *   PORT=9000 npm start
 *
 * Sirve desde el mismo proceso:
 *
 *   /             la app (public/), instalable como PWA
 *   /v/<CÓDIGO>   la misma app, entrando por el QR de un ROOTKIT
 *   /emulador/    un ROOTKIT virtual para recorrer el flujo sin placa
 *   /api/...      la API de la app y la de los aparatos (server/api.mjs)
 *
 * Todo eso puede ir debajo de una subruta (ROOTLAB_BASE=/rootkit). Ver
 * server/http.mjs y docs/despliegue.md.
 *
 * Configuración por variables de entorno o un archivo .env (ver
 * .env.example). Nada es obligatorio para desarrollar.
 */
import { existsSync, readFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { crearAlmacen } from './almacen.mjs';
import { crearApi } from './api.mjs';
import { crearIA } from './ia.mjs';
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

const almacen = crearAlmacen({ archivo: join(DATOS, 'rootlab.json') });
const ia = crearIA();
let push = null;
try {
  push = crearPush({ dirDatos: DATOS });
} catch (e) {
  console.warn(`notificaciones desactivadas: ${e.message}`);
}
const api = crearApi({
  almacen, ia, push,
  tofu: process.env.ROOTLAB_TOFU !== '0',
  urlPublica: () => URL_PUBLICA,
  version: VERSION,
});

const servidor = crearServidorHttp({ api, raiz: RAIZ, base: BASE });
servidor.listen(PUERTO, HOST, () => {
  const local = `http://localhost:${PUERTO}${BASE}`;
  console.log(`\n  root-lab ${VERSION}`);
  console.log(`  app        ${local}/`);
  console.log(`  emulador   ${local}/emulador/`);
  console.log(`  pública    ${URL_PUBLICA}/   (lo que va en el QR)`);
  console.log(`  IA         ${ia.proveedor}${ia.modelo ? ` (${ia.modelo})` : ' — definí ANTHROPIC_API_KEY para usar Claude'}`);
  console.log(`  avisos     ${push ? 'web push listo' : 'desactivados'}`);
  console.log(`  datos      ${DATOS}\n`);
});

const temporizador = setInterval(() => { api.revisar().catch(() => {}); }, 10 * 60 * 1000);
temporizador.unref();

for (const senal of ['SIGINT', 'SIGTERM']) {
  process.on(senal, () => {
    almacen.volcar();
    servidor.close();
    process.exit(0);
  });
}
