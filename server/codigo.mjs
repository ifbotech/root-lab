/* codigo.mjs — el código de vinculación, del lado del servidor.
 *
 * Es la misma derivación que rootkit/firmware/core/codigo.c. El servidor no
 * la necesita para vincular (la maceta se presenta sola con su código), pero
 * sí la usa la herramienta de fábrica y los tests, que verifican con los
 * mismos vectores que el firmware que las dos implementaciones coinciden.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Lo que tipea una persona, a la forma canónica. null si no es un código. */
export function normalizarCodigo(entrada) {
  if (typeof entrada !== 'string') return null;
  let s = entrada.toUpperCase().replace(/[-\s_.]/g, '')
    .replace(/O/g, '0').replace(/[IL]/g, '1').replace(/U/g, 'V');
  if (s.length !== 8) return null;
  for (const c of s) if (!CROCKFORD.includes(c)) return null;
  return s;
}

export const ssidDe = (codigo) => `ROOTKIT-${String(codigo || '').slice(0, 4)}`;

/** "K7Q2M9XA" -> "K7Q2-M9XA", como lo muestra la pantalla. */
export const codigoLegible = (c) => (c && c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : c);

export function codigoVinculo(secreto, epoca) {
  const msg = Buffer.alloc(16 + 4);
  msg.write('rootkit-vinculo:', 0, 'ascii');
  msg.writeUInt32LE(epoca >>> 0, 16);
  const mac = createHmac('sha256', secreto).update(msg).digest();
  let bits = 0n;
  for (let i = 0; i < 5; i++) bits = (bits << 8n) | BigInt(mac[i]);
  let out = '';
  for (let i = 0; i < 8; i++) out += CROCKFORD[Number((bits >> BigInt(35 - 5 * i)) & 31n)];
  return out;
}

export const tokenApi = (secreto) =>
  createHmac('sha256', secreto).update('rootkit-api').digest('hex');

export const hash = (s) => createHash('sha256').update(String(s)).digest('hex');

export const tokenNuevo = () => randomBytes(32).toString('base64url');

export function igualesSeguro(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Un código corto para pasar la cuenta del navegador a la app instalada. */
export function codigoTransferencia() {
  const b = randomBytes(6);
  let s = '';
  for (let i = 0; i < 6; i++) s += CROCKFORD[b[i] % 32];
  return s;
}
