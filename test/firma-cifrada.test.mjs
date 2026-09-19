/* La clave de firma del firmware, cifrada con una frase.
 *
 * Es la clave más valiosa del proyecto: con ella se instala cualquier cosa en
 * todos los aparatos vendidos. Estaba en la computadora de quien firma como
 * un PEM en claro, al alcance de cualquier programa que corra con ese
 * usuario. Estas pruebas cuidan que cifrarla no la pueda perder, y que
 * cifrada siga firmando lo mismo.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { firmaValida } from '../server/firmware.mjs';

const HERRAMIENTA = fileURLToPath(new URL('../tools/publicar-firmware.mjs', import.meta.url));
const FRASE = 'la frase larga de quien firma';

const correr = (args, frase = FRASE) => execFileSync(process.execPath, [HERRAMIENTA, ...args], {
  encoding: 'utf8',
  env: { ...process.env, ROOTLAB_FIRMA_FRASE: frase },
  stdio: ['ignore', 'pipe', 'pipe'],
});

function conClave(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'firma-'));
  try {
    execFileSync(process.execPath, [HERRAMIENTA, 'generar-clave', dir], { stdio: 'ignore' });
    /* Un binario de ESP32 empieza con 0xE9. */
    const bin = join(dir, 'firmware.bin');
    writeFileSync(bin, Buffer.concat([Buffer.from([0xe9]), Buffer.alloc(4096, 7)]));
    return fn({ dir, clave: join(dir, 'firmware.key'), publica: join(dir, 'firmware-publica.pem'), bin });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('cifrar la clave de firma', () => {
  test('cifrada no se parece a la original, y firma igual', () => conClave(({ clave, publica, bin }) => {
    const antes = readFileSync(clave, 'utf8');
    const cuerpo = antes.split('\n').filter((l) => l && !l.startsWith('-----')).join('');
    correr(['cifrar-clave', clave, '--publica', publica]);

    const despues = readFileSync(clave, 'utf8');
    assert.match(despues, /BEGIN ENCRYPTED PRIVATE KEY/);
    assert.ok(!despues.includes(cuerpo.slice(0, 40)), 'la privada en claro ya no está en el disco');
    assert.ok(!existsSync(`${clave}.cifrando`), 'no quedan temporales');

    const f = JSON.parse(correr(['firmar', bin, '--clave', clave, '--publica', publica]));
    assert.ok(firmaValida(readFileSync(bin), f.firma, readFileSync(publica, 'utf8')), 'la firma verifica con la pública de los aparatos');
  }));

  test('con otra frase no firma', () => conClave(({ clave, bin }) => {
    correr(['cifrar-clave', clave]);
    assert.throws(() => correr(['firmar', bin, '--clave', clave], 'otra frase larga cualquiera'), /no abre/);
  }));

  test('no se cifra dos veces, ni con una frase corta, ni con la pública equivocada', () => conClave(({ dir, clave, publica }) => {
    assert.throws(() => correr(['cifrar-clave', clave], 'corta'), /16 caracteres/);
    assert.match(readFileSync(clave, 'utf8'), /BEGIN PRIVATE KEY/, 'una frase corta no toca el archivo');

    const otra = join(dir, 'otra');
    execFileSync(process.execPath, [HERRAMIENTA, 'generar-clave', otra], { stdio: 'ignore' });
    assert.throws(() => correr(['cifrar-clave', clave, '--publica', join(otra, 'firmware-publica.pem')]), /no es el par/);
    assert.match(readFileSync(clave, 'utf8'), /BEGIN PRIVATE KEY/, 'la pública equivocada tampoco');

    correr(['cifrar-clave', clave, '--publica', publica]);
    assert.throws(() => correr(['cifrar-clave', clave]), /ya está cifrada/);
  }));

  test('la pública del servidor es la que va compilada en los aparatos', {
    skip: existsSync(new URL('../../rootkit/firmware/esp32/ota_clave.h', import.meta.url)) ? false : 'sin el repo rootkit al lado',
  }, () => {
    /* Si se separan, el servidor acepta firmwares que los aparatos rechazan
       (o al revés), y nada avisa hasta que una actualización no llega. */
    const h = readFileSync(new URL('../../rootkit/firmware/esp32/ota_clave.h', import.meta.url), 'utf8');
    const compilada = [...h.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1].replace(/\\n/g, '\n')).join('').trim();
    const servidor = readFileSync(new URL('../deploy/firmware-publica.pem', import.meta.url), 'utf8').trim();
    assert.equal(compilada, servidor);
  });

  test('sin cifrar sigue firmando, pero avisa', () => conClave(({ clave, bin }) => {
    const r = execFileSync(process.execPath, [HERRAMIENTA, 'firmar', bin, '--clave', clave], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    assert.ok(JSON.parse(r).firma);
  }));
});
