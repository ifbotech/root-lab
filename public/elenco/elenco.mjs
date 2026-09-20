/* elenco.mjs — la lámina viva de los cuatro Rooties.
 *
 * PARA QUÉ EXISTE
 *
 * Para ajustar el arte rápido. Un personaje son números en dos tablas
 * —`lib/rooti3d/formas.mjs` los cuerpos, `core/persona.c` las caras y los
 * colores—, y la única forma sensata de tocar un número es ver enseguida a
 * los cuatro juntos, en sus tres pieles y en sus once ánimos. Abrir la app,
 * vincular un aparato y llegar hasta la ficha para mirar UNO no sirve.
 *
 * No es una vista de la app: es una herramienta. Por eso vive aparte, no
 * entra en el service worker y lleva `noindex`. Usa exactamente los mismos
 * módulos que la app, así que lo que se ve acá es lo que se va a ver allá.
 *
 * EL BOTÓN DE LA LÁMINA
 *
 * Arma un PNG con todo lo que está en pantalla y lo baja. Es lo que ilustra
 * los README de los dos repos: se regenera desde acá, sin instalar nada.
 */
import { cuerpo } from '../lib/cuerpo.mjs';
import { cara, ANIMOS, cargarCaras } from '../lib/caras.mjs';
import { MODELOS, RAREZAS, pielDe } from '../lib/rooties.mjs';

const RAREZA_ES = { comun: 'común', raro: 'rara', epico: 'épica' };
const $ = (id) => document.getElementById(id);

/* Los ánimos, en el orden en que le importan a alguien que mira: primero el
   bien, después lo que puede salir mal, al final lo que no es la planta. */
const ORDEN = ['HAPPY', 'THIRSTY', 'DROWNING', 'HOT', 'COLD', 'PARCHED_AIR',
  'SCORCHED', 'DARK', 'SLEEPING', 'OFFLINE', 'UNKNOWN'];
const animos = ORDEN.filter((a) => ANIMOS.includes(a)).concat(ANIMOS.filter((a) => !ORDEN.includes(a)));

for (const a of animos) {
  const o = document.createElement('option');
  o.value = a;
  o.textContent = a.toLowerCase().replace('_', ' ');
  $('animo').append(o);
}

const estado = {
  rareza: 'comun', animo: 'HAPPY', noche: false, dormido: false, polvo: 0, lado: 300, mimo: false,
};
const vivos = [];

/* Sin innerHTML: es la regla de la casa para todo lo que vive en public/, y
   la comprueba test/auditoria.test.mjs. */
function rotulo(nombre, detalle, ancho) {
  const pie = document.createElement('figcaption');
  const b = document.createElement('b');
  b.textContent = nombre;
  pie.append(b, document.createTextNode(detalle));
  if (ancho) { pie.style.width = `${ancho}px`; pie.style.textAlign = 'left'; }
  return pie;
}

function pintarCuerpos() {
  const cont = $('cuerpos');
  cont.replaceChildren();
  vivos.length = 0;
  const pieles = estado.rareza === 'todas' ? RAREZAS : [estado.rareza];
  for (const m of MODELOS) {
    for (const r of pieles) {
      const piel = pielDe(m.id, r);
      const fig = document.createElement('figure');
      const escena = document.createElement('div');
      escena.className = 'escena';
      escena.style.background = estado.noche ? '#1b2033' : piel.escena;
      const c = cuerpo({
        persona: m.id,
        rareza: r,
        animo: estado.animo,
        lado: estado.lado,
        noche: estado.noche,
        dormido: estado.dormido,
        polvo: estado.polvo,
        clave: `elenco-${m.id}-${r}`,
        fps: 24,
      });
      escena.append(c);
      fig.append(escena);
      fig.append(rotulo(m.nombre, `${piel.nombre} · ${RAREZA_ES[r]}`));
      cont.append(fig);
      vivos.push(c);
      if (estado.mimo) c.acariciar(true);
    }
  }
}

/* La hoja de caras: una fila por Rooti, una columna por ánimo. Son las caras
   vivas (el WebAssembly del firmware), no los PNG: así se ven las
   animaciones y los acabados de las pieles raras y épicas. */
