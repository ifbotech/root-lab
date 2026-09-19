/* El vapid.json es una clave privada, y estaba quedando 0644.
 *
 * Cualquier usuario del servidor podía leerla y mandar notificaciones en
 * nombre de ROOTLAB a todos los teléfonos suscriptos. Se arregló en
 * server/push.mjs; esto lo vigila para que no vuelva.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync, chmodSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { crearPush } from '../server/push.mjs';

/* En Windows los permisos POSIX no existen; el servidor es Linux. */
const enWindows = process.platform === 'win32';
const modo = (f) => statSync(f).mode & 0o777;

describe('las claves VAPID no las lee cualquiera', () => {
  test('nacen 0600, y a una que venía abierta se le cierran', { skip: enWindows }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'push-'));
    try {
      crearPush({ dirDatos: dir });
      const archivo = join(dir, 'vapid.json');
      assert.equal(modo(archivo), 0o600, 'recién creada');

      /* El caso real: producción ya tenía el archivo en 0644 desde antes del
         arreglo. Arrancar el servidor tiene que alcanzar para corregirlo. */
      chmodSync(archivo, 0o644);
      crearPush({ dirDatos: dir });
      assert.equal(modo(archivo), 0o600, 'y la de antes también');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('el respaldo copia la clave sin abrirla', () => {
    /* tools/respaldar.mjs se corre como servicio; leerlo es más barato que
       montar un respaldo entero para mirar un permiso. */
    const texto = readFileSync(fileURLToPath(new URL('../tools/respaldar.mjs', import.meta.url)), 'utf8');
    assert.match(texto, /chmodSync\(copiaVapid, 0o600\)/);
  });
});
