/* firmware.mjs — las versiones del firmware que la nube les ofrece a los Rooties.
 *
 * CÓMO SE ACTUALIZA UNA MACETA
 *
 * Cada sync dice qué versión corre el aparato, en qué placa y (lo sabe la
 * nube) en qué canal está: `estable` o `beta`. Si hay una versión publicada
 * para esa placa y ese canal que no es la que corre, la respuesta del sync
 * trae el manifiesto y el aparato la baja, la verifica y reinicia solo
 * (root-kit/docs/ota.md).
 *
 * FIRMADAS
 *
 * Cada binario se publica con su SHA-256 y una FIRMA: ECDSA P-256 sobre ese
 * hash, hecha con una clave privada que NO vive en el servidor (la tiene
 * quien publica: tools/publicar-firmware.mjs). El servidor sólo tiene la
 * pública, y con ella rechaza cualquier cosa que no venga bien firmada; el
 * aparato tiene la misma pública compilada adentro y vuelve a verificar. Así,
 * ni siquiera alguien que tome el servidor puede instalarle un firmware a una
 * maceta.
 *
 * CANALES
 *
 * `beta` recibe lo último que se publicó en beta o en estable, lo que sea más
 * nuevo; `estable`, sólo lo estable. Los Rooties del piloto van en beta.
 * Publicar en un canal una versión más vieja que la vigente es la forma de
 * volver atrás: los aparatos instalan "la vigente del canal", no "la mayor".
 *
 * Todo lo de acá es puro (o usa sólo node:crypto) y se prueba sin servidor.
 */
import { createHash, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto';

export const CANALES = ['estable', 'beta'];
export const FIRMWARE_MAX_BYTES = 1900000;      /* lo que entra en una partición OTA */
export const RE_PLACA = /^[a-z0-9][a-z0-9-]{1,23}$/;

const RE_VERSION = /^(\d{1,5})\.(\d{1,5})\.(\d{1,5})(-[0-9A-Za-z.-]+)?$/;

/** "0.6.0" o "0.6.0-beta.2", de hasta 15 caracteres (lo que guarda el aparato). */
export const versionValida = (v) => typeof v === 'string' && v.length < 16 && RE_VERSION.test(v);

/** <0, 0 o >0. El sufijo no cuenta; una versión inválida vale 0.0.0. Espejo de rk_version_cmp. */
export function compararVersiones(a, b) {
  const partes = (v) => (versionValida(v) ? v.match(RE_VERSION).slice(1, 4).map(Number) : [0, 0, 0]);
  const x = partes(a);
  const y = partes(b);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
}

export const sha256Hex = (contenido) => createHash('sha256').update(contenido).digest('hex');

/** Un par de claves nuevo: { privada, publica } en PEM. */
export function generarClaves() {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  return {
    privada: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    publica: publicKey.export({ type: 'spki', format: 'pem' }),
  };
}

/** Firma un binario: { sha256, firma (DER en base64), tamano }. */
export function firmarFirmware(contenido, privadaPem) {
  const firma = sign('sha256', contenido, privadaPem).toString('base64');
  return { sha256: sha256Hex(contenido), firma, tamano: contenido.length };
}

/** ¿Esta firma es de este binario y de esta clave? */
export function firmaValida(contenido, firmaB64, publicaPem) {
  try {
    const firma = Buffer.from(String(firmaB64 || ''), 'base64');
    if (firma.length < 64 || firma.length > 80) return false;
    return verify('sha256', contenido, createPublicKey(publicaPem), firma);
  } catch {
    return false;
  }
}

/** La pública como cabecera de C para el firmware (esp32/ota_clave.h). */
export function cabeceraC(publicaPem) {
  const lineas = String(publicaPem).trim().split(/\r?\n/).map((l) => `    "${l}\\n"`);
  return `/* ota_clave.h — la clave PÚBLICA con la que el aparato verifica cada
 * actualización (ECDSA P-256). GENERADA con
 *
 *   node tools/publicar-firmware.mjs generar-clave      (en root-lab)
 *
 * La privada no está en ningún repositorio ni en el servidor: la tiene quien
 * publica. Si se pierde, los aparatos en la calle no se pueden actualizar
 * más por aire (habría que flashearlos por USB con una pública nueva), así
 * que se guarda como la clave maestra: en un gestor de contraseñas.
 */
#ifndef ROOTKIT_OTA_CLAVE_H
#define ROOTKIT_OTA_CLAVE_H

static const char RK_OTA_CLAVE_PUBLICA[] =
${lineas.join('\n')};

#endif /* ROOTKIT_OTA_CLAVE_H */
`;
}

/**
 * Qué versión le toca a un aparato: la más reciente PUBLICADA para su placa
 * en su canal (beta ve también lo estable). Null si no hay, o si ya la corre.
 * `publicaciones`: [{ version, canal, placa, publicado, ... }].
 */
export function elegirFirmware(publicaciones, { placa, canal = 'estable', version = '' } = {}) {
  const canales = canal === 'beta' ? ['beta', 'estable'] : ['estable'];
  const candidatas = (publicaciones || [])
    .filter((f) => f.placa === placa && canales.includes(f.canal) && !f.retirado)
    .sort((a, b) => b.publicado - a.publicado);
  /* La vigente de cada canal es la última que se publicó ahí; entre beta y
     estable gana la versión mayor (y, a igual versión, la estable). */
  const vigentes = canales.map((c) => candidatas.find((f) => f.canal === c)).filter(Boolean);
  if (!vigentes.length) return null;
  vigentes.sort((a, b) => compararVersiones(b.version, a.version) || (a.canal === 'estable' ? -1 : 1));
  const elegida = vigentes[0];
  return elegida.version === version ? null : elegida;
}

/** El nombre del archivo de una publicación: "0.6.0-c3-supermini-beta.bin". */
export const archivoDe = ({ version, placa, canal }) => `${version}-${placa}-${canal}.bin`;
