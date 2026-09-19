/* caja-fuerte.mjs — sacar del servidor las claves sin las que un respaldo no
 * sirve, en un archivo que se puede guardar en cualquier lado.
 *
 * EL PROBLEMA QUE RESUELVE
 *
 * Los respaldos salen cifrados con ROOTLAB_RESPALDO_CLAVE, y adentro la base
 * tiene los emails, los nombres y las charlas cifrados con ROOTLAB_SECRETO.
 * Las dos claves viven en /etc/root-lab.env, o sea **en el mismo servidor**.
 * Si el VPS se pierde, quedan los respaldos y ninguna forma de abrirlos: un
 * respaldo que no se puede restaurar no es un respaldo.
 *
 * Esto sella esas claves en un archivo `.rkc` con una frase que elegís vos y
 * que no está en ningún servidor. El archivo se guarda al lado de los
 * respaldos, en tu computadora, donde sea: sin la frase no se abre.
 *
 *   node tools/caja-fuerte.mjs sellar                      # lee /etc/root-lab.env
 *   node tools/caja-fuerte.mjs sellar --env ruta --salida caja.rkc
 *   node tools/caja-fuerte.mjs listar caja.rkc             # qué hay, sin valores
 *   node tools/caja-fuerte.mjs abrir  caja.rkc             # los valores
 *   node tools/caja-fuerte.mjs abrir  caja.rkc --clave ROOTLAB_SECRETO
 *
 * La frase se pide por teclado y no se ve al escribirla. Para automatizar,
 * ROOTLAB_CAJA_FRASE, pero entonces queda en el entorno: preferí el teclado.
 *
 * QUÉ **NO** VA ACÁ ADENTRO
 *
 * La clave privada del firmware (`firmware.key`). Su razón de existir es no
 * estar en el servidor: es lo que hace que tomar el servidor no alcance para
 * instalarle algo a una maceta. Esa se guarda aparte, y nunca acá
 * (docs/seguridad.md).
 */
import { readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs';
import { preguntarFrase as pedir, fraseNueva } from './frase.mjs';
import { cifrarRespaldo, descifrarRespaldo } from '../server/respaldo.mjs';

const [orden, ...resto] = process.argv.slice(2);
const opciones = {};
const sueltos = [];
for (let i = 0; i < resto.length; i++) {
  if (resto[i].startsWith('--')) {
    opciones[resto[i].slice(2)] = resto[i + 1]?.startsWith('--') || resto[i + 1] === undefined ? true : resto[++i];
  } else sueltos.push(resto[i]);
}
const salir = (m) => { console.error(m); process.exit(1); };

/* Lo que hace falta para volver a levantar ROOTLAB en otra máquina. Si mañana
   aparece otra clave imprescindible, va acá y la caja siguiente la lleva. */
const IMPRESCINDIBLES = [
  ['ROOTLAB_SECRETO', 'la clave maestra: sin ella los emails, los nombres y las charlas de la base no se leen'],
  ['ROOTLAB_RESPALDO_CLAVE', 'abre los respaldos .db.enc'],
];
const UTILES = [
  ['ROOTLAB_ADMIN_CLAVE', 'la administración y la fábrica'],
  ['ROOTLAB_SMTP_CLAVE', 'el relay de correo'],
  ['ROOTLAB_SMTP_USUARIO', ''],
  ['ANTHROPIC_API_KEY', 'la IA'],
];

/** Lee un archivo de entorno a un objeto, sin interpretar nada. */
function leerEnv(ruta) {
  const dentro = {};
  for (const linea of readFileSync(ruta, 'utf8').split('\n')) {
    const m = linea.match(/^\s*([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) dentro[m[1]] = m[2];
  }
  return dentro;
}

const preguntarFrase = (mensaje) => pedir(mensaje, 'ROOTLAB_CAJA_FRASE');

const FRASE_MINIMA = 16;

switch (orden) {
  case 'sellar': {
    const env = String(opciones.env || '/etc/root-lab.env');
    if (!existsSync(env)) salir(`No encuentro ${env}. Pasalo con --env.`);
    const dentro = leerEnv(env);

    const caja = { hecha: new Date().toISOString(), servidor: process.env.ROOTLAB_URL_PUBLICA || '', claves: {} };
    const faltan = [];
    for (const [k, para] of [...IMPRESCINDIBLES, ...UTILES]) {
      if (dentro[k]) caja.claves[k] = dentro[k];
      else if (IMPRESCINDIBLES.some(([i]) => i === k)) faltan.push(`${k} (${para})`);
    }
    if (faltan.length) salir(`En ${env} no están: ${faltan.join(', ')}`);

    /* El VAPID también: sin él, cada teléfono tiene que volver a activar los avisos. */
    const vapid = String(opciones.vapid || '/var/lib/root-lab/vapid.json');
    if (existsSync(vapid)) caja.vapid = JSON.parse(readFileSync(vapid, 'utf8'));

    let frase;
    try {
      frase = await fraseNueva('Frase para la caja (no se muestra): ', 'ROOTLAB_CAJA_FRASE', { minimo: FRASE_MINIMA });
    } catch (e) {
      salir(e.message);
    }

    const salida = String(opciones.salida || 'caja-fuerte.rkc');
    writeFileSync(salida, cifrarRespaldo(Buffer.from(JSON.stringify(caja, null, 2), 'utf8'), frase));
    try { chmodSync(salida, 0o600); } catch { /* en Windows no aplica */ }
    console.log(`Sellada en ${salida}: ${Object.keys(caja.claves).length} claves${caja.vapid ? ' y el VAPID' : ''}.`);
    console.log('Guardala donde guardes los respaldos. Sin la frase no se abre, y la frase no está en ningún servidor.');
    break;
  }

  case 'listar':
  case 'abrir': {
    const archivo = sueltos[0];
    if (!archivo || !existsSync(archivo)) salir('Pasame el archivo: caja-fuerte.mjs abrir caja-fuerte.rkc');
    const frase = await preguntarFrase('Frase de la caja: ');
    let caja;
    try {
      caja = JSON.parse(descifrarRespaldo(readFileSync(archivo), frase).toString('utf8'));
    } catch (e) {
      salir(`No pude abrirla: ${e.message}`);
    }
    console.log(`Caja del ${caja.hecha}${caja.servidor ? ` · ${caja.servidor}` : ''}`);
    if (orden === 'listar') {
      for (const k of Object.keys(caja.claves)) console.log(`  ${k}  (${caja.claves[k].length} caracteres)`);
      if (caja.vapid) console.log('  vapid.json');
      break;
    }
    const sola = opciones.clave ? String(opciones.clave) : '';
    if (sola) {
      if (!caja.claves[sola]) salir(`No está ${sola} en esta caja.`);
      console.log(caja.claves[sola]);
      break;
    }
    for (const [k, v] of Object.entries(caja.claves)) console.log(`${k}=${v}`);
    if (caja.vapid) console.log(`\n# vapid.json\n${JSON.stringify(caja.vapid, null, 2)}`);
    break;
  }

  default:
    console.log(`Saca del servidor las claves sin las que un respaldo no sirve.

  node tools/caja-fuerte.mjs sellar [--env /etc/root-lab.env] [--vapid ruta] [--salida caja-fuerte.rkc]
  node tools/caja-fuerte.mjs listar caja-fuerte.rkc     qué hay adentro, sin los valores
  node tools/caja-fuerte.mjs abrir  caja-fuerte.rkc     los valores
  node tools/caja-fuerte.mjs abrir  caja-fuerte.rkc --clave ROOTLAB_SECRETO

La frase se pide por teclado. La clave privada del firmware NO va acá:
ver docs/seguridad.md.`);
    process.exit(orden ? 1 : 0);
}
