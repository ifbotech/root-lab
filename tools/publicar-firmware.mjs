/* publicar-firmware.mjs — firma un firmware y lo publica para los Rooties.
 *
 *   node tools/publicar-firmware.mjs generar-clave [carpeta]
 *       Crea firmware.key (PRIVADA: no se sube a ningún lado) y
 *       firmware-publica.pem, e imprime la cabecera para root-kit
 *       (firmware/esp32/ota_clave.h). Se hace UNA vez.
 *
 *   node tools/publicar-firmware.mjs cabecera <firmware-publica.pem>
 *       Vuelve a imprimir la cabecera de C.
 *
 *   node tools/publicar-firmware.mjs firmar <firmware.bin> --clave firmware.key
 *       Sólo firma: imprime sha256, firma y tamaño.
 *
 *   node tools/publicar-firmware.mjs publicar <firmware.bin> --version 0.6.0 \
 *        --placa c3-supermini --canal beta --clave firmware.key \
 *        --nube https://ifbotech.com/rootkit [--notas "qué cambia"]
 *       Firma y sube. La clave de administración va en ROOTLAB_ADMIN_CLAVE
 *       (variable de entorno, nunca en la línea de comandos).
 *
 *   node tools/publicar-firmware.mjs listar --nube https://...
 *   node tools/publicar-firmware.mjs retirar <id> --nube https://...
 *
 * El binario es el que deja PlatformIO en
 * root-kit/firmware/.pio/build/c3-144/firmware.bin. Ver docs/operacion.md y
 * root-kit/docs/ota.md.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  generarClaves, firmarFirmware, firmaValida, cabeceraC, versionValida, CANALES, RE_PLACA, FIRMWARE_MAX_BYTES,
} from '../server/firmware.mjs';

const [orden, ...resto] = process.argv.slice(2);
const opciones = {};
const sueltos = [];
for (let i = 0; i < resto.length; i++) {
  if (resto[i].startsWith('--')) opciones[resto[i].slice(2)] = resto[i + 1]?.startsWith('--') || resto[i + 1] === undefined ? true : resto[++i];
  else sueltos.push(resto[i]);
}
const salir = (mensaje) => { console.error(mensaje); process.exit(1); };

async function admin(metodo, ruta, cuerpo) {
  const nube = String(opciones.nube || process.env.ROOTLAB_URL_PUBLICA || '').replace(/\/+$/, '');
  const clave = process.env.ROOTLAB_ADMIN_CLAVE || '';
  if (!nube) salir('falta --nube https://...');
  if (!clave) salir('falta la variable de entorno ROOTLAB_ADMIN_CLAVE');
  const r = await fetch(`${nube}${ruta}`, {
    method: metodo,
    headers: { authorization: `Bearer ${clave}`, ...(cuerpo ? { 'content-type': 'application/json' } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const j = r.status === 204 ? null : await r.json().catch(() => null);
  if (!r.ok) salir(`${metodo} ${ruta}: ${r.status} ${j?.error || ''}`);
  return j;
}

switch (orden) {
  case 'generar-clave': {
    const carpeta = resolve(sueltos[0] || '.');
    const privada = join(carpeta, 'firmware.key');
    if (existsSync(privada)) salir(`ya existe ${privada}: no la piso (perderla deja a los aparatos sin actualizaciones)`);
    mkdirSync(carpeta, { recursive: true });
    const claves = generarClaves();
    writeFileSync(privada, claves.privada, { mode: 0o600 });
    try { chmodSync(privada, 0o600); } catch { /* Windows */ }
    writeFileSync(join(carpeta, 'firmware-publica.pem'), claves.publica);
    console.error(`privada: ${privada}  (guardala en un gestor de contraseñas; NO va a ningún repositorio)`);
    console.error(`pública: ${join(carpeta, 'firmware-publica.pem')}  (va a root-lab/deploy/ y, como cabecera, a root-kit)`);
    console.log(cabeceraC(claves.publica));
    break;
  }
  case 'cabecera': {
    if (!sueltos[0]) salir('uso: cabecera <firmware-publica.pem>');
    console.log(cabeceraC(readFileSync(sueltos[0], 'utf8')));
    break;
  }
  case 'firmar':
  case 'publicar': {
    const archivo = sueltos[0];
    if (!archivo || !existsSync(archivo)) salir(`no está el binario ${archivo || ''}`);
    if (!opciones.clave || !existsSync(opciones.clave)) salir('falta --clave firmware.key');
    const contenido = readFileSync(archivo);
    if (contenido.length > FIRMWARE_MAX_BYTES) salir(`el binario mide ${contenido.length} bytes: no entra en la partición (${FIRMWARE_MAX_BYTES})`);
    /* Un binario de ESP32 empieza con 0xE9: evita publicar el archivo equivocado.
       (Para la placa "emulador" vale cualquier archivo: es para probar el camino.) */
    if (contenido[0] !== 0xe9 && opciones.placa !== 'emulador') salir('eso no parece un firmware de ESP32 (no empieza con 0xE9)');
    const privada = readFileSync(opciones.clave, 'utf8');
    const f = firmarFirmware(contenido, privada);
    if (opciones.publica && !firmaValida(contenido, f.firma, readFileSync(opciones.publica, 'utf8'))) {
      salir('la firma no verifica con esa pública: ¿es el par correcto?');
    }
    if (orden === 'firmar') {
      console.log(JSON.stringify(f, null, 2));
      break;
    }
    const { version, placa, canal = 'beta' } = opciones;
    if (!versionValida(version)) salir('falta --version X.Y.Z');
    if (!RE_PLACA.test(String(placa || ''))) salir('falta --placa (por ejemplo c3-supermini)');
    if (!CANALES.includes(canal)) salir(`--canal tiene que ser uno de: ${CANALES.join(', ')}`);
    const r = await admin('POST', '/api/admin/firmware', {
      version, placa, canal, notas: opciones.notas === true ? '' : opciones.notas || '',
      sha256: f.sha256, firma: f.firma, contenido_b64: contenido.toString('base64'),
    });
    console.log(`publicado ${r.version} para ${r.placa} en ${r.canal}: ${r.tamano} bytes, sha256 ${r.sha256.slice(0, 16)}…`);
    break;
  }
  case 'listar': {
    const r = await admin('GET', '/api/admin/firmware');
    for (const f of r.firmware) {
      console.log(`${String(f.id).padStart(4)}  ${f.version.padEnd(14)} ${f.placa.padEnd(16)} ${f.canal.padEnd(8)} ${String(f.tamano).padStart(8)} B  ${new Date(f.publicado).toISOString().slice(0, 16)}${f.retirado ? '  (retirado)' : ''}  ${f.notas || ''}`);
    }
    if (!r.firmware.length) console.log('(nada publicado)');
    break;
  }
  case 'retirar': {
    if (!sueltos[0]) salir('uso: retirar <id>');
    await admin('DELETE', `/api/admin/firmware/${encodeURIComponent(sueltos[0])}`);
    console.log('retirado: los aparatos dejan de recibirlo (los que ya lo instalaron se quedan con él)');
    break;
  }
  default:
    salir('uso: publicar-firmware.mjs generar-clave | cabecera | firmar | publicar | listar | retirar   (ver el encabezado del archivo)');
}
