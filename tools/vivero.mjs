/* vivero.mjs — anotar y mirar las ideas de la trastienda desde la terminal.
 *
 * Es la puerta por la que escriben los agentes que revisan el proyecto: cada
 * uno mira un área, encuentra algo y lo deja anotado acá, con su impacto y su
 * esfuerzo. Después, en la trastienda (/admin), se decide qué se planta.
 *
 *   node tools/vivero.mjs proponer --area infraestructura \
 *        --titulo "Mover los respaldos cifrados fuera del VPS" \
 *        --impacto alto --esfuerzo bajo --autor agente-infra \
 *        --detalle "Por qué, y cómo se haría" \
 *        --evidencia "docs/operacion.md: ROOTLAB_RESPALDO_DESTINO sin configurar"
 *
 *   node tools/vivero.mjs listar [--area X] [--estado nueva] [--json]
 *   node tools/vivero.mjs mover <id> --estado plantada [--motivo "..."]
 *   node tools/vivero.mjs areas
 *
 * La clave va en ROOTLAB_ADMIN_CLAVE (nunca en la línea de comandos, que
 * queda en el historial). La nube, en ROOTLAB_NUBE o --nube; por defecto, la
 * de casa.
 *
 * Proponer dos veces la misma idea no la duplica: el servidor la reconoce por
 * el título y la cuenta otra vez (docs/trastienda.md).
 */
const [orden, ...resto] = process.argv.slice(2);
const opciones = {};
const sueltos = [];
for (let i = 0; i < resto.length; i++) {
  if (resto[i].startsWith('--')) {
    opciones[resto[i].slice(2)] = resto[i + 1]?.startsWith('--') || resto[i + 1] === undefined ? true : resto[++i];
  } else sueltos.push(resto[i]);
}

const NUBE = String(opciones.nube || process.env.ROOTLAB_NUBE || 'http://localhost:8080').replace(/\/+$/, '');
const CLAVE = process.env.ROOTLAB_ADMIN_CLAVE || '';
const salir = (mensaje) => { console.error(mensaje); process.exit(1); };

async function api(ruta, { metodo = 'GET', cuerpo } = {}) {
  if (!CLAVE) salir('Falta ROOTLAB_ADMIN_CLAVE en el entorno.');
  let r;
  try {
    r = await fetch(`${NUBE}/api/admin${ruta}`, {
      method: metodo,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${CLAVE}` },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
  } catch (e) {
    return salir(`No pude hablar con ${NUBE}: ${e.message}`);
  }
  const datos = r.status === 204 ? null : await r.json().catch(() => ({}));
  if (!r.ok) return salir(`${metodo} ${ruta} respondió ${r.status}: ${datos?.error || ''}`);
  return datos;
}

const ESTADO_ES = { nueva: 'sin decidir', en_curso: 'en curso', plantada: 'plantada', descartada: 'descartada' };

function imprimir(ideas) {
  if (!ideas.length) {
    console.log('El vivero está vacío con ese filtro.');
    return;
  }
  ideas.forEach((i, n) => {
    console.log(`\n${String(n + 1).padStart(3)}. [${i.area}] ${i.titulo}`);
    console.log(`     impacto ${i.impacto} · esfuerzo ${i.esfuerzo} · ${ESTADO_ES[i.estado]}`
      + `${i.vista > 1 ? ` · propuesta ${i.vista} veces` : ''} · ${i.autor || 'a mano'} · #${i.id}`);
    if (i.detalle) console.log(`     ${i.detalle.replace(/\n/g, '\n     ')}`);
    if (i.evidencia) console.log(`     ← ${i.evidencia.replace(/\n/g, ' ')}`);
  });
  console.log('');
}

switch (orden) {
  case 'proponer': {
    const cuerpo = {
      area: String(opciones.area || ''),
      titulo: String(opciones.titulo || ''),
      detalle: String(opciones.detalle || ''),
      evidencia: String(opciones.evidencia || ''),
      impacto: String(opciones.impacto || 'medio'),
      esfuerzo: String(opciones.esfuerzo || 'medio'),
      autor: String(opciones.autor || 'terminal'),
    };
    if (!cuerpo.area || !cuerpo.titulo) salir('Hacen falta --area y --titulo.');
    const r = await api('/ideas', { metodo: 'POST', cuerpo });
    console.log(r.repetida
      ? `Ya estaba: #${r.id}, propuesta ${r.idea.vista} veces (${ESTADO_ES[r.estado]}).`
      : `Anotada en el vivero: #${r.id}.`);
    break;
  }

  case 'listar': {
    const q = new URLSearchParams();
    if (opciones.area) q.set('area', String(opciones.area));
    if (opciones.estado) q.set('estado', String(opciones.estado));
    const r = await api(`/ideas${q.toString() ? `?${q}` : ''}`);
    if (opciones.json) {
      console.log(JSON.stringify(r.ideas, null, 2));
      break;
    }
    const porEstado = r.resumen.por_estado.map((e) => `${e.n} ${ESTADO_ES[e.estado]}`).join(' · ');
    console.log(`El vivero: ${porEstado || 'vacío'}`);
    imprimir(r.ideas);
    break;
  }

  case 'mover': {
    const id = Number(sueltos[0]);
    if (!id) salir('Falta el número de la idea: vivero.mjs mover 12 --estado plantada');
    const r = await api(`/ideas/${id}`, {
      metodo: 'PATCH',
      cuerpo: {
        ...(opciones.estado ? { estado: String(opciones.estado) } : {}),
        ...(opciones.impacto ? { impacto: String(opciones.impacto) } : {}),
        ...(opciones.esfuerzo ? { esfuerzo: String(opciones.esfuerzo) } : {}),
        ...(opciones.motivo ? { motivo: String(opciones.motivo) } : {}),
      },
    });
    console.log(`#${r.id} quedó ${ESTADO_ES[r.estado]}.`);
    break;
  }

  case 'areas': {
    const r = await api('/ideas?limite=1');
    console.log(r.areas.join('\n'));
    break;
  }

  default:
    console.log(`Uso:
  node tools/vivero.mjs proponer --area <área> --titulo "..." [--impacto alto|medio|bajo]
       [--esfuerzo bajo|medio|alto] [--detalle "..."] [--evidencia "..."] [--autor nombre]
  node tools/vivero.mjs listar [--area <área>] [--estado nueva|en_curso|plantada|descartada] [--json]
  node tools/vivero.mjs mover <id> --estado plantada [--motivo "..."]
  node tools/vivero.mjs areas

  ROOTLAB_ADMIN_CLAVE   la clave de administración (obligatoria)
  ROOTLAB_NUBE          dónde está el servidor (por defecto http://localhost:8080)`);
    process.exit(orden ? 1 : 0);
}
