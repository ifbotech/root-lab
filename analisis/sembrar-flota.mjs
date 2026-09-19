/* Una flota de mentira para mirar la trastienda con datos: aparatos de dos
 * lotes, con firmware distinto, algunos vinculados, uno callado, uno con el
 * sensor roto, y unas cuantas ideas en el vivero. */
import { randomBytes } from 'node:crypto';
import { codigoVinculo, tokenApi } from '../server/codigo.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:8090';
const ADMIN = process.env.ADMIN || 'clave-local-de-administracion-para-pruebas';
const pedir = async (metodo, ruta, cuerpo, token) => {
  const r = await fetch(`${BASE}${ruta}`, {
    method: metodo,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const j = r.status === 204 ? null : await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${metodo} ${ruta} ${r.status} ${JSON.stringify(j)}`);
  return j;
};

/* Una cuenta que va a estrenar tres aparatos. */
const clave = 'una clave segura';
const reg = await pedir('POST', '/api/cuenta/registro', {
  email: `duenio-${randomBytes(3).toString('hex')}@ejemplo.com`, clave, nombre: 'Rocío', tz: 'America/Argentina/Buenos_Aires',
});

const H = 3600e3;
let n = 0;
async function rooti({ lote, fw, persona, vincular = true, callado = false, sensorRoto = false, dias = 3 }) {
  n += 1;
  const secreto = randomBytes(16);
  const id = `AB${String(n).padStart(10, '0')}`;
  const tok = tokenApi(secreto);
  const codigo = codigoVinculo(secreto, 0);
  /* El reloj del aparato son segundos desde que arrancó, y una lectura vieja
     se manda con `hace` en segundos: el reloj tiene que ser MÁS grande que la
     lectura más vieja, o el servidor la descarta por repetida (y hace bien). */
  let reloj = dias * 86400 + 5000;
  const sync = (extra = {}) => pedir('POST', '/api/d/sync', {
    id, fw, placa: 'c3-supermini', pantalla: 'st7735-128', persona, estado: 'SIN_VINCULO',
    epoca: 0, codigo, reloj: (reloj += 1000), rssi: -50 - n * 3, usb: false, bat_mv: 4000 - n * 90,
    arranques: 1, lote, lecturas: [], ...extra,
  }, tok);

  /* La fábrica lo registra antes de venderlo. */
  await pedir('POST', '/api/admin/aparatos', { id, token: tok, persona, lote }, ADMIN);
  await sync();
  if (!vincular) return;

  const planta = await pedir('POST', '/api/vinculo', { codigo }, reg.token);
  await pedir('POST', '/api/cofre/abrir', { planta: planta.id }, reg.token);
  await pedir('PATCH', `/api/plantas/${planta.id}`, { nombre: `Planta ${n}`, especie: 'monstera' }, reg.token);

  /* Historial: una lectura cada dos horas, con algún sensor roto si toca. */
  const lecturas = [];
  for (let h = dias * 12; h > 0; h--) {
    lecturas.push({
      hace: h * 2 * 3600,
      suelo: sensorRoto ? null : 30 + ((h * 7) % 30),
      suelo_raw: sensorRoto ? 4095 : 1800 + ((h * 31) % 600),
      temp: 200 + ((h * 3) % 80),
      hr: sensorRoto ? null : 45 + ((h * 5) % 25),
      lux: 500 + ((h * 137) % 9000),
      bat: 3900 - h * 4,
      animo: h % 9 === 0 ? 'THIRSTY' : 'HAPPY',
      sev: h % 9 === 0 ? 'WARN' : 'OK',
    });
  }
  /* De a tandas, que el servidor acepta hasta unas cuantas por sync. */
  for (let i = 0; i < lecturas.length; i += 12) {
    await sync({ estado: 'ACTIVO', lecturas: lecturas.slice(i, i + 12) });
  }
  if (!callado) await sync({ estado: 'ACTIVO', lecturas: [] });
}

await rooti({ lote: 'L2609', fw: '0.6.0', persona: 'brote' });
await rooti({ lote: 'L2609', fw: '0.6.0', persona: 'musgo', sensorRoto: true });
await rooti({ lote: 'L2609', fw: '0.5.0', persona: 'champi', callado: true });
await rooti({ lote: 'L2610', fw: '0.6.0', persona: 'bulbo', vincular: false });
await rooti({ lote: 'L2610', fw: '0.6.0', persona: 'pinchito', vincular: false });

/* Uso de la app: pasos del alta y pantallas. */
const evento = (e) => pedir('POST', '/api/evento', { evento: e }).catch(() => {});
const PASOS = ['hola', 'instalar', 'cuenta', 'avisos', 'wifi', 'vincular', 'cofre', 'nombre', 'foto', 'listo'];
for (let i = 0; i < PASOS.length; i++) {
  for (let k = 0; k < 20 - i * 2; k++) await evento(`alta:${PASOS[i]}`);
}
for (const [v, veces] of [['coleccion', 34], ['invernadero', 21], ['chat', 15], ['album', 9], ['pasaporte', 3], ['desk', 7], ['calibrar', 5]]) {
  for (let k = 0; k < veces; k++) await evento(`vista:${v}`);
}

/* Unas ideas en el vivero, como las dejaría un agente. */
const ideas = [
  ['infraestructura', 'Mover los respaldos cifrados a un bucket fuera del VPS', 'alto', 'bajo', 'agente-infra', 'Hoy la copia diaria queda en el mismo disco que la base: protege de un error, no de perder el VPS.', 'docs/operacion.md, ROOTLAB_RESPALDO_DESTINO sin configurar'],
  ['experiencia', 'Mostrar en el alta cuánto falta para terminar', 'medio', 'bajo', 'agente-ux', 'La barra de pasos no dice cuántos quedan; con diez pasos, saberlo baja el abandono.', 'uso: alta:wifi pierde 28 % contra alta:avisos'],
  ['firmware', 'Medir el consumo real en deep sleep antes de prometer seis meses', 'alto', 'medio', 'agente-fw', 'La autonomía publicada es una estimación de hoja de cálculo, no una medición.', 'root-kit/docs/hardware.md'],
  ['producto', 'Preguntar la especie antes del cofre', 'medio', 'medio', 'agente-producto', 'Con la especie cargada antes, el Rooti nace sabiendo qué cuidar.', ''],
  ['seguridad', 'Rotar la clave maestra con tools/rotar-secreto.mjs', 'medio', 'alto', 'agente-seguridad', 'No existe todavía y es lo único que no se puede improvisar si se filtra.', 'roadmap: pendiente'],
];
for (const [area, titulo, impacto, esfuerzo, autor, detalle, evidencia] of ideas) {
  await pedir('POST', '/api/admin/ideas', { area, titulo, impacto, esfuerzo, autor, detalle, evidencia }, ADMIN);
}
/* Una repetida, como haría un agente que da vueltas. */
await pedir('POST', '/api/admin/ideas', { area: 'infraestructura', titulo: 'Mover los respaldos cifrados a un bucket, fuera del VPS', impacto: 'alto', esfuerzo: 'bajo', autor: 'agente-infra' }, ADMIN);

console.log('sembrado. cuenta:', reg.cuenta.email);