function pintarCaras() {
  const hoja = $('hoja');
  hoja.replaceChildren();
  const pieles = estado.rareza === 'todas' ? RAREZAS : [estado.rareza];
  for (const m of MODELOS) {
    for (const r of pieles) {
      const fila = document.createElement('div');
      fila.className = 'caras';
      const nombre = document.createElement('figure');
      nombre.append(rotulo(m.nombre, RAREZA_ES[r], 78));
      fila.append(nombre);
      for (const a of animos) {
        const f = document.createElement('figure');
        f.append(cara({ persona: m.id, rareza: r, animo: a, lado: 78, fps: 20 }));
        const pie = document.createElement('figcaption');
        pie.textContent = a.toLowerCase().replace('_', ' ');
        f.append(pie);
        fila.append(f);
      }
      hoja.append(fila);
    }
  }
}

function repintar() {
  pintarCuerpos();
  pintarCaras();
}

/* ------------------------------------------------------------- mandos --- */
$('rareza').addEventListener('change', (e) => { estado.rareza = e.target.value; repintar(); });
$('animo').addEventListener('change', (e) => { estado.animo = e.target.value; repintar(); });
$('noche').addEventListener('change', (e) => { estado.noche = e.target.checked; repintar(); });
$('dormido').addEventListener('change', (e) => { estado.dormido = e.target.checked; repintar(); });
$('polvo').addEventListener('change', (e) => { estado.polvo = e.target.checked ? 7 : 0; repintar(); });
$('lado').addEventListener('change', (e) => { estado.lado = Number(e.target.value); repintar(); });
$('mimo').addEventListener('click', (e) => {
  estado.mimo = !estado.mimo;
  e.target.classList.toggle('activo', estado.mimo);
  for (const c of vivos) c.acariciar(estado.mimo);
});
$('saludo').addEventListener('click', () => { for (const c of vivos) c.saludar?.(); });

/* --------------------------------------------------------- la lámina --- */
/* Se compone a mano sobre un canvas: copiar los canvas que ya están dibujados
   es instantáneo y no hace falta ninguna biblioteca ni instalar un navegador
   aparte para sacar la foto. */
$('bajar').addEventListener('click', () => {
  const figuras = [...$('cuerpos').querySelectorAll('figure')];
  if (!figuras.length) return;
  const esc = 2;
  const uno = figuras[0].querySelector('canvas');
  const ancho = uno.clientWidth;
  const alto = uno.clientHeight;
  const porFila = Math.min(figuras.length, Math.max(2, Math.floor(1600 / (ancho + 16))));
  const filas = Math.ceil(figuras.length / porFila);
  const pie = 34;
  const lienzo = document.createElement('canvas');
  lienzo.width = (ancho + 16) * porFila * esc;
  lienzo.height = (alto + pie) * filas * esc;
  const g = lienzo.getContext('2d');
  g.fillStyle = getComputedStyle(document.body).backgroundColor;
  g.fillRect(0, 0, lienzo.width, lienzo.height);
  g.textAlign = 'center';
  figuras.forEach((f, i) => {
    const cv = f.querySelector('canvas');
    const x = (i % porFila) * (ancho + 16) * esc;
    const y = Math.floor(i / porFila) * (alto + pie) * esc;
    const fondo = f.querySelector('.escena');
    g.fillStyle = getComputedStyle(fondo).backgroundColor;
    g.fillRect(x + 8 * esc, y, ancho * esc, alto * esc);
    g.drawImage(cv, x + 8 * esc, y, ancho * esc, alto * esc);
    g.fillStyle = getComputedStyle(document.body).color;
    g.font = `${13 * esc}px system-ui, sans-serif`;
    const txt = f.querySelector('figcaption').textContent.replace(/\s+/g, ' ').trim();
    g.fillText(txt, x + (8 + ancho / 2) * esc, y + (alto + 20) * esc);
  });
  const a = document.createElement('a');
  a.download = `rooties-${estado.rareza}-${estado.animo.toLowerCase()}.png`;
  a.href = lienzo.toDataURL('image/png');
  a.click();
});

/* Las caras tardan lo que tarda el WebAssembly; el resto ya se puede ver. */
repintar();
cargarCaras().catch(() => { /* sin caras se ven los cuerpos igual */ });
