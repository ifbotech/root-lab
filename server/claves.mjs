/* claves.mjs — contraseñas.
 *
 * ARGON2ID CON PIMIENTA
 *
 * Argon2id es la recomendación actual de OWASP para guardar contraseñas: es
 * lento a propósito y usa memoria, así que probar millones de contraseñas
 * con placas de video sale caro. Parámetros: 19 MiB, 2 pasadas, 1 hilo (el
 * mínimo recomendado por OWASP; unos 50 ms por intento en el VPS).
 *
 * Antes de Argon2id la contraseña pasa por un HMAC con la PIMIENTA, una
 * clave derivada de ROOTLAB_SECRETO que no está en la base. Si alguien se
 * lleva la base, no puede ni empezar a probar contraseñas: le falta la
 * pimienta.
 *
 * Formato guardado:
 *
 *   argon2id$p1$m=19456,t=2,p=1$<sal>$<hash>
 *
 * `p1` es la versión de la pimienta, y los parámetros van en cada hash para
 * poder subirlos más adelante sin invalidar los viejos: al entrar, un hash
 * con parámetros viejos (o de scrypt, el formato anterior) se rehace con los
 * actuales (`hayQueRehacer`).
 */
import { argon2, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const argon2p = promisify(argon2);
const scrypt = promisify(scryptCb);

export const ARGON = { memoria: 19456, pasadas: 2, hilos: 1, largo: 32 };
const PIMIENTA = 'p1';
const parametros = (a) => `m=${a.memoria},t=${a.pasadas},p=${a.hilos}`;

export function crearClaves(cripto, argon = ARGON) {
  async function derivar(clave, sal, a) {
    return argon2p('argon2id', {
      message: cripto.pimentar(clave), nonce: sal,
      parallelism: a.hilos, tagLength: a.largo, memory: a.memoria, passes: a.pasadas,
    });
  }

  async function verificarScrypt(clave, partes) {
    const [, N, r, p, sal, h] = partes;
    const esperado = Buffer.from(h, 'base64');
    const calculado = await scrypt(String(clave).normalize('NFKC'), Buffer.from(sal, 'base64'), esperado.length,
      { N: Number(N), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 });
    return calculado.length === esperado.length && timingSafeEqual(calculado, esperado);
  }

  let falso = null;

  const api = {
    async hash(clave) {
      const sal = randomBytes(16);
      const h = await derivar(clave, sal, argon);
      return `argon2id$${PIMIENTA}$${parametros(argon)}$${sal.toString('base64')}$${h.toString('base64')}`;
    },

    async verificar(clave, guardado) {
      const partes = String(guardado || '').split('$');
      if (partes[0] === 'scrypt' && partes.length === 6) return verificarScrypt(clave, partes);
      if (partes[0] !== 'argon2id' || partes.length !== 5 || partes[1] !== PIMIENTA) return false;
      const m = partes[2].match(/^m=(\d+),t=(\d+),p=(\d+)$/);
      if (!m) return false;
      const esperado = Buffer.from(partes[4], 'base64');
      const calculado = await derivar(clave, Buffer.from(partes[3], 'base64'),
        { memoria: Number(m[1]), pasadas: Number(m[2]), hilos: Number(m[3]), largo: esperado.length });
      return calculado.length === esperado.length && timingSafeEqual(calculado, esperado);
    },

    /** ¿El hash es de un formato o con parámetros más débiles que los actuales? */
    hayQueRehacer(guardado) {
      return !String(guardado || '').startsWith(`argon2id$${PIMIENTA}$${parametros(argon)}$`);
    },

    /** Compara contra un hash inventado: tarda lo mismo que uno real. */
    async verificarFalso(clave) {
      if (!falso) falso = await api.hash(randomBytes(12).toString('hex'));
      await api.verificar(clave, falso);
      return false;
    },
  };
  return api;
}
