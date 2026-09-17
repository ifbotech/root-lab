/* album.mjs — el álbum de fotos de una planta: verla crecer.
 *
 * Las fotos quedan en la cuenta (el servidor las guarda con la planta, ver
 * docs/album.md). Tres cosas que una carpeta de fotos no hace:
 *
 *   EL FANTASMA   al sacar la foto nueva, la última se ve al 30 % encima de
 *                 la cámara: se encuadra igual que la vez anterior y las
 *                 fotos se comparan de verdad. Es cámara en vivo
 *                 (getUserMedia); donde no hay, la cámara del teléfono.
 *   ANTES/DESPUÉS dos fotos superpuestas con un deslizador.
 *   EVOLUCIÓN     un GIF con todas las fotos y su fecha (lib/gif.mjs),
 *                 escrito en el teléfono, para compartir o guardar.
 *
 * Las fotos de reconocer y diagnosticar entran solas al álbum: la primera
 * foto de una planta suele ser esa.
 */
import { h, render, icono, botonVolver } from '../lib/ui.mjs';
import { prepararFoto } from '../lib/dispositivo.mjs';
import { tokenGuardado } from '../lib/api.mjs';
import { enBase } from '../lib/base.mjs';
import { cuantizar, codificarGif } from '../lib/gif.mjs';

const fecha = (ms) => new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(ms));
const LADO_GIF = 480;

/* Las fotos bajan con la sesión (la etiqueta <img> no manda el token) y se
   recuerdan como URL de objeto mientras dure la página. */
const urls = new Map();
async function imagen(plantaId, fotoId) {
  const clave = `${plantaId}/${fotoId}`;
  if (urls.has(clave)) return urls.get(clave);
  const r = await fetch(enBase(`api/plantas/${plantaId}/fotos/${fotoId}`), { headers: { authorization: `Bearer ${tokenGuardado()}` } });
  if (!r.ok) throw new Error('No pude bajar la foto');
  const url = URL.createObjectURL(await r.blob());
  urls.set(clave, url);
  return url;
}

const cargarImagen = (src) => new Promise((ok, mal) => {
  const i = new Image();
  i.onload = () => ok(i);
  i.onerror = () => mal(new Error('imagen'));
  i.src = src;
});

