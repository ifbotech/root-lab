/* cripto.mjs — lo que se guarda cifrado y cómo se buscan esos datos.
 *
 * QUÉ SE PROTEGE Y DE QUÉ
 *
 * El riesgo concreto es que la base se vaya a otro lado: un respaldo
 * copiado, un disco viejo, un error de permisos. Para ese caso, la base sola
 * no tiene que servir para nada:
 *
 *   email, nombre     cifrados con AES-256-GCM. Sin la clave maestra son
 *   mensajes del chat bytes al azar, y el GCM detecta si alguien los tocó.
 *
 *   búsqueda por      un ÍNDICE CIEGO: HMAC-SHA256 del email normalizado con
 *   email             una clave propia. Permite encontrar la cuenta al entrar
 *                     sin guardar el email en claro, y no se puede revertir
 *                     sin la clave (un hash sin clave se revierte probando
 *                     listas de emails).
 *
 *   contraseñas       nunca se cifran: se derivan con Argon2id y una
 *                     PIMIENTA (ver claves.mjs). La pimienta sale de acá.
 *
 * LA CLAVE MAESTRA
 *
 * ROOTLAB_SECRETO: 32 bytes al azar en base64, fuera de la base y fuera de
 * los respaldos (en el VPS, en /etc/root-lab.env; lo genera instalar.sh).
 * De ella se derivan con HKDF claves distintas para cada uso, así un uso no
 * compromete a otro y cada una se puede rotar por separado.
 *
 * Si se pierde la clave maestra, los emails cifrados y las contraseñas no se
 * recuperan. Guardar una copia fuera del servidor es parte de instalar
 * (docs/seguridad.md).
 *
 * En desarrollo, sin ROOTLAB_SECRETO, se genera una en <datos>/secreto.key
 * la primera vez y se avisa por consola.
 */
import {
  createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes,
} from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const VERSION = 'v1';

/** Lee ROOTLAB_SECRETO o, en desarrollo, el archivo de la carpeta de datos. */
export function cargarSecreto({ entorno = process.env.ROOTLAB_SECRETO, archivo = null, avisar = console.warn } = {}) {
  if (entorno) {
    const b = Buffer.from(String(entorno).trim(), 'base64');
    if (b.length !== 32) throw new Error('ROOTLAB_SECRETO tiene que ser 32 bytes en base64 (openssl rand -base64 32)');
    return b;
  }
  if (!archivo) throw new Error('falta ROOTLAB_SECRETO');
  if (existsSync(archivo)) return Buffer.from(readFileSync(archivo, 'utf8').trim(), 'base64');
  mkdirSync(dirname(archivo), { recursive: true });
  const nuevo = randomBytes(32);
  writeFileSync(archivo, `${nuevo.toString('base64')}\n`, { mode: 0o600 });
  avisar(`secreto nuevo en ${archivo} (sólo para desarrollo: en producción usá ROOTLAB_SECRETO)`);
  return nuevo;
}

export function crearCripto(maestra) {
  if (!Buffer.isBuffer(maestra) || maestra.length !== 32) throw new Error('la clave maestra tiene que ser de 32 bytes');
  const derivar = (uso) => Buffer.from(hkdfSync('sha256', maestra, Buffer.alloc(0), `rootlab/${uso}/${VERSION}`, 32));
  const kCifrado = derivar('cifrado');
  const kIndice = derivar('indice');
  const kPimienta = derivar('pimienta');

  return {
    /** Texto -> "v1.<iv>.<tag>.<cifrado>" (base64url). null y '' pasan igual. */
    cifrar(texto) {
      if (texto === null || texto === undefined) return null;
      const iv = randomBytes(12);
      const c = createCipheriv('aes-256-gcm', kCifrado, iv);
      const datos = Buffer.concat([c.update(String(texto), 'utf8'), c.final()]);
      return [VERSION, iv.toString('base64url'), c.getAuthTag().toString('base64url'), datos.toString('base64url')].join('.');
    },

    /** Lanza si el texto fue alterado o se cifró con otra clave. */
    descifrar(sobre) {
      if (sobre === null || sobre === undefined) return null;
      const partes = String(sobre).split('.');
      if (partes.length !== 4 || partes[0] !== VERSION) throw new Error('dato cifrado con formato desconocido');
      const [, iv, tag, datos] = partes;
      const d = createDecipheriv('aes-256-gcm', kCifrado, Buffer.from(iv, 'base64url'));
      d.setAuthTag(Buffer.from(tag, 'base64url'));
      return Buffer.concat([d.update(Buffer.from(datos, 'base64url')), d.final()]).toString('utf8');
    },

    /** Índice ciego: el mismo email da siempre el mismo valor, y sin la clave no se revierte. */
    indice(textoNormalizado) {
      return createHmac('sha256', kIndice).update(String(textoNormalizado)).digest('hex');
    },

    /** La contraseña con pimienta, antes de Argon2id (claves.mjs). */
    pimentar(clave) {
      return createHmac('sha256', kPimienta).update(String(clave).normalize('NFKC')).digest();
    },
  };
}

/** Para mostrar en logs sin revelar el email: "a***@gmail.com". */
export function enmascararEmail(email) {
  const [u, d] = String(email || '').split('@');
  if (!d) return '***';
  return `${u.slice(0, 1)}***@${d}`;
}
