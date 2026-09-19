/* frase.mjs — pedir una frase por teclado sin que se vea.
 *
 * La usan la caja fuerte y la firma del firmware: las dos cosas que cuidan
 * claves que no tienen que quedar ni en la pantalla ni en el historial. Para
 * automatizar (las pruebas), una variable de entorno; pero entonces la frase
 * queda en el entorno del proceso: preferí el teclado.
 */
import { createInterface } from 'node:readline';

/** Pide una frase. Si `variable` está en el entorno, usa esa. */
export function preguntarFrase(mensaje, variable) {
  if (variable && process.env[variable]) return Promise.resolve(process.env[variable]);
  return new Promise((ok) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const salida = process.stdout;
    /* Sin eco: lo que se escribe no queda en la pantalla ni en el historial. */
    const escribir = rl._writeToOutput?.bind(rl);
    rl._writeToOutput = (s) => { if (s.includes(mensaje)) escribir?.(s); else salida.write(''); };
    rl.question(mensaje, (r) => { rl.close(); salida.write('\n'); ok(r); });
  });
}

/** Pide una frase nueva: larga, y dos veces si es por teclado. */
export async function fraseNueva(mensaje, variable, { minimo = 16 } = {}) {
  const frase = await preguntarFrase(mensaje, variable);
  if (String(frase).length < minimo) {
    throw new Error(`La frase tiene que tener al menos ${minimo} caracteres. Que sea larga y que te la acuerdes: no hay forma de recuperarla.`);
  }
  if (!(variable && process.env[variable])) {
    const otra = await preguntarFrase('De nuevo, para estar seguros: ', null);
    if (otra !== frase) throw new Error('No coinciden: no se escribió nada.');
  }
  return frase;
}