export function vistaAlbum(ctx) {
  const { estado, plantaId, api, avisar, volver } = ctx;
  const n = (estado?.nodes || []).find((x) => x.id === plantaId);
  const cont = h('div', { class: 'vista album' });
  if (!n) {
    render(cont, h('section', { class: 'panel vacio' }, h('p', {}, 'Esa planta ya no está.'),
      h('button', { class: 'boton', type: 'button', onClick: volver }, 'Volver')));
    return cont;
  }
  const nombre = n.nombre || 'tu planta';
  let fotos = [];
  let maximo = 60;
  const grilla = h('div', { class: 'album-grilla' });
  const zona = h('div', { class: 'album-zona' });
  const acciones = h('div', { class: 'fila-botones album-acciones' });

  /* ----------------------------------------------------------- subir --- */
  async function subir(dataUrl, nota = '') {
    const [cabecera, b64] = dataUrl.split(',');
    const mime = (cabecera.match(/data:([^;]+)/) || [])[1] || 'image/jpeg';
    try {
      const r = await api(`/api/plantas/${n.id}/fotos`, { metodo: 'POST', cuerpo: { image_b64: b64, mime, nota } });
      avisar(r.encolado ? 'Sin conexión: la foto sale cuando vuelva.' : 'Guardada en el álbum.');
      await cargar();
    } catch (e) { avisar(e.message, true); }
  }

  /* --------------------------------------------------------- la cámara --- */
  async function abrirCamara() {
    if (!navigator.mediaDevices?.getUserMedia) {
      elegir.click();
      return;
    }
    let flujo;
    try {
      flujo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false });
    } catch {
      avisar('No pude abrir la cámara: usá la del teléfono.');
      elegir.click();
      return;
    }
    const video = h('video', { autoplay: true, playsinline: true, muted: true });
    video.srcObject = flujo;
    const fantasma = h('img', { class: 'fantasma', alt: '', hidden: true });
    if (fotos[0]) imagen(n.id, fotos[0].id).then((u) => { fantasma.src = u; fantasma.hidden = false; }).catch(() => {});
    const cerrar = () => { flujo.getTracks().forEach((t) => t.stop()); modal.remove(); };
    const disparar = async () => {
      const c = document.createElement('canvas');
      const k = Math.min(1, 1024 / Math.max(video.videoWidth, video.videoHeight, 1));
      c.width = Math.round(video.videoWidth * k);
      c.height = Math.round(video.videoHeight * k);
      c.getContext('2d').drawImage(video, 0, 0, c.width, c.height);
      const dataUrl = c.toDataURL('image/jpeg', 0.85);
      cerrar();
      await subir(dataUrl);
    };
    const modal = h('div', { class: 'camara', role: 'dialog', 'aria-label': 'Cámara' },
      h('div', { class: 'camara-visor' }, video, fantasma),
      h('p', { class: 'camara-nota' }, fotos[0] ? 'La última foto se ve al 30 %: encuadrá igual y la comparación va a ser justa.' : 'La primera foto: encuadrá la planta entera, con luz.'),
      h('div', { class: 'camara-botones' },
        h('button', { class: 'boton', type: 'button', onClick: cerrar }, 'Cancelar'),
        h('button', { class: 'boton primario camara-disparo', type: 'button', onClick: disparar, 'aria-label': 'Sacar la foto' }, icono('camara', 26))));
    document.body.append(modal);
  }
  const elegir = h('input', {
    type: 'file', accept: 'image/*', capture: 'environment', class: 'oculto',
    onChange: async (ev) => {
      const f = ev.target.files?.[0];
      if (!f) return;
      try { const foto = await prepararFoto(f, 1024); await subir(foto.vista); } catch (e) { avisar(e.message, true); }
      ev.target.value = '';
    },
  });

  /* ---------------------------------------------------- antes / después --- */
  async function comparar() {
    if (fotos.length < 2) return;
    const a = fotos[fotos.length - 1];
    const b = fotos[0];
    const [ua, ub] = await Promise.all([imagen(n.id, a.id), imagen(n.id, b.id)]);
    const despues = h('img', { src: ub, alt: `Después, ${fecha(b.t)}` });
    const rango = h('input', { type: 'range', min: '0', max: '100', value: '50', id: 'comparar-rango', 'aria-label': 'Antes y después' });
    const linea = h('i', { class: 'comparar-linea' });
    const mover = () => { despues.style.clipPath = `inset(0 0 0 ${rango.value}%)`; linea.style.left = `${rango.value}%`; };
    rango.addEventListener('input', mover);
    mover();
    render(zona, h('div', { class: 'comparar' },
      h('div', { class: 'comparar-marco' }, h('img', { src: ua, alt: `Antes, ${fecha(a.t)}` }), despues, linea,
        h('span', { class: 'comparar-et izq' }, fecha(a.t)), h('span', { class: 'comparar-et der' }, fecha(b.t))),
      rango,
      h('p', { class: 'nota' }, 'Deslizá: a la izquierda la primera foto, a la derecha la última.')));
  }

  /* ---------------------------------------------------------- el GIF --- */
  async function exportar(ev) {
    if (fotos.length < 2) return;
    const boton = ev.currentTarget;
    boton.disabled = true;
    try {
      const orden = [...fotos].reverse();
      const imgs = await Promise.all(orden.map((f) => imagen(n.id, f.id).then(cargarImagen)));
      const w = LADO_GIF;
      const hMax = Math.round(w * 4 / 3);
      const c = document.createElement('canvas');
      c.width = w;
      c.height = hMax;
      const g = c.getContext('2d');
      const cuadros = imgs.map((img, i) => {
        g.fillStyle = '#111';
        g.fillRect(0, 0, w, hMax);
        const k = Math.min(w / img.naturalWidth, hMax / img.naturalHeight);
        const dw = Math.round(img.naturalWidth * k);
        const dh = Math.round(img.naturalHeight * k);
        g.drawImage(img, Math.round((w - dw) / 2), Math.round((hMax - dh) / 2), dw, dh);
        g.fillStyle = 'rgba(0,0,0,.55)';
        g.fillRect(0, hMax - 44, w, 44);
        g.fillStyle = '#fff';
        g.font = '900 22px Nunito, sans-serif';
        g.textBaseline = 'middle';
        g.fillText(`${nombre} · ${fecha(orden[i].t)}`, 16, hMax - 22);
        return cuantizar(g.getImageData(0, 0, w, hMax).data, w, hMax);
      });
      const retardos = cuadros.map((_, i) => (i === cuadros.length - 1 ? 1600 : 700));
      const gif = codificarGif(cuadros, { ancho: w, alto: hMax, retardoMs: retardos });
      const archivo = new File([gif], `evolucion-${(n.nombre || 'planta').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.gif`, { type: 'image/gif' });
      if (navigator.canShare?.({ files: [archivo] })) {
        await navigator.share({ files: [archivo], title: `La evolución de ${nombre}` }).catch(() => {});
      } else {
        const a = h('a', { href: URL.createObjectURL(archivo), download: archivo.name });
        document.body.append(a);
        a.click();
        a.remove();
      }
      avisar(`Listo: ${cuadros.length} fotos, ${Math.round(gif.length / 1024)} KB.`);
    } catch (e) {
      avisar(`No pude armar el GIF: ${e.message}`, true);
    } finally {
      boton.disabled = false;
    }
  }

  /* --------------------------------------------------------- la grilla --- */
  function abrir(f) {
    imagen(n.id, f.id).then((u) => render(zona,
      h('figure', { class: 'album-grande' },
        h('img', { src: u, alt: `Foto del ${fecha(f.t)}` }),
        h('figcaption', {}, `${fecha(f.t)}${f.nota ? ` · ${f.nota}` : ''}${f.origen === 'reconocimiento' ? ' · la foto del reconocimiento' : f.origen === 'diagnostico' ? ' · de un diagnóstico' : ''}`),
        h('div', { class: 'fila-botones' },
          h('button', { class: 'boton chico', type: 'button', onClick: () => render(zona) }, 'Cerrar'),
          h('button', {
            class: 'boton chico peligro', type: 'button',
            onClick: async () => {
              if (!confirm('¿Borrar esta foto del álbum?')) return;
              try { await api(`/api/plantas/${n.id}/fotos/${f.id}`, { metodo: 'DELETE' }); render(zona); await cargar(); } catch (e) { avisar(e.message, true); }
            },
          }, 'Borrar'))))).catch((e) => avisar(e.message, true));
  }

  async function cargar() {
    try {
      const r = await api(`/api/plantas/${n.id}/fotos`);
      fotos = r.fotos || [];
      maximo = r.maximo || maximo;
    } catch (e) {
      render(grilla, h('p', { class: 'errores' }, e.message));
      return;
    }
    render(acciones,
      h('button', { class: 'boton primario', type: 'button', onClick: abrirCamara, disabled: fotos.length >= maximo }, icono('camara', 18), 'Sacar foto'),
      h('button', { class: 'boton chico', type: 'button', onClick: () => elegir.click(), disabled: fotos.length >= maximo }, 'De la galería'),
      fotos.length >= 2 ? h('button', { class: 'boton chico azul', type: 'button', onClick: comparar }, 'Antes / después') : null,
      fotos.length >= 2 ? h('button', { class: 'boton chico oro', type: 'button', onClick: exportar }, icono('compartir', 16), 'Exportar evolución') : null);
    if (!fotos.length) {
      render(grilla, h('div', { class: 'panel vacio' },
        h('p', {}, `Todavía no hay fotos de ${nombre}. Sacá la primera: cada foto nueva se encuadra sobre la anterior, y con dos ya se ve la evolución.`)));
      return;
    }
    const miniaturas = await Promise.all(fotos.map((f) => imagen(n.id, f.id).catch(() => null)));
    render(grilla, fotos.map((f, i) => h('button', { class: 'album-mini', type: 'button', onClick: () => abrir(f), 'aria-label': `Foto del ${fecha(f.t)}` },
      miniaturas[i] ? h('img', { src: miniaturas[i], alt: '' }) : h('span', { class: 'album-rota' }, icono('camara', 20)),
      h('span', {}, fecha(f.t)))));
  }

  render(cont,
    h('header', { class: 'vista-cab' },
      botonVolver(volver),
      h('h2', {}, `Álbum de ${nombre}`)),
    acciones, elegir, zona, grilla,
    h('p', { class: 'nota' }, `Hasta ${maximo} fotos por planta. Las de reconocer y diagnosticar entran solas.`));
  cargar();
  return cont;
}
