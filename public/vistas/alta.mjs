/* alta.mjs — del QR de la maceta a la primera cara.
 *
 * EL ORDEN DE LOS PASOS NO ES ARBITRARIO
 *
 *   hola       qué es esto y cuánto va a tardar
 *   instalar   primero, porque en iPhone las notificaciones web sólo existen
 *              para la app instalada: pedirlas antes sería pedir algo que
 *              no se puede dar. Y porque la app instalada no comparte datos
 *              con Safari: la cuenta se abre ya adentro de la app.
 *   cuenta     la maceta va a quedar a nombre de alguien, y sus datos se
 *              guardan en esa cuenta. Se saltea si ya hay sesión.
 *   avisos     ahora que se puede, y a nombre de la cuenta
 *   wifi       la maceta se conecta a la red de la casa por su portal
 *   vincular   la nube la ve con el mismo código que leyó el QR: es tuya
 *   cofre      quién vive en tu maceta (y en ese momento abre los ojos)
 *   nombre     ya sabés quién es: ahora se puede bautizar
 *   foto       qué planta cuida, y con eso qué necesita
 *   listo
 *
 * Cada paso se guarda en el teléfono: si la app se cierra a mitad de camino
 * —por ejemplo, para ir a Ajustes a conectarse a la red de la maceta— al
 * volver sigue exactamente donde estaba.
 */
import { h, render, icono, progreso } from '../lib/ui.mjs';
import { cara } from '../lib/caras.mjs';
import {
  esIOS, esAndroid, instalada, puedeInstalarConBoton, alCambiarInstalable, instalar,
  motivoSinAvisos, activarAvisos, avisosActivos, prepararFoto,
} from '../lib/dispositivo.mjs';
import { escenaCofre } from './cofre.mjs';
import { formularioCuenta } from './cuenta.mjs';

export const PASOS = ['hola', 'instalar', 'cuenta', 'avisos', 'wifi', 'vincular', 'cofre', 'nombre', 'foto', 'listo'];

const NOMBRES = {
  cresta: ['Rulo', 'Punk', 'Chispa', 'Brasa'],
  kawaii: ['Mochi', 'Lulú', 'Bombón', 'Nube'],
  visor: ['Pixel', 'Radar', 'Unit', 'Sonda'],
  ciclope: ['Ojito', 'Faro', 'Lupa', 'Tuerto'],
  hongo: ['Siesta', 'Musgo', 'Esporas', 'Boletus'],
  glitch: ['404', 'Ruido', 'Estática', 'Bug'],
};

const legible = (c) => (c && c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : c || '');

function barraPasos(paso) {
  const i = PASOS.indexOf(paso);
  return h('div', { class: 'alta-progreso', 'aria-label': `Paso ${i + 1} de ${PASOS.length}` },
    PASOS.slice(0, -1).map((_, k) => h('i', { class: k < i ? 'hecho' : k === i ? 'actual' : '' })));
}

function marcoCara(opciones, fondo) {
  return h('div', { class: 'cara-marco', style: fondo ? `background:${fondo}` : '' }, cara(opciones));
}

