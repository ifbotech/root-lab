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

import { crearApi, diaLocal, bateriaPct, SESION_VENCE_MS } from '../server/api.mjs';
import { abrirBase } from '../server/db.mjs';
import { crearIA } from '../server/ia.mjs';
import { crearPushDePrueba } from '../server/push.mjs';
import { codigoVinculo, tokenApi } from '../server/codigo.mjs';

const H = 3600 * 1000;
const T0 = Date.parse('2026-09-16T15:00:00-03:00');

function escenario() {
  const reloj = { t: T0 };
  const db = abrirBase();
  const push = crearPushDePrueba();
  const api = crearApi({
    db, push, ia: crearIA({ clave: '' }),
    reloj: () => reloj.t,
    azar: (n) => 0,
  });
  const llamar = (metodo, ruta, { cuerpo = null, token = null, query = {}, ip = '1.2.3.4' } = {}) =>
    api.manejar({
      metodo, ruta, cuerpo, query, ip,
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
  return { reloj, db, push, api, llamar };
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

let nCuentas = 0;
async function cuenta(esc, { email = `persona${++nCuentas}@ejemplo.com`, clave = 'una clave segura' } = {}) {
  const [c, r] = await esc.llamar('POST', '/api/cuenta/registro', {
    cuerpo: { email, clave, nombre: 'Persona', tz: 'America/Argentina/Buenos_Aires' },
  });
  assert.equal(c, 201, JSON.stringify(r));
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
    assert.equal(esc.db.contarLecturas(maceta.id), 1);
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
    const api = crearApi({ db: abrirBase(), ia: crearIA({ clave: '' }), tofu: false });
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

  test('desvincular conserva las lecturas guardadas', async () => {
    const { maceta, token, planta } = await vinculada();
    maceta.medir({ suelo: 33, animo: 'HAPPY', sev: 'OK' });
    maceta.pasar(60);
    await maceta.sync();
    const antes = esc.db.contarLecturas(maceta.id);
    await esc.llamar('DELETE', `/api/plantas/${planta.id}`, { token });
    assert.equal(esc.db.contarLecturas(maceta.id), antes, 'la historia no se borra');
    const [c] = await esc.llamar('GET', `/api/plantas/${planta.id}`, { token });
    assert.equal(c, 404, 'pero la planta ya no aparece');
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

describe('cuentas', () => {
  let esc;
  beforeEach(() => { esc = escenario(); });
  const registro = (cuerpo, ip) => esc.llamar('POST', '/api/cuenta/registro', { cuerpo, ip });
  const entrar = (email, clave, ip) => esc.llamar('POST', '/api/cuenta/entrar', { cuerpo: { email, clave }, ip });

  test('registrarse valida el email y la contraseña', async () => {
    assert.equal((await registro({ email: 'no-es-un-email', clave: 'una clave segura' }))[0], 400);
    const [c, r] = await registro({ email: 'ana@ejemplo.com', clave: 'corta' });
    assert.equal(c, 400);
    assert.match(r.error, /8 caracteres/);
    const [ok, cuentaNueva] = await registro({ email: '  Ana@Ejemplo.com ', clave: 'una clave segura', nombre: 'Ana' });
    assert.equal(ok, 201);
    assert.ok(cuentaNueva.token);
    assert.equal(cuentaNueva.cuenta.email, 'ana@ejemplo.com');
    assert.equal(cuentaNueva.cuenta.nombre, 'Ana');
    assert.equal(cuentaNueva.cuenta.clave_hash, undefined, 'la contraseña nunca sale');
    const [dup] = await registro({ email: 'ANA@ejemplo.com', clave: 'otra clave segura' });
    assert.equal(dup, 409, 'un email, una cuenta, sin importar mayúsculas');
  });

  test('la contraseña se guarda con scrypt, nunca en claro', async () => {
    await registro({ email: 'beto@ejemplo.com', clave: 'mi clave secreta' });
    const c = esc.db.cuentaPorEmail('beto@ejemplo.com');
    assert.match(c.clave_hash, /^scrypt\$16384\$8\$1\$/);
    assert.ok(!c.clave_hash.includes('mi clave secreta'));
  });

  test('entrar abre una sesión nueva; datos malos no dicen cuál falló', async () => {
    await registro({ email: 'caro@ejemplo.com', clave: 'una clave segura' });
    const [c, r] = await entrar('CARO@ejemplo.com', 'una clave segura');
    assert.equal(c, 200);
    const [cm, mal] = await entrar('caro@ejemplo.com', 'otra cosa');
    const [ci, inexistente] = await entrar('nadie@ejemplo.com', 'una clave segura');
    assert.equal(cm, 401);
    assert.equal(ci, 401);
    assert.equal(mal.error, inexistente.error);
    const [, yo] = await esc.llamar('GET', '/api/cuenta', { token: r.token });
    assert.equal(yo.email, 'caro@ejemplo.com');
  });

  test('adivinar contraseñas tiene límite', async () => {
    await registro({ email: 'dani@ejemplo.com', clave: 'una clave segura' });
    let ultimo;
    for (let i = 0; i < 12; i++) [ultimo] = await entrar('dani@ejemplo.com', `intento ${i}`, `10.0.0.${i}`);
    assert.equal(ultimo, 429);
  });

  test('salir cierra sólo esa sesión', async () => {
    const [, uno] = await registro({ email: 'eli@ejemplo.com', clave: 'una clave segura' });
    const [, dos] = await entrar('eli@ejemplo.com', 'una clave segura');
    assert.equal((await esc.llamar('POST', '/api/cuenta/salir', { token: uno.token }))[0], 204);
    assert.equal((await esc.llamar('GET', '/api/estado', { token: uno.token }))[0], 401);
    assert.equal((await esc.llamar('GET', '/api/estado', { token: dos.token }))[0], 200);
  });

  test('una sesión sin uso por seis meses vence', async () => {
    const token = await cuenta(esc);
    esc.reloj.t += SESION_VENCE_MS + 1000;
    assert.equal((await esc.llamar('GET', '/api/estado', { token }))[0], 401);
  });

  test('cambiar la contraseña cierra las otras sesiones', async () => {
    const [, uno] = await registro({ email: 'fede@ejemplo.com', clave: 'una clave segura' });
    const [, dos] = await entrar('fede@ejemplo.com', 'una clave segura');
    const [cm] = await esc.llamar('POST', '/api/cuenta/clave', { token: uno.token, cuerpo: { actual: 'no es', nueva: 'la clave nueva' } });
    assert.equal(cm, 401);
    const [c] = await esc.llamar('POST', '/api/cuenta/clave', { token: uno.token, cuerpo: { actual: 'una clave segura', nueva: 'la clave nueva' } });
    assert.equal(c, 200);
    assert.equal((await esc.llamar('GET', '/api/estado', { token: uno.token }))[0], 200, 'la sesión actual sigue');
    assert.equal((await esc.llamar('GET', '/api/estado', { token: dos.token }))[0], 401, 'las otras no');
    assert.equal((await entrar('fede@ejemplo.com', 'una clave segura'))[0], 401);
    assert.equal((await entrar('fede@ejemplo.com', 'la clave nueva'))[0], 200);
  });

  test('cada cuenta ve sólo sus plantas', async () => {
    const maceta = aparato(esc);
    const ana = await cuenta(esc);
    const beto = await cuenta(esc);
    await maceta.sync();
    const [, planta] = await esc.llamar('POST', '/api/vinculo', { token: ana, cuerpo: { codigo: maceta.codigo } });
    maceta.medir({ suelo: 40, animo: 'HAPPY', sev: 'OK' });
    maceta.pasar(60);
    await maceta.sync();

    const [, suyo] = await esc.llamar('GET', '/api/estado', { token: beto });
    assert.equal(suyo.nodes.length, 0);
    for (const [metodo, ruta] of [
      ['GET', `/api/plantas/${planta.id}`],
      ['PATCH', `/api/plantas/${planta.id}`],
      ['DELETE', `/api/plantas/${planta.id}`],
      ['POST', `/api/plantas/${planta.id}/cofre`],
      ['GET', `/api/plantas/${planta.id}/historial`],
    ]) {
      const [c] = await esc.llamar(metodo, ruta, { token: beto, cuerpo: { nombre: 'robada' } });
      assert.equal(c, 404, `${metodo} ${ruta}`);
    }
    const [cd] = await esc.llamar('POST', '/api/diagnosticar', { token: beto, cuerpo: { planta: planta.id, image_b64: 'x'.repeat(500) } });
    assert.equal(cd, 404);
    const [, v] = await esc.llamar('GET', `/api/vinculo/${maceta.codigo}`, { token: beto });
    assert.equal(v.mio, false);
    assert.equal(v.planta, null, 'no se filtra el id de una planta ajena');
    const [, mia] = await esc.llamar('GET', '/api/estado', { token: ana });
    assert.equal(mia.nodes.length, 1);
  });

  test('desde otro teléfono, con email y contraseña, están las mismas plantas', async () => {
    const maceta = aparato(esc);
    const token = await cuenta(esc, { email: 'gabi@ejemplo.com', clave: 'una clave segura' });
    await maceta.sync();
    const [, planta] = await esc.llamar('POST', '/api/vinculo', { token, cuerpo: { codigo: maceta.codigo } });
    const [, otroTelefono] = await entrar('gabi@ejemplo.com', 'una clave segura');
    const [, estado] = await esc.llamar('GET', '/api/estado', { token: otroTelefono.token });
    assert.equal(estado.nodes[0].id, planta.id);
  });

  test('borrar la cuenta pide la contraseña y se lleva todo', async () => {
    const maceta = aparato(esc);
    const token = await cuenta(esc, { email: 'hugo@ejemplo.com', clave: 'una clave segura' });
    await maceta.sync();
    await esc.llamar('POST', '/api/vinculo', { token, cuerpo: { codigo: maceta.codigo } });
    await maceta.sync();
    maceta.medir({ suelo: 40, animo: 'HAPPY', sev: 'OK' });
    maceta.pasar(60);
    await maceta.sync();
    assert.equal((await esc.llamar('DELETE', '/api/cuenta', { token, cuerpo: { clave: 'otra' } }))[0], 401);
    assert.equal((await esc.llamar('DELETE', '/api/cuenta', { token, cuerpo: { clave: 'una clave segura' } }))[0], 204);
    assert.equal((await entrar('hugo@ejemplo.com', 'una clave segura'))[0], 401);
    assert.equal(esc.db.contarLecturas(maceta.id), 0, 'sus lecturas se borran con la cuenta');
    const [, r] = await maceta.sync();
    assert.equal(r.vinculado, false, 'la maceta vuelve a quedar libre');
  });
});
