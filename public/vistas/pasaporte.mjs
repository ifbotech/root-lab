/* pasaporte.mjs — el pasaporte botánico: una hoja A4 para imprimir o
 * guardar como PDF.
 *
 * Quién es la planta y su Rooti, cuándo llegó, cuántos días sanos lleva,
 * cómo estuvo el último mes (con los rangos que pide su especie al lado, para
 * que los números se lean), cómo se cuida, y su primera y última foto. Es
 * papel: fondo blanco y tinta oscura aunque la app sea nocturna, porque se
 * imprime. "Guardar como PDF" es la impresión del navegador (`window.print`),
 * sin librerías: el CSS de impresión arma la página.
 */
import { h, render, icono, botonVolver } from '../lib/ui.mjs';
import { cara } from '../lib/caras.mjs';
import { pielDe } from '../lib/rooties.mjs';
import { ETAPAS, ETAPA_ES, etapaDe, MOOD_ES, RAREZA_ES, formatTemp, formatLux } from '../lib/model.mjs';
import { resumenHistorial, edadEnDias, loQueMasLePaso, numeroDePasaporte } from '../lib/pasaporte.mjs';
import { tokenGuardado } from '../lib/api.mjs';
import { enBase } from '../lib/base.mjs';

const fecha = (ms) => new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(ms));
const CUIDADOS = [['Riego', 'riego'], ['Luz', 'luz'], ['Temperatura', 'temperatura'], ['Humedad', 'humedad']];

async function imagen(plantaId, fotoId) {
  const r = await fetch(enBase(`api/plantas/${plantaId}/fotos/${fotoId}`), { headers: { authorization: `Bearer ${tokenGuardado()}` } });
  if (!r.ok) throw new Error('foto');
  return URL.createObjectURL(await r.blob());
}