function esperando(texto) {
  return h('p', { class: 'espera', role: 'status' },
    h('span', { class: 'puntos', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')), texto);
}

/* ================================================================ pasos === */
function pasoHola(ctx) {
  return [
    h('div', { class: 'alta-cuerpo' },
      marcoCara({ modo: 'dormida', lado: 184, etiqueta: 'Un ROOTKIT dormido' }),
      h('h1', { class: 'alta-titulo' }, '¡Encontraste un ROOTKIT!'),
      h('p', { class: 'alta-texto' },
        'En un par de minutos lo conectamos, abrís su cofre y descubrís quién vive en tu maceta.'),
      h('span', { class: 'codigo-chip mono', title: 'El código de tu ROOTKIT' }, legible(ctx.alta.codigo))),
    h('div', { class: 'alta-pie' },
      h('button', { class: 'boton primario ancho', type: 'button', onClick: () => ctx.siguiente() }, 'Empezar')),
  ];
}

function pasoInstalar(ctx) {
  const cuerpo = h('div', { class: 'alta-cuerpo' });
  const pie = h('div', { class: 'alta-pie' });

  const pintar = () => {
    const icon = h('img', { src: 'iconos/icono-192.png', alt: '', width: 96, height: 96, style: 'border-radius:26px;box-shadow:0 6px 0 rgba(0,0,0,.35)' });
    if (esIOS()) {
      render(cuerpo, icon,
        h('h1', { class: 'alta-titulo' }, 'Ponela en tu inicio'),
        h('p', { class: 'alta-texto' }, 'Así se abre a pantalla completa y te puede avisar cuando tu planta te necesite.'),
        h('ol', { class: 'pasos' },
          h('li', { class: 'paso' }, h('span', { class: 'paso-num' }, '1'),
            h('div', {}, h('b', {}, 'Tocá Compartir'), h('span', {}, 'El cuadrado con la flecha, abajo en Safari.'))),
          h('li', { class: 'paso' }, h('span', { class: 'paso-num' }, '2'),
            h('div', {}, h('b', {}, '“Agregar a inicio”'), h('span', {}, 'Bajá un poco en la lista para encontrarlo.'))),
          h('li', { class: 'paso' }, h('span', { class: 'paso-num' }, '3'),
            h('div', {}, h('b', {}, 'Abrí ROOTKIT desde el inicio'), h('span', {}, 'Seguimos ahí, en este mismo paso.')))));
      render(pie, h('button', { class: 'enlace-boton', type: 'button', onClick: () => ctx.siguiente() }, 'Seguir en Safari'));
    } else if (puedeInstalarConBoton()) {
      render(cuerpo, icon,
        h('h1', { class: 'alta-titulo' }, 'Instalá la app'),
        h('p', { class: 'alta-texto' }, 'Se abre a pantalla completa, sin barra de navegador, y te avisa cuando tu planta te necesite.'));
      render(pie,
        h('button', {
          class: 'boton primario ancho', type: 'button',
          onClick: async () => { if (await instalar()) ctx.siguiente(); },
        }, icono('telefono', 20), 'Instalar'),
        h('button', { class: 'enlace-boton', type: 'button', onClick: () => ctx.siguiente() }, 'Ahora no'));
    } else {
      render(cuerpo, icon,
        h('h1', { class: 'alta-titulo' }, 'Tenela a mano'),
        h('p', { class: 'alta-texto' }, esAndroid()
          ? 'Abrí el menú del navegador (⋮) y tocá “Instalar app” o “Agregar a la pantalla principal”.'
          : 'Desde el teléfono vas a poder instalarla en la pantalla de inicio. Acá seguimos en el navegador.'));
      render(pie, h('button', { class: 'boton primario ancho', type: 'button', onClick: () => ctx.siguiente() }, 'Seguir'));
    }
  };
  const quitar = alCambiarInstalable(() => { if (cuerpo.isConnected) pintar(); else quitar(); });
  pintar();
  return [cuerpo, pie];
}

function pasoCuenta(ctx) {
  if (ctx.cuenta) {
    setTimeout(() => ctx.siguiente());
    return [esperando('Un momento…')];
  }
  return [
    h('div', { class: 'alta-cuerpo' },
      marcoCara({ modo: 'dormida', lado: 120, etiqueta: 'Un ROOTKIT dormido' }),
      h('h1', { class: 'alta-titulo' }, 'Tu cuenta'),
      h('p', { class: 'alta-texto' },
        'Tu ROOTKIT va a quedar a tu nombre, y todo lo que mida se guarda ahí. Entrá desde cualquier teléfono y está todo.'),
      formularioCuenta(ctx, {
        modo: 'crear',
        alListo: async (r) => {
          await ctx.alEntrar(r, { quedarse: true });
          ctx.siguiente();
        },
      })),
  ];
}

function pasoAvisos(ctx) {
  const motivo = motivoSinAvisos();
  const error = h('p', { class: 'errores', role: 'alert', hidden: true });
  avisosActivos().then((si) => { if (si) ctx.siguiente(); });

  return [
    h('div', { class: 'alta-cuerpo' },
      h('div', { class: 'maqueta-notif', 'aria-hidden': 'true' },
        h('img', { src: 'caras/incognito.png', alt: '' }),
        h('div', {}, h('b', {}, 'Tu planta tiene sed'), h('span', {}, 'La tierra está al 18 %. Regala hoy.'))),
      h('h1', { class: 'alta-titulo' }, 'Que te avise cuando te necesite'),
      h('p', { class: 'alta-texto' },
        'Sólo cuando haga falta: sed, frío, poca luz o batería baja. De noche, sólo lo urgente.'),
      motivo ? h('p', { class: 'nota' }, motivo) : null,
      error),
    h('div', { class: 'alta-pie' },
      motivo
        ? h('button', { class: 'boton primario ancho', type: 'button', onClick: () => ctx.siguiente() }, 'Seguir')
        : h('button', {
            class: 'boton primario ancho', type: 'button',
            onClick: async (ev) => {
              ev.currentTarget.disabled = true;
              try {
                await activarAvisos(ctx.api);
                ctx.avisar('Listo, te aviso.');
                ctx.siguiente();
              } catch (e) {
                error.textContent = e.message;
                error.hidden = false;
                ev.target.disabled = false;
              }
            },
          }, icono('campana', 20), 'Activar avisos'),
      motivo ? null : h('button', { class: 'enlace-boton', type: 'button', onClick: () => ctx.siguiente() }, 'Ahora no')),
  ];
}

function pasoWifi(ctx) {
  const ssid = `ROOTKIT-${ctx.alta.codigo.slice(0, 4)}`;
  const estado = h('div', {}, esperando('Esperando a tu ROOTKIT…'));
  const lista = h('ol', { class: 'pasos' },
    h('li', { class: 'paso' }, h('span', { class: 'paso-num' }, '1'),
      h('div', {}, h('b', {}, 'Dejalo encendido con el QR'), h('span', {}, 'Enchufado o con batería, mostrando el código.'))),
    h('li', { class: 'paso' }, h('span', { class: 'paso-num' }, '2'),
      h('div', {},
        h('b', {}, 'En los ajustes de wifi, conectate a'),
        h('span', { class: 'red mono' }, icono('wifi', 18), ssid))),
    h('li', { class: 'paso' }, h('span', { class: 'paso-num' }, '3'),
      h('div', {}, h('b', {}, 'Elegí tu wifi y poné la clave'),
        h('span', {}, 'Se abre una página sola. Si no aparece, entrá a 192.168.4.1'))),
    h('li', { class: 'paso' }, h('span', { class: 'paso-num' }, '4'),
      h('div', {}, h('b', {}, 'Volvé acá'), h('span', {}, 'Te aviso apenas llegue.'))));

  let vivo = true;
  let montado = false;
  let intentos = 0;
  const consultar = async () => {
    if (!vivo) return;
    if (!estado.isConnected) {
      /* Todavía no se pintó, o ya se fue de la pantalla: en el segundo caso
         se deja de preguntar. */
      if (montado || ++intentos > 25) return;
      setTimeout(consultar, 200);
      return;
    }
    montado = true;
    try {
      const v = await ctx.api(`/api/vinculo/${ctx.alta.codigo}`);
      if (v.visto) {
        vivo = false;
        [...lista.children].forEach((li) => li.classList.add('hecho'));
        render(estado, h('p', { class: 'espera', style: 'color:var(--verde)' }, icono('tilde', 20), '¡Llegó! Ya está en tu wifi.'));
        setTimeout(() => ctx.siguiente(), 1100);
        return;
      }
    } catch { /* sin red: se reintenta */ }
    setTimeout(consultar, 2500);
  };
  setTimeout(consultar, 50);

  return [
    h('div', { class: 'alta-cuerpo' },
      h('h1', { class: 'alta-titulo' }, 'Conectalo a tu wifi'),
      lista,
      estado,
      h('details', { class: 'nota', style: 'text-align:left;width:100%' },
        h('summary', {}, '¿No aparece la red?'),
        h('p', {}, 'Tu wifi tiene que ser de 2,4 GHz (si tu router muestra dos redes, usá la que no dice 5G). '
          + 'Si el ROOTKIT ya estuvo en otra casa, mantené apretado su botón 10 segundos: los ojos se cierran y vuelve a mostrar el QR con la red nueva.'))),
  ];
}

function pasoVincular(ctx) {
  const cuerpo = h('div', { class: 'alta-cuerpo' }, esperando('Vinculando…'));
  const pie = h('div', { class: 'alta-pie' });

  (async () => {
    try {
      const planta = await ctx.api('/api/vinculo', { metodo: 'POST', cuerpo: { codigo: ctx.alta.codigo } });
      ctx.guardarAlta({ plantaId: planta.id });
      render(cuerpo,
        h('div', { class: 'exito', 'aria-hidden': 'true' }, icono('tilde', 64)),
        h('h1', { class: 'alta-titulo' }, '¡Es tuyo!'),
        h('p', { class: 'alta-texto' }, 'Tu ROOTKIT quedó vinculado. Ahora está dormido, esperando que abras su cofre.'));
      render(pie, h('button', { class: 'boton primario ancho', type: 'button', onClick: () => ctx.siguiente() }, 'Ir al cofre'));
    } catch (e) {
      if (e.estado === 409 && /todavía no se conectó/.test(e.message)) {
        ctx.ir('wifi');
        return;
      }
      render(cuerpo,
        h('h1', { class: 'alta-titulo' }, 'No se pudo vincular'),
        h('p', { class: 'alta-texto' }, e.message),
        /otra cuenta/.test(e.message)
          ? h('p', { class: 'nota' }, 'Si este ROOTKIT era de otra persona, pedile que lo desvincule desde su app, o mantené apretado su botón 10 segundos para reiniciarlo.')
          : null);
      render(pie, h('button', { class: 'boton ancho', type: 'button', onClick: () => ctx.ir('vincular') }, 'Probar de nuevo'));
    }
  })();
  return [cuerpo, pie];
}

function pasoCofre(ctx) {
  if (!ctx.alta.plantaId) {
    setTimeout(() => ctx.ir('vincular'));
    return [esperando('Un momento…')];
  }
  return [
    h('h1', { class: 'alta-titulo', style: 'text-align:center' }, 'Tu cofre'),
    escenaCofre({
      probabilidades: ctx.config?.probabilidades,
      abrir: async () => {
        const m = await ctx.api(`/api/plantas/${ctx.alta.plantaId}/cofre`, { metodo: 'POST' });
        ctx.guardarAlta({ persona: m.id, fondo: m.fondo });
        return m;
      },
      alSeguir: () => ctx.siguiente(),
    }),
  ];
}

function pasoNombre(ctx) {
  const persona = ctx.alta.persona;
  const input = h('input', {
    type: 'text', id: 'nombre-planta', maxlength: '20', autocomplete: 'off', enterkeyhint: 'done',
    placeholder: 'Por ejemplo, Rulo', 'aria-label': 'Nombre',
  });
  const error = h('p', { class: 'errores', role: 'alert', hidden: true });
  const guardar = async (ev) => {
    ev?.preventDefault();
    const nombre = input.value.trim();
    if (!nombre) {
      error.textContent = 'Ponele un nombre.';
      error.hidden = false;
      input.focus();
      return;
    }
    try {
      await ctx.api(`/api/plantas/${ctx.alta.plantaId}`, { metodo: 'PATCH', cuerpo: { nombre } });
      ctx.guardarAlta({ nombre });
      ctx.siguiente();
    } catch (e) {
      error.textContent = e.message;
      error.hidden = false;
    }
  };
  return [
    h('form', { class: 'alta-cuerpo', onSubmit: guardar },
      marcoCara({ persona, animo: 'HAPPY', lado: 168 }, ctx.alta.fondo),
      h('h1', { class: 'alta-titulo' }, '¿Cómo se va a llamar?'),
      input,
      h('div', { class: 'sugerencias' },
        (NOMBRES[persona] || NOMBRES.cresta).map((n) => h('button', {
          type: 'button', onClick: () => { input.value = n; input.focus(); },
        }, n))),
      error),
    h('div', { class: 'alta-pie' },
      h('button', { class: 'boton primario ancho', type: 'button', onClick: guardar }, 'Guardar')),
  ];
}

const tempC = (dc) => `${Math.round(dc / 10)}`;
const milLux = (l) => (l >= 1000 ? `${Math.round(l / 1000)}k` : `${l}`);

export function tarjetaEspecie(e, { confianza = null, foto = null } = {}) {
  return h('div', { class: 'ident' },
    h('div', { class: 'ident-cab' },
      foto ? h('img', { src: foto, alt: 'Tu planta' }) : null,
      h('div', {},
        h('h3', {}, e.nombre),
        e.cientifico ? h('i', {}, e.cientifico) : null)),
    confianza !== null
      ? h('div', { class: 'confianza' }, 'Seguridad', progreso(confianza * 100), `${Math.round(confianza * 100)} %`)
      : null,
    h('div', { class: 'rangos' },
      h('div', { class: 'rango agua' }, icono('gota', 22), h('b', {}, `${e.soil_min}–${e.soil_max} %`), h('span', {}, 'tierra')),
      h('div', { class: 'rango temp' }, icono('termometro', 22), h('b', {}, `${tempC(e.temp_min_dc)}–${tempC(e.temp_max_dc)} °C`), h('span', {}, 'temp.')),
      h('div', { class: 'rango luz' }, icono('sol', 22), h('b', {}, `${milLux(e.lux_min)}–${milLux(e.lux_max)}`), h('span', {}, 'lux'))));
}

/**
 * Identificar por foto y elegir especie. Se usa en el alta y desde el
 * detalle de una planta ("cambiar especie").
 */
export function selectorEspecie(ctx, { alGuardar, textoGuardar = 'Es esta' }) {
  const zona = h('div', { class: 'alta-cuerpo' });
  const pie = h('div', { class: 'alta-pie' });
  const especies = ctx.especies || [];

  const lista = (sugeridas = []) => {
    const sel = h('select', { 'aria-label': 'Especie' },
      h('option', { value: '' }, '— elegí de la lista —'),
      sugeridas.length
        ? h('optgroup', { label: 'Parecidas' }, sugeridas.map((a) => h('option', { value: a.id }, a.nombre)))
        : null,
      h('optgroup', { label: 'Todas' },
        [...especies].sort((a, b) => a.nombre.localeCompare(b.nombre)).map((e) => h('option', { value: e.id }, e.nombre))));
    render(zona,
      h('h1', { class: 'alta-titulo' }, '¿Cuál es?'),
      h('p', { class: 'alta-texto' }, 'Elegila de la lista. Si no está, elegí la más parecida.'),
      sel,
      campoFoto('Probar con otra foto'));
    render(pie, h('button', {
      class: 'boton primario ancho', type: 'button',
      onClick: () => {
        const e = especies.find((x) => x.id === sel.value);
        if (e) alGuardar(e);
      },
    }, 'Guardar'));
  };

  const campoFoto = (texto) => h('label', { class: 'foto-campo', style: 'width:100%' },
    icono('camara', 42), h('span', {}, texto),
    h('input', {
      type: 'file', accept: 'image/*', capture: 'environment', class: 'oculto',
      onChange: (ev) => { const f = ev.target.files?.[0]; if (f) identificar(f); },
    }));

  async function identificar(archivo) {
    let foto;
    try {
      foto = await prepararFoto(archivo);
    } catch (e) {
      ctx.avisar(e.message, true);
      return;
    }
    render(zona,
      h('div', { class: 'escaneando' }, h('img', { src: foto.vista, alt: 'Tu foto' })),
      esperando('Reconociendo tu planta…'));
    render(pie);
    try {
      const r = await ctx.api('/api/identificar', { metodo: 'POST', cuerpo: { image_b64: foto.image_b64, mime: foto.mime } });
      const dudosa = r.confianza < 0.7;
      render(zona,
        h('h1', { class: 'alta-titulo' }, dudosa ? '¿Puede ser esta?' : '¡La reconocí!'),
        tarjetaEspecie(r.especie, { confianza: r.confianza, foto: foto.vista }),
        dudosa ? h('p', { class: 'nota' }, 'No estoy del todo seguro. Si no es, elegila de la lista.') : null,
        r.fuente === 'simulada'
          ? h('p', { class: 'nota' }, 'Modo de prueba: la identificación es simulada. Configurá ANTHROPIC_API_KEY en el servidor para usar la IA real.')
          : null);
      render(pie,
        h('button', { class: 'boton primario ancho', type: 'button', onClick: () => alGuardar(r.especie) }, textoGuardar),
        h('button', { class: 'enlace-boton', type: 'button', onClick: () => lista(r.alternativas?.filter((a) => a.id) || []) }, 'No, es otra'));
    } catch (e) {
      render(zona,
        h('h1', { class: 'alta-titulo' }, 'No pude reconocerla'),
        h('p', { class: 'alta-texto' }, e.message),
        campoFoto('Probar con otra foto'));
      render(pie, h('button', { class: 'enlace-boton', type: 'button', onClick: () => lista() }, 'Elegir de la lista'));
    }
  }

  render(zona,
    h('h1', { class: 'alta-titulo' }, 'Presentame a tu planta'),
    h('p', { class: 'alta-texto' },
      `Sacale una foto a la planta donde pusiste ${ctx.alta?.nombre ? `a ${ctx.alta.nombre}` : 'tu ROOTKIT'}: la reconozco y ajusto todo a lo que necesita.`),
    campoFoto('Sacar la foto'));
  render(pie, h('button', { class: 'enlace-boton', type: 'button', onClick: () => lista() }, 'Elegir de la lista'));
  return [zona, pie];
}

function pasoFoto(ctx) {
  return selectorEspecie(ctx, {
    alGuardar: async (e) => {
      try {
        await ctx.api(`/api/plantas/${ctx.alta.plantaId}`, {
          metodo: 'PATCH', cuerpo: { especie: ctx.especies?.some((x) => x.id === e.id) ? e.id : e },
        });
        ctx.siguiente();
      } catch (err) {
        ctx.avisar(err.message, true);
      }
    },
  });
}

function pasoListo(ctx) {
  const nombre = ctx.alta.nombre || 'Tu ROOTKIT';
  return [
    h('div', { class: 'alta-cuerpo' },
      marcoCara({ persona: ctx.alta.persona, animo: 'HAPPY', lado: 200 }, ctx.alta.fondo),
      h('h1', { class: 'alta-titulo' }, `${nombre} ya te cuida`),
      h('p', { class: 'alta-texto' },
        'Mirá su cara en la maceta: si algo le falta, lo vas a notar. Y si no estás mirando, te aviso acá.')),
    h('div', { class: 'alta-pie' },
      h('button', {
        class: 'boton primario ancho', type: 'button',
        onClick: () => ctx.terminar(ctx.alta.plantaId),
      }, 'Ver a ', nombre)),
  ];
}

const VISTAS = {
  hola: pasoHola, instalar: pasoInstalar, cuenta: pasoCuenta, avisos: pasoAvisos, wifi: pasoWifi,
  vincular: pasoVincular, cofre: pasoCofre, nombre: pasoNombre, foto: pasoFoto, listo: pasoListo,
};

/** Qué pasos se saltean solos en este teléfono. */
export function saltear(paso, { cuenta = null } = {}) {
  if (paso === 'instalar' && (instalada() || (!esIOS() && !esAndroid() && !puedeInstalarConBoton()))) return true;
  if (paso === 'cuenta' && cuenta) return true;
  return false;
}

export function vistaAlta(ctx) {
  const paso = ctx.alta.paso || 'hola';
  const cont = h('div', { class: 'alta' });
  render(cont, barraPasos(paso), (VISTAS[paso] || pasoHola)(ctx));
  return cont;
}
