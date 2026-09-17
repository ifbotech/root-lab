/* respaldo.mjs — cifrar un respaldo para sacarlo del servidor, y volver a abrirlo.
 *
 * La base ya guarda cifrado lo personal (emails, nombres, charlas), pero un
 * respaldo que sale del servidor lleva además hashes de contraseñas, tokens
 * hasheados y todo el historial: va cifrado ENTERO, con una clave que no es
 * la maestra (ROOTLAB_RESPALDO_CLAVE), para que quien custodia los respaldos
 * no pueda leer la base de producción ni al revés.
 *
 * FORMATO (.db.enc)
 *
 *   "RKR1"  4 bytes   la versión del formato
 *   sal     16 bytes  para derivar la clave (scrypt)
 *   iv      12 bytes
 *   tag     16 bytes  AES-256-GCM: si el archivo se tocó, no abre
 *   datos   el resto
 *
 * Es puro node:crypto y trabaja con Buffers: una base de ROOTLAB mide unos
 * pocos MB por cada mil macetas-año, así que entra en memoria de sobra.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

const MAGIA = Buffer.from('RKR1');
const N_SCRYPT = 1 << 15;

function claveDe(frase, sal) {
  if (!frase || String(frase).length < 16) throw new Error('ROOTLAB_RESPALDO_CLAVE tiene que tener al menos 16 caracteres (openssl rand -base64 32)');
  return scryptSync(String(frase), sal, 32, { N: N_SCRYPT, r: 8, p: 1, maxmem: 128 * 1024 * 1024 });
}

/** Cifra un Buffer. */
export function cifrarRespaldo(datos, frase) {
  const sal = randomBytes(16);
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', claveDe(frase, sal), iv);
  const cuerpo = Buffer.concat([c.update(datos), c.final()]);
  return Buffer.concat([MAGIA, sal, iv, c.getAuthTag(), cuerpo]);
}

/** Descifra. Tira un error claro si la clave no es o el archivo se dañó. */
export function descifrarRespaldo(cifrado, frase) {
  if (!Buffer.isBuffer(cifrado) || cifrado.length < 48 || !cifrado.subarray(0, 4).equals(MAGIA)) {
    throw new Error('eso no es un respaldo cifrado de ROOTLAB');
  }
  const sal = cifrado.subarray(4, 20);
  const iv = cifrado.subarray(20, 32);
  const tag = cifrado.subarray(32, 48);
  const d = createDecipheriv('aes-256-gcm', claveDe(frase, sal), iv);
  d.setAuthTag(tag);
  try {
    return Buffer.concat([d.update(cifrado.subarray(48)), d.final()]);
  } catch {
    throw new Error('no se pudo descifrar: la clave no es la de este respaldo, o el archivo está dañado');
  }
}

/** Cómo sacar un archivo del servidor: [programa, argumentos] o null. */
export function ordenDeEnvio(destino, archivo) {
  const d = String(destino || '').trim();
  if (!d) return null;
  /* usuario@host:/ruta -> scp; cualquier otra cosa se toma como un remoto de rclone. */
  if (/^[\w.-]+@[\w.-]+:.+/.test(d)) return ['scp', ['-q', '-o', 'BatchMode=yes', archivo, d.endsWith('/') ? d : `${d}/`]];
  return ['rclone', ['copy', '--quiet', archivo, d]];
}
