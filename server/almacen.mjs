/* almacen.mjs — donde viven los datos.
 *
 * Un archivo JSON, escrito de forma atómica (temporal + rename) y con las
 * escrituras agrupadas. Para un piloto de decenas o cientos de macetas es
 * más que suficiente, se respalda copiando un archivo y se inspecciona con
 * un editor. El resto del servidor sólo ve el objeto `datos` y la función
 * `guardar()`, así que pasar a SQLite o Postgres cuando haga falta toca este
 * archivo y nada más (ver docs/despliegue.md).
 *
 * LAS COLECCIONES
 *
 *   cuentas          id -> { token_hash, creada, tz, coleccion[] }
 *   dispositivos     id -> { token_hash, visto, estado, epoca, codigo, ... }
 *   plantas          id -> { cuenta, dispositivo, epoca, persona, revelado,
 *                            nombre, especie, vinculo, ... }
 *   lecturas         dispositivo -> [ { t, suelo, temp, hr, lux, ... } ]
 *   suscripciones    cuenta -> [ PushSubscription ]
 *   avisos           planta -> { clave: último envío }
 *   transferencias   código -> { cuenta, vence }
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const vacio = () => ({
  version: 1,
  cuentas: {},
  dispositivos: {},
  plantas: {},
  lecturas: {},
  suscripciones: {},
  avisos: {},
  transferencias: {},
});

export function crearAlmacen({ archivo = null } = {}) {
  let datos = vacio();
  if (archivo && existsSync(archivo)) {
    try {
      datos = { ...vacio(), ...JSON.parse(readFileSync(archivo, 'utf8')) };
    } catch (e) {
      throw new Error(`no pude leer ${archivo}: ${e.message}`);
    }
  }

  let temporizador = null;

  const volcar = () => {
    clearTimeout(temporizador);
    temporizador = null;
    if (!archivo) return;
    mkdirSync(dirname(archivo), { recursive: true });
    const tmp = `${archivo}.tmp`;
    writeFileSync(tmp, JSON.stringify(datos));
    renameSync(tmp, archivo);
  };

  return {
    get datos() { return datos; },
    /* Agrupa las escrituras de una ráfaga de pedidos en una sola. */
    guardar() {
      if (!archivo || temporizador) return;
      temporizador = setTimeout(volcar, 250);
      temporizador.unref?.();
    },
    volcar,
    reiniciar() { datos = vacio(); },
  };
}