export function vistaPasaporte(ctx) {
  const { estado, coleccion, plantaId, api, volver, cuenta } = ctx;
  const n = (estado?.nodes || []).find((x) => x.id === plantaId);
  const cont = h('div', { class: 'vista pasaporte-vista' });
  if (!n) {
    render(cont, h('section', { class: 'panel vacio' }, h('p', {}, 'Esa planta ya no está.'),
      h('button', { class: 'boton', type: 'button', onClick: volver }, 'Volver')));
    return cont;
  }
  const esp = n.especie_info;
  const modelo = (coleccion?.catalogo || []).find((m) => m.id === n.modelo);
  const piel = n.revelado ? pielDe(n.modelo, n.rareza || 'comun') : null;
  const sanos = n.bond?.dias_sanos ?? 0;
  const etapa = etapaDe(sanos);
  const edad = edadEnDias(n.creada);

  const fila = (k, v) => h('div', { class: 'pas-dato' }, h('dt', {}, k), h('dd', {}, v));
  const zonaMes = h('div', { class: 'pas-mes' }, h('p', { class: 'pas-nota' }, 'Leyendo el último mes…'));
  const zonaFotos = h('div', { class: 'pas-fotos' });

  const hoja = h('article', { class: 'pasaporte' },
    h('header', { class: 'pas-cab' },
      h('div', {},
        h('p', { class: 'pas-eyebrow' }, 'ROOTLAB · Pasaporte botánico'),
        h('h1', {}, n.nombre || 'Sin nombre'),
        h('p', { class: 'pas-especie' }, esp ? [esp.nombre, esp.cientifico ? h('i', {}, ` ${esp.cientifico}`) : null] : 'Especie sin identificar')),
      h('div', { class: 'pas-rooti' },
        h('div', { class: 'pas-cara', style: piel ? `background:${piel.fondo}` : '' },
          cara({ persona: n.modelo || '', rareza: n.rareza || 'comun', modo: n.revelado ? 'cara' : 'dormida', animo: n.revelado ? 'HAPPY' : 'SLEEPING', lado: 96, fps: 1, etiqueta: modelo?.nombre || 'Rooti' })),
        h('b', {}, modelo?.nombre || '—'),
        h('span', {}, piel ? `Piel ${RAREZA_ES[n.rareza] || ''}: ${piel.nombre}` : 'Sin abrir el cofre'))),

    h('section', { class: 'pas-bloque' },
      h('h2', {}, 'Identidad'),
      h('dl', { class: 'pas-datos' },
        fila('Número', numeroDePasaporte(n.id)),
        fila('Llegó a ROOTLAB', n.creada ? fecha(n.creada) : '—'),
        fila('Edad en la app', edad === null ? '—' : `${edad} ${edad === 1 ? 'día' : 'días'}`),
        fila('Días sanos', `${sanos} · etapa ${ETAPA_ES[etapa] || etapa}`),
        fila('Mejor racha', `${n.bond?.mejor_racha ?? 0} días`),
        fila('Ahora', n.revelado ? (MOOD_ES[n.mood] || n.mood) : 'dormido'))),

    h('section', { class: 'pas-bloque' }, h('h2', {}, 'El último mes'), zonaMes),

    n.ficha
      ? h('section', { class: 'pas-bloque' },
          h('h2', {}, 'Cómo se cuida'),
          h('dl', { class: 'pas-cuidados' },
            CUIDADOS.filter(([, k]) => n.ficha.cuidados[k]).map(([t, k]) => h('div', {}, h('dt', {}, t), h('dd', {}, n.ficha.cuidados[k])))))
      : null,

    h('section', { class: 'pas-bloque' }, h('h2', {}, 'Fotos'), zonaFotos),

    h('footer', { class: 'pas-pie' },
      h('span', {}, `Registrada por ${cuenta?.nombre || 'su dueño'}`),
      h('span', {}, `Emitido el ${fecha(Date.now())}`),
      h('span', {}, 'Los datos salen del ROOTKIT, la maceta con sensores.')));

  render(cont,
    h('header', { class: 'vista-cab no-imprimir' },
      botonVolver(volver),
      h('h2', {}, 'Pasaporte'),
      h('button', { class: 'boton chico azul', type: 'button', onClick: () => window.print() }, 'Guardar PDF')),
    hoja,
    h('p', { class: 'nota no-imprimir' }, 'Al imprimir, elegí "Guardar como PDF": sale una hoja A4. Sin librerías ni servicios: lo hace el navegador.'));

  (async () => {
    try {
      const [hist, fotos] = await Promise.all([
        api(`/api/plantas/${n.id}/historial?horas=720`),
        api(`/api/plantas/${n.id}/fotos`).catch(() => ({ fotos: [] })),
      ]);
      const r = resumenHistorial(hist.puntos);
      const peor = loQueMasLePaso(r.animos);
      render(zonaMes, r.lecturas < 2
        ? h('p', { class: 'pas-nota' }, 'Todavía no hay un mes de lecturas.')
        : [
          h('table', { class: 'pas-tabla' },
            h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, 'Media'), h('th', {}, 'Mínimo'), h('th', {}, 'Máximo'), h('th', {}, 'Lo que pide'))),
            h('tbody', {},
              r.suelo ? h('tr', {}, h('td', {}, 'Tierra'), h('td', {}, `${r.suelo.media} %`), h('td', {}, `${r.suelo.min} %`), h('td', {}, `${r.suelo.max} %`), h('td', {}, esp ? `${esp.soil_min}–${esp.soil_max} %` : '—')) : null,
              r.temp ? h('tr', {}, h('td', {}, 'Temperatura'), h('td', {}, formatTemp(r.temp.media)), h('td', {}, formatTemp(r.temp.min)), h('td', {}, formatTemp(r.temp.max)), h('td', {}, esp ? `${formatTemp(esp.temp_min_dc)} a ${formatTemp(esp.temp_max_dc)}` : '—')) : null,
              r.hr ? h('tr', {}, h('td', {}, 'Humedad'), h('td', {}, `${r.hr.media} %`), h('td', {}, `${r.hr.min} %`), h('td', {}, `${r.hr.max} %`), h('td', {}, esp ? `≥ ${esp.rh_min} %` : '—')) : null,
              r.lux ? h('tr', {}, h('td', {}, 'Luz'), h('td', {}, formatLux(r.lux.media)), h('td', {}, formatLux(r.lux.min)), h('td', {}, formatLux(r.lux.max)), h('td', {}, esp ? `${formatLux(esp.lux_min)} a ${formatLux(esp.lux_max)}` : '—')) : null)),
          h('p', { class: 'pas-nota' }, [
            `${r.lecturas} lecturas en ${r.dias} ${r.dias === 1 ? 'día' : 'días'}.`,
            r.comoda_pct !== null ? ` Estuvo cómoda el ${r.comoda_pct} % del tiempo.` : '',
            peor ? ` Lo que más le pasó: ${MOOD_ES[peor] || peor}.` : ' Nunca pidió nada.',
          ].join('')),
        ]);
      const lista = fotos.fotos || [];
      if (!lista.length) {
        render(zonaFotos, h('p', { class: 'pas-nota' }, 'Sin fotos todavía. El álbum está en la planta.'));
      } else {
        const primera = lista[lista.length - 1];
        const ultima = lista[0];
        const elegidas = primera.id === ultima.id ? [primera] : [primera, ultima];
        const urls = await Promise.all(elegidas.map((f) => imagen(n.id, f.id).catch(() => null)));
        render(zonaFotos, elegidas.map((f, i) => (urls[i] ? h('figure', {}, h('img', { src: urls[i], alt: `Foto del ${fecha(f.t)}` }), h('figcaption', {}, `${i === 0 && elegidas.length > 1 ? 'Primera foto · ' : elegidas.length > 1 ? 'Última foto · ' : ''}${fecha(f.t)}`)) : null)));
      }
    } catch (e) {
      render(zonaMes, h('p', { class: 'pas-nota' }, `No pude leer el historial: ${e.message}`));
    }
  })();

  return cont;
}
