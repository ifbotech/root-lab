/* El flujo completo, de punta a punta, sin abrir un socket.
 *
 * Un aparato virtual (con la misma derivación de código y token que el
 * firmware) y una cuenta recorren exactamente lo que recorre un usuario:
 * QR, wifi, vínculo, cofre, nombre, foto, lecturas, avisos, desvincular y
 * volver a vincular. Si esta suite está verde, el camino feliz existe y los
 * caminos feos no rompen nada.
 */
import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

import { crearApi, diaLocal, bateriaPct } from '../server/api.mjs';
import { crearAlmacen } from '../server/almacen.mjs';
import { crearIA } from '../server/ia.mjs';
import { crearPushDePrueba } from '../server/push.mjs';
import { codigoVinculo, tokenApi } from '../server/codigo.mjs';

const H = 3600 * 1000;
const T0 = Date.parse('2026-09-16T15:00:00-03:00');

function escenario() {
  const reloj = { t: T0 };
  const almacen = crearAlmacen();
  const push = crearPushDePrueba();
  const api = crearApi({
    almacen, push, ia: crearIA({ clave: '' }),
    reloj: () => reloj.t,
    azar: (n) => 0,
  });
  const llamar = (metodo, ruta, { cuerpo = null, token = null, query = {}, ip = '1.2.3.4' } = {}) =>
    api.manejar({
      metodo, ruta, cuerpo, query, ip,
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
  return { reloj, almacen, push, api, llamar };
}

/* Un ROOTKIT de mentira que habla igual que el de verdad. */
function aparato(esc, { persona = 'kawaii', id = 'A1B2C3D4E5F6' } = {}) {
  const secreto = randomBytes(16);
  const yo = {
    id, secreto, token: tokenApi(secreto), epoca: 0, reloj: 1000, arranques: 1,
    vinculado: false, pendientes: [],
    get codigo() { return codigoVinculo(secreto, this.epoca); },
  };
  yo.medir = (l) => {
    yo.pendientes.push({ ...l, reloj: yo.reloj });
  };
  yo.sync = async (extra = {}) => {
    const cuerpo = {
      id: yo.id, fw: '0.5.0', placa: 'c3-supermini', pantalla: 'ili9341-240x320',
      persona, estado: yo.vinculado ? 'ACTIVO' : 'SIN_VINCULO', epoca: yo.epoca,
      ...(yo.vinculado ? {} : { codigo: yo.codigo }),
      reloj: yo.reloj, rssi: -60, usb: false, bat_mv: 3900, arranques: yo.arranques,
      lecturas: yo.pendientes.map(({ reloj, ...l }) => ({ hace: yo.reloj - reloj, ...l })),
      ...extra,
    };
    const [codigo, r] = await esc.llamar('POST', '/api/d/sync', { cuerpo, token: yo.token });
    if (codigo === 200) {
      yo.pendientes.splice(0, r.aceptadas);
      if (yo.vinculado && !r.vinculado) yo.epoca += 1;
      yo.vinculado = r.vinculado;
    }
    return [codigo, r];
  };
  yo.pasar = (segundos) => {
    yo.reloj += segundos;
    esc.reloj.t += segundos * 1000;
  };
  return yo;
}

async function cuenta(esc) {
  const [c, r] = await esc.llamar('POST', '/api/cuenta', { cuerpo: { tz: 'America/Argentina/Buenos_Aires' } });
  assert.equal(c, 201);
  return r.token;
}

const FOTO = 'x'.repeat(4000);

describe('el primer encendido hasta la cara', () => {
  let esc;
  beforeEach(() => { esc = escenario(); });

  test('flujo completo', async () => {
    const maceta = aparato(esc);
    const token = await cuenta(esc);

    /* El QR ya se escaneó, pero la maceta todavía no tiene wifi. */
    let [c, v] = await esc.llamar('GET', `/api/vinculo/${maceta.codigo}`, { token });
    assert.equal(c, 200);
    assert.equal(v.visto, false, 'sin wifi la nube no la conoce');
    assert.equal(v.ssid, `ROOTKIT-${maceta.codigo.slice(0, 4)}`);
    [c] = await esc.llamar('POST', '/api/vinculo', { token, cuerpo: { codigo: maceta.codigo } });
    assert.equal(c, 409, 'no se puede vincular algo que nunca se conectó');

    /* Se conecta al wifi y se presenta. */
    let [cs, rs] = await maceta.sync();
    assert.equal(cs, 200);
    assert.equal(rs.ok, true);
    assert.equal(rs.vinculado, false);

    [c, v] = await esc.llamar('GET', `/api/vinculo/${maceta.codigo.toLowerCase()}`, { token });
    assert.equal(v.visto, true);
    assert.equal(v.en_linea, true);
    assert.equal(v.libre, true);

    /* La app la reclama, con el código como lo tipea una persona. */
    const tipeado = `${maceta.codigo.slice(0, 4)}-${maceta.codigo.slice(4)}`.toLowerCase();
    let [cv, planta] = await esc.llamar('POST', '/api/vinculo', { token, cuerpo: { codigo: tipeado } });
    assert.equal(cv, 201);
    assert.equal(planta.revelado, false);
    assert.equal(planta.mood, 'SLEEPING', 'antes del cofre la maceta duerme');

    [cs, rs] = await maceta.sync();
    assert.equal(rs.vinculado, true);
    assert.equal(rs.revelado, false);
    assert.equal(rs.persona, '', 'el personaje no se filtra antes del cofre');

    /* Se abre el cofre: sale la persona de fábrica. */
    const [cc, cofre] = await esc.llamar('POST', `/api/plantas/${planta.id}/cofre`, { token });
    assert.equal(cc, 200);
    assert.equal(cofre.id, 'kawaii');
    assert.equal(cofre.nuevo, true);
    assert.equal(cofre.de_fabrica, true);
    const [, otraVez] = await esc.llamar('POST', `/api/plantas/${planta.id}/cofre`, { token });
    assert.equal(otraVez.id, 'kawaii', 'abrirlo dos veces no vuelve a tirar');
    assert.equal(otraVez.nuevo, false);

    [cs, rs] = await maceta.sync();
    assert.equal(rs.revelado, true, 'la maceta se entera y abre los ojos');
    assert.equal(rs.persona, 'kawaii');

    /* Nombre y foto. */
    let [cp, p] = await esc.llamar('PATCH', `/api/plantas/${planta.id}`, { token, cuerpo: { nombre: 'Rulo' } });
    assert.equal(cp, 200);
    assert.equal(p.nombre, 'Rulo');
    const [ci, ident] = await esc.llamar('POST', '/api/identificar', {
      token, cuerpo: { image_b64: FOTO, mime: 'image/jpeg' },
    });
    assert.equal(ci, 200);
    assert.ok(ident.especie?.id);
    assert.equal(ident.fuente, 'simulada');
    [cp, p] = await esc.llamar('PATCH', `/api/plantas/${planta.id}`, { token, cuerpo: { especie: 'monstera' } });
    assert.equal(p.especie, 'monstera');

    [cs, rs] = await maceta.sync();
    assert.equal(rs.nombre, 'Rulo');
    assert.equal(rs.especie.id, 'monstera');
    assert.equal(rs.especie.suelo_min, 25, 'los umbrales viajan en el formato del firmware');
    assert.equal(rs.especie.temp_min, 180);

    /* Mide, se seca, pide agua. */
    await esc.llamar('POST', '/api/push/suscripcion', {
      token,
      cuerpo: { suscripcion: { endpoint: 'https://push.ejemplo/abc', keys: { p256dh: 'k', auth: 'a' } } },
    });
    maceta.medir({ suelo: 40, temp: 230, hr: 60, lux: 5000, animo: 'HAPPY', sev: 'OK' });
    maceta.pasar(900);
    maceta.medir({ suelo: 12, temp: 231, hr: 58, lux: 5200, animo: 'THIRSTY', sev: 'URGENT' });
    maceta.pasar(30);
    [cs, rs] = await maceta.sync();
    assert.equal(rs.aceptadas, 2);
    assert.equal(esc.push.enviados.length, 1, 'un aviso de sed');
    assert.match(esc.push.enviados[0].titulo, /Rulo tiene sed/);
    assert.match(esc.push.enviados[0].cuerpo, /12 %/);
    assert.equal(esc.push.enviados[0].icono, 'caras/kawaii-THIRSTY.png', 'relativo a la app, para que ande en una subruta');

    /* La misma sed en la próxima lectura no vuelve a avisar. */
    maceta.medir({ suelo: 11, temp: 231, hr: 58, lux: 5200, animo: 'THIRSTY', sev: 'URGENT' });
    maceta.pasar(900);
    await maceta.sync();
    assert.equal(esc.push.enviados.length, 1, 'se avisa por estado, no por lectura');

    /* El tablero. */
    const [ce, estado] = await esc.llamar('GET', '/api/estado', { token });
    assert.equal(ce, 200);
    assert.equal(estado.nodes.length, 1);
    const n = estado.nodes[0];
    assert.equal(n.mood, 'THIRSTY');
    assert.equal(n.severity, 'URGENT');
    assert.equal(n.tel.soil_pct, 11);
    assert.equal(n.modelo, 'kawaii');
    assert.equal(n.link, 'VIVO');
    assert.equal(estado.coleccion.tengo.includes('kawaii'), true);

    const [ch, hist] = await esc.llamar('GET', `/api/plantas/${planta.id}/historial`, { token, query: { horas: '24' } });
    assert.equal(ch, 200);
    assert.equal(hist.puntos.length, 3);
    assert.equal(hist.puntos[1].mood, 'THIRSTY');
  });

  test('una respuesta perdida no duplica lecturas', async () => {
    const maceta = aparato(esc);
    await maceta.sync();
    maceta.medir({ suelo: 40, animo: 'HAPPY', sev: 'OK' });
    maceta.pasar(60);
    const cuerpo = {
      id: maceta.id, epoca: 0, reloj: maceta.reloj, arranques: 1, codigo: maceta.codigo,
      lecturas: [{ hace: 60, suelo: 40, animo: 'HAPPY', sev: 'OK' }],
    };
    await esc.llamar('POST', '/api/d/sync', { cuerpo, token: maceta.token });
    await esc.llamar('POST', '/api/d/sync', { cuerpo, token: maceta.token });
    assert.equal(esc.almacen.datos.lecturas[maceta.id].length, 1);
  });

  test('un token que no es el suyo no entra', async () => {
    const maceta = aparato(esc);
    await maceta.sync();
    const [c] = await esc.llamar('POST', '/api/d/sync', {
      cuerpo: { id: maceta.id, epoca: 0 }, token: tokenApi(randomBytes(16)),
    });
    assert.equal(c, 401);
    const [c2] = await esc.llamar('POST', '/api/d/sync', { cuerpo: { id: 'nada' }, token: maceta.token });
    assert.equal(c2, 400);
  });

  test('sin confianza al primer uso, un aparato desconocido no entra', async () => {
    const almacen = crearAlmacen();
    const api = crearApi({ almacen, ia: crearIA({ clave: '' }), tofu: false });
    const s = randomBytes(16);
    const [c] = await api.manejar({
      metodo: 'POST', ruta: '/api/d/sync', headers: { authorization: `Bearer ${tokenApi(s)}` },
      cuerpo: { id: 'AABBCCDDEEFF', epoca: 0 },
    });
    assert.equal(c, 401);
  });
});

describe('vincular, desvincular y volver a empezar', () => {
  let esc;
  beforeEach(() => { esc = escenario(); });

  async function vinculada() {
    const maceta = aparato(esc, { persona: '' });
    const token = await cuenta(esc);
    await maceta.sync();
    const [, planta] = await esc.llamar('POST', '/api/vinculo', { token, cuerpo: { codigo: maceta.codigo } });
    await maceta.sync();
    return { maceta, token, planta };
  }

  test('otra cuenta no puede reclamar una maceta ajena', async () => {
    const { maceta, planta } = await vinculada();
    const otro = await cuenta(esc);
    /* El código ya no se muestra, pero alguien le sacó una foto antes. */
    const [c, r] = await esc.llamar('POST', '/api/vinculo', { token: otro, cuerpo: { codigo: codigoVinculo(maceta.secreto, 0) } });
    assert.equal(c, 409);
    assert.match(r.error, /otra cuenta/);
    const [c2] = await esc.llamar('GET', `/api/plantas/${planta.id}`, { token: otro });
    assert.equal(c2, 404, 'ni siquiera la ve');
  });

  test('sin persona de fábrica, el cofre tira', async () => {
    const { token, planta } = await vinculada();
    const [, cofre] = await esc.llamar('POST', `/api/plantas/${planta.id}/cofre`, { token });
    assert.equal(cofre.de_fabrica, false);
    assert.equal(cofre.rareza, 'COMUN', 'con azar 0 sale el primer común');
  });

  test('desvincular desde la app devuelve el QR con código nuevo', async () => {
    const { maceta, token, planta } = await vinculada();
    const viejo = maceta.codigo;
    const [c] = await esc.llamar('DELETE', `/api/plantas/${planta.id}`, { token });
    assert.equal(c, 204);
    const [, r] = await maceta.sync();
    assert.equal(r.vinculado, false);
    assert.notEqual(maceta.codigo, viejo, 'la maceta sube de época');
    await maceta.sync();
    const [, v] = await esc.llamar('GET', `/api/vinculo/${viejo}`, { token });
    assert.equal(v.visto, false, 'el QR viejo dejó de valer');
    const [cv] = await esc.llamar('POST', '/api/vinculo', { token, cuerpo: { codigo: maceta.codigo } });
    assert.equal(cv, 201, 'y el nuevo vincula');
  });

  test('el botón largo en la maceta rompe el vínculo en la nube', async () => {
    const { maceta, token } = await vinculada();
    maceta.epoca += 1;                  /* borrón y cuenta nueva */
    maceta.vinculado = false;
    const [, r] = await maceta.sync();
    assert.equal(r.vinculado, false);
    const [, estado] = await esc.llamar('GET', '/api/estado', { token });
    assert.equal(estado.nodes.length, 0);
  });

  test('el historial no muestra lo que midió para el dueño anterior', async () => {
    const { maceta, token, planta } = await vinculada();
    maceta.medir({ suelo: 33, animo: 'HAPPY', sev: 'OK' });
    maceta.pasar(60);
    await maceta.sync();
    await esc.llamar('DELETE', `/api/plantas/${planta.id}`, { token });
    await maceta.sync();
    maceta.pasar(60);
    await maceta.sync();
    const otro = await cuenta(esc);
    const [, nueva] = await esc.llamar('POST', '/api/vinculo', { token: otro, cuerpo: { codigo: maceta.codigo } });
    const [, hist] = await esc.llamar('GET', `/api/plantas/${nueva.id}/historial`, { token: otro });
    assert.equal(hist.puntos.length, 0);
  });

  test('una cuenta se puede pasar a la app instalada con un código', async () => {
    const { token, planta } = await vinculada();
    const [c, tr] = await esc.llamar('POST', '/api/cuenta/transferir', { token });
    assert.equal(c, 201);
    const [cr, rec] = await esc.llamar('POST', '/api/cuenta/recuperar', { cuerpo: { codigo: tr.codigo.toLowerCase() } });
    assert.equal(cr, 200);
    const [, estado] = await esc.llamar('GET', '/api/estado', { token: rec.token });
    assert.equal(estado.nodes[0].id, planta.id);
    const [cr2] = await esc.llamar('POST', '/api/cuenta/recuperar', { cuerpo: { codigo: tr.codigo } });
    assert.equal(cr2, 404, 'el código es de un solo uso');
  });
});

describe('vínculo y días sanos', () => {
  test('los días sanos avanzan con el día local y una urgencia corta la racha', async () => {
    const esc = escenario();
    const maceta = aparato(esc);
    const token = await cuenta(esc);
    await maceta.sync();
    const [, planta] = await esc.llamar('POST', '/api/vinculo', { token, cuerpo: { codigo: maceta.codigo } });
    await esc.llamar('POST', `/api/plantas/${planta.id}/cofre`, { token });
    await maceta.sync();

    const dia = async (sev) => {
      maceta.medir({ suelo: 40, animo: sev === 'URGENT' ? 'THIRSTY' : 'HAPPY', sev });
      maceta.pasar(24 * 3600);
      return maceta.sync();
    };
    await dia('OK');
    await dia('OK');
    let [, r] = await dia('OK');
    assert.equal(r.vinculo.dias_sanos, 2, 'el día de hoy todavía no cerró');
    assert.equal(r.vinculo.racha, 2);
    [, r] = await dia('URGENT');
    [, r] = await dia('OK');
    assert.equal(r.vinculo.racha, 0, 'el día urgente cortó la racha');
    assert.equal(r.vinculo.dias_sanos, 3, 'pero no borró lo acumulado');
    assert.equal(r.vinculo.mejor_racha, 3);
  });

  test('el día local respeta la zona horaria', () => {
    const t = Date.parse('2026-09-17T01:30:00Z');
    assert.equal(diaLocal(t, 'America/Argentina/Buenos_Aires'), '2026-09-16');
    assert.equal(diaLocal(t, 'Europe/Madrid'), '2026-09-17');
  });
});

describe('bordes de la API', () => {
  let esc;
  beforeEach(() => { esc = escenario(); });

  test('sin sesión no hay datos', async () => {
    assert.equal((await esc.llamar('GET', '/api/estado'))[0], 401);
    assert.equal((await esc.llamar('GET', '/api/estado', { token: 'inventado' }))[0], 401);
  });

  test('un código mal formado se rechaza', async () => {
    const token = await cuenta(esc);
    assert.equal((await esc.llamar('GET', '/api/vinculo/HOLA', { token }))[0], 400);
    assert.equal((await esc.llamar('POST', '/api/vinculo', { token, cuerpo: { codigo: '#' } }))[0], 400);
  });

  test('adivinar códigos tiene límite', async () => {
    let ultimo;
    for (let i = 0; i < 100; i++) {
      [ultimo] = await esc.llamar('GET', '/api/vinculo/K7Q2M9XA', { ip: '9.9.9.9' });
    }
    assert.equal(ultimo, 429);
  });

  test('una especie incoherente no se guarda', async () => {
    const maceta = aparato(esc);
    const token = await cuenta(esc);
    await maceta.sync();
    const [, planta] = await esc.llamar('POST', '/api/vinculo', { token, cuerpo: { codigo: maceta.codigo } });
    const [c] = await esc.llamar('PATCH', `/api/plantas/${planta.id}`, {
      token, cuerpo: { especie: { id: 'rara', nombre: 'Rara', soil_min: 80, soil_max: 10, temp_min_dc: 1, temp_max_dc: 2, rh_min: 1, lux_min: 1, lux_max: 2 } },
    });
    assert.equal(c, 400);
    const [c2, p] = await esc.llamar('PATCH', `/api/plantas/${planta.id}`, {
      token, cuerpo: { especie: { id: 'Rara Planta', nombre: 'Rara', soil_min: 10, soil_max: 80, temp_min_dc: 100, temp_max_dc: 300, rh_min: 40, lux_min: 100, lux_max: 9000 } },
    });
    assert.equal(c2, 200);
    assert.equal(p.especie, 'rara-planta');
    const [, estado] = await esc.llamar('GET', '/api/estado', { token });
    assert.ok(estado.especies.some((e) => e.id === 'rara-planta'), 'la propia aparece en la lista');
  });

  test('una foto que no es foto se rechaza', async () => {
    const token = await cuenta(esc);
    const [c, r] = await esc.llamar('POST', '/api/identificar', { token, cuerpo: { image_b64: 'abc' } });
    assert.equal(c, 400);
    assert.match(r.error, /foto/);
  });

  test('las suscripciones vencidas se limpian solas', async () => {
    const token = await cuenta(esc);
    await esc.llamar('POST', '/api/push/suscripcion', {
      token, cuerpo: { suscripcion: { endpoint: 'https://push.ejemplo/vencida', keys: { p256dh: 'k', auth: 'a' } } },
    });
    const [, r] = await esc.llamar('POST', '/api/push/probar', { token });
    assert.equal(r.enviados, 0);
    const [, c] = await esc.llamar('GET', '/api/cuenta', { token });
    assert.equal(c.avisos, 0);
  });

  test('una ruta que no existe es 404 y no explota', async () => {
    assert.equal((await esc.llamar('GET', '/api/nada'))[0], 404);
  });

  test('la batería sigue la curva del firmware', () => {
    assert.equal(bateriaPct(4200), 100);
    assert.equal(bateriaPct(3000), 0);
    assert.equal(bateriaPct(0), null);
    assert.ok(bateriaPct(3800) > bateriaPct(3700));
  });

  test('una maceta que no reporta en 6 h avisa una vez', async () => {
    const maceta = aparato(esc);
    const token = await cuenta(esc);
    await maceta.sync();
    const [, planta] = await esc.llamar('POST', '/api/vinculo', { token, cuerpo: { codigo: maceta.codigo } });
    await esc.llamar('POST', `/api/plantas/${planta.id}/cofre`, { token });
    await esc.llamar('PATCH', `/api/plantas/${planta.id}`, { token, cuerpo: { nombre: 'Tito' } });
    await esc.llamar('POST', '/api/push/suscripcion', {
      token, cuerpo: { suscripcion: { endpoint: 'https://push.ejemplo/1', keys: { p256dh: 'k', auth: 'a' } } },
    });
    await maceta.sync();
    esc.reloj.t += 7 * H;
    assert.equal(await esc.api.revisar(), 1);
    assert.match(esc.push.enviados.at(-1).titulo, /Tito no reporta hace 7 h/);
    esc.reloj.t += H;
    assert.equal(await esc.api.revisar(), 0);
    const [, estado] = await esc.llamar('GET', '/api/estado', { token });
    assert.equal(estado.nodes[0].link, 'CAIDO');
    assert.equal(estado.nodes[0].mood, 'OFFLINE');
  });
});
