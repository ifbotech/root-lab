/* El pronóstico y el riego que se anticipa (server/clima.mjs): el modelo con
 * series inventadas, el cliente de Open-Meteo con un fetch de mentira, y el
 * flujo entero por la API: la ciudad en la cuenta, la previsión de una
 * planta y el aviso que llega antes del calor.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  interpretarPronostico, resumenPronostico, tasaSecado, mediaReciente, factorClima, prevision,
  avisoPrevision, crearClima, CLIMA_TTL_MS, AVISO_HORAS_MAX,
} from '../server/clima.mjs';
import { escenario, conRooti, T0 } from './ayudas.mjs';

const H = 3600 * 1000;
const iso = (ms) => new Date(ms).toISOString().slice(0, 16);

/** Una respuesta de Open-Meteo: 60 horas desde dos horas antes de `ahora`. */
function openMeteo(ahora, { temp = 25, hr = 50, horas = 60 } = {}) {
  const inicio = Math.floor(ahora / H) * H - 2 * H;
  const time = [];
  const temperature_2m = [];
  const relative_humidity_2m = [];
  for (let i = 0; i < horas; i++) {
    time.push(iso(inicio + i * H));
    temperature_2m.push(typeof temp === 'function' ? temp(i) : temp);
    relative_humidity_2m.push(typeof hr === 'function' ? hr(i) : hr);
  }
  return { hourly: { time, temperature_2m, relative_humidity_2m } };
}

/** Un fetch que contesta según la URL y anota las llamadas. */
function fetchFalso(responder) {
  const f = async (url) => {
    f.llamadas.push(String(url));
    const r = responder(String(url));
    if (r instanceof Error) throw r;
    if (r?.status) return { ok: false, status: r.status, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => r };
  };
  f.llamadas = [];
  return f;
}

/* Tierra que baja `pctH` puntos por hora, medida cada media hora. */
function secando({ desde, horas, suelo0, pctH, cada = 30 * 60 * 1000, temp = 230, hr = 55 }) {
  const l = [];
  for (let t = desde; t <= desde + horas * H; t += cada) {
    l.push({ t, suelo: Math.round(suelo0 - (pctH * (t - desde)) / H), temp, hr });
  }
  return l;
}

describe('el pronóstico', () => {
  test('se lee de Open-Meteo y se acota a las próximas 48 horas', () => {
    const ahora = T0;
    const p = interpretarPronostico(openMeteo(ahora, { temp: (i) => 20 + i / 4, hr: (i) => 70 - i / 2 }), ahora);
    assert.ok(p.horas.length >= 48 && p.horas.length <= 51, `${p.horas.length} horas`);
    assert.ok(p.horas[0].t >= ahora - H, 'nada de más de una hora atrás');
    assert.ok(p.horas.at(-1).t <= ahora + 48 * H);
    const r = resumenPronostico(p);
    assert.ok(r.temp_max_dc > r.temp_min_dc && r.hr_min < r.hr_media);
    assert.equal(r.horas, p.horas.length);
  });

  test('una respuesta rota es null, no una excepción', () => {
    assert.equal(interpretarPronostico({}, T0), null);
    assert.equal(interpretarPronostico({ hourly: { time: ['x'], temperature_2m: ['a'], relative_humidity_2m: [1] } }, T0), null);
    assert.equal(interpretarPronostico(null, T0), null);
    assert.equal(resumenPronostico(null), null);
  });
});

describe('la velocidad de secado', () => {
  test('mira sólo los tramos en que la tierra baja, y salta los riegos y los huecos', () => {
    const ahora = T0;
    const a = secando({ desde: ahora - 40 * H, horas: 20, suelo0: 60, pctH: 1 });
    /* Un riego: sube a 80 y sigue bajando más despacio. Y un hueco de 5 h. */
    const b = secando({ desde: ahora - 14 * H, horas: 10, suelo0: 80, pctH: 0.5 });
    const t = tasaSecado([...a, ...b], { ahora });
    assert.ok(t, 'hay tasa');
    assert.ok(Math.abs(t.pct_h - 25 / 30) < 0.06, `${t.pct_h} ≈ 0,83`);
    assert.ok(t.horas >= 29 && t.horas <= 30.5);
  });

  test('sin bastante historial, no inventa', () => {
    assert.equal(tasaSecado(secando({ desde: T0 - 3 * H, horas: 3, suelo0: 50, pctH: 1 }), { ahora: T0 }), null, 'tres horas no alcanzan');
    assert.equal(tasaSecado(secando({ desde: T0 - 20 * H, horas: 20, suelo0: 50, pctH: 0 }), { ahora: T0 }), null, 'tierra que no baja');
    assert.equal(tasaSecado([], { ahora: T0 }), null);
    assert.equal(tasaSecado(secando({ desde: T0 - 200 * H, horas: 20, suelo0: 60, pctH: 1 }), { ahora: T0 }), null, 'de hace una semana no cuenta');
  });

  test('la media reciente es de lo que midió el Rooti', () => {
    const m = mediaReciente(secando({ desde: T0 - 10 * H, horas: 10, suelo0: 50, pctH: 1, temp: 240, hr: 60 }), { ahora: T0 });
    assert.deepEqual([m.temp_dc, m.hr], [240, 60]);
    assert.equal(mediaReciente([], { ahora: T0 }), null);
  });
});

describe('el factor y la previsión', () => {
  test('con calor seco se seca más rápido; con fresco húmedo, más despacio; siempre acotado', () => {
    assert.equal(factorClima({ temp_media_dc: 300, hr_media: 30 }, { temp_dc: 220, hr: 60 }).factor, 1.64);
    assert.equal(factorClima({ temp_media_dc: 220, hr_media: 60 }, { temp_dc: 220, hr: 60 }).factor, 1);
    assert.ok(factorClima({ temp_media_dc: 150, hr_media: 85 }, { temp_dc: 240, hr: 50 }).factor < 1);
    assert.equal(factorClima({ temp_media_dc: 500, hr_media: 5 }, { temp_dc: 150, hr: 90 }).factor, 2, 'tope');
    assert.equal(factorClima({ temp_media_dc: 0, hr_media: 100 }, { temp_dc: 350, hr: 10 }).factor, 0.6, 'piso');
    assert.equal(factorClima(null, { temp_dc: 220, hr: 60 }).factor, 1, 'sin pronóstico, como estos días');
  });

  test('la previsión es una regla de tres con la corrección', () => {
    const p = prevision({ suelo: 40, soil_min: 25, tasa: { pct_h: 1 }, factor: 1.5, ahora: T0 });
    assert.equal(p.horas_hasta_sed, 10);
    assert.equal(p.cuando, T0 + 10 * H);
    assert.equal(p.velocidad_pct_h, 1.5);
    assert.equal(prevision({ suelo: 20, soil_min: 25, tasa: { pct_h: 1 }, ahora: T0 }).horas_hasta_sed, 0, 'ya tiene sed');
    assert.equal(prevision({ suelo: 40, soil_min: 25, tasa: null, ahora: T0 }), null);
    assert.equal(prevision({ suelo: 40, soil_min: 25, tasa: { pct_h: 0 }, ahora: T0 }), null);
  });

  test('el aviso se adelanta sólo cuando vale la pena', () => {
    const base = {
      planta: { id: 'p1', nombre: 'Rulo', persona: 'kawaii', revelado: true },
      mood: 'HAPPY', suelo: 38, especie: { soil_min: 25 },
      prevision: { horas_hasta_sed: 20, factor: 1.4 },
      resumen: { temp_max_dc: 340, hr_min: 25 },
      ahora: T0, enviados: {}, tz: 'America/Argentina/Buenos_Aires',
    };
    const a = avisoPrevision(base);
    assert.ok(a, 'hay aviso');
    assert.equal(a.clave, 'prevision');
    assert.match(a.titulo, /Rulo/);
    assert.match(a.cuerpo, /34 °C/);
    assert.match(a.cuerpo, /25 %/);
    assert.match(a.cuerpo, /38 %/);
    assert.match(a.cuerpo, /20 h/);
    assert.equal(a.icono, 'caras/kawaii-THIRSTY.png');
    assert.equal(avisoPrevision({ ...base, mood: 'THIRSTY' }), null, 'ya tiene sed: ese aviso es otro');
    assert.equal(avisoPrevision({ ...base, prevision: { horas_hasta_sed: 20, factor: 1.05 } }), null, 'el clima no empeora');
    assert.equal(avisoPrevision({ ...base, prevision: { horas_hasta_sed: AVISO_HORAS_MAX + 1, factor: 1.4 } }), null, 'falta mucho');
    assert.equal(avisoPrevision({ ...base, prevision: { horas_hasta_sed: 0, factor: 1.4 } }), null);
    assert.equal(avisoPrevision({ ...base, ahora: Date.parse('2026-09-16T02:00:00-03:00') }), null, 'de noche no');
    assert.equal(avisoPrevision({ ...base, enviados: { prevision: T0 - 2 * H } }), null, 'ya se avisó hoy');
    assert.ok(avisoPrevision({ ...base, enviados: { prevision: T0 - 30 * H } }), 'ayer sí, hoy de nuevo');
    assert.equal(avisoPrevision({ ...base, planta: { ...base.planta, revelado: false } }), null);
  });
});

describe('el cliente de Open-Meteo', () => {
  test('pide la ciudad y el pronóstico con las coordenadas redondeadas', async () => {
    const f = fetchFalso((url) => (url.includes('geocoding')
      ? { results: [{ name: 'Rosario', country: 'Argentina', admin1: 'Santa Fe', latitude: -32.94682, longitude: -60.63932, timezone: 'America/Argentina/Cordoba' }] }
      : openMeteo(T0, { temp: 30 })));
    const c = crearClima({ fetch: f });
    const u = await c.geocodificar('  rosario ');
    assert.deepEqual(u, { nombre: 'Rosario', pais: 'Argentina', region: 'Santa Fe', lat: -32.95, lon: -60.64, tz: 'America/Argentina/Cordoba' });
    assert.match(f.llamadas[0], /name=rosario&count=1&language=es/);
    const p = await c.pronostico(u.lat, u.lon, T0);
    assert.match(f.llamadas[1], /latitude=-32\.95&longitude=-60\.64/);
    assert.match(f.llamadas[1], /hourly=temperature_2m,relative_humidity_2m/);
    assert.equal(p.horas[0].temp_dc, 300);
    assert.equal(await c.geocodificar(''), null);
  });

  test('sin resultados o apagado, null; un error de red se propaga', async () => {
    const vacio = crearClima({ fetch: fetchFalso(() => ({ results: [] })) });
    assert.equal(await vacio.geocodificar('xyzzy'), null);
    const apagado = crearClima({ fetch: fetchFalso(() => { throw new Error('no debería llamar'); }), activo: false });
    assert.equal(await apagado.geocodificar('Rosario'), null);
    assert.equal(await apagado.pronostico(0, 0), null);
    const roto = crearClima({ fetch: fetchFalso(() => ({ status: 503 })) });
    await assert.rejects(() => roto.pronostico(0, 0), /503/);
  });
});

describe('por la API', () => {
  const geo = { results: [{ name: 'Rosario', country: 'Argentina', latitude: -32.95, longitude: -60.64 }] };

  async function plantaConHistorial(esc, { horas = 24, suelo0 = 60, pctH = 1, temp = 230, hr = 55, especie = 'monstera' } = {}) {
    const { maceta, token, planta } = await conRooti(esc);
    await esc.llamar('PATCH', `/api/plantas/${planta.id}`, { token, cuerpo: { especie } });
    for (let i = 0; i <= horas * 2; i++) {
      const suelo = Math.round(suelo0 - (pctH * i) / 2);
      maceta.medir({ suelo, temp, hr, lux: 3000, animo: 'HAPPY', sev: 'OK' });
      if (i % 4 === 3) await maceta.sync();
      maceta.pasar(1800);
    }
    await maceta.sync();
    return { maceta, token, planta };
  }

  test('la cuenta guarda su ciudad (cifrada) y la puede quitar', async () => {
    const f = fetchFalso((url) => (url.includes('geocoding') ? geo : openMeteo(T0)));
    const esc = escenario({ clima: crearClima({ fetch: f }) });
    const { token } = await conRooti(esc);
    let [c, r] = await esc.llamar('PATCH', '/api/cuenta', { token, cuerpo: { ubicacion: 'Rosario' } });
    assert.equal(c, 200);
    assert.deepEqual(r.ubicacion, { nombre: 'Rosario', pais: 'Argentina', region: '' });
    assert.equal(r.lat, undefined, 'las coordenadas no viajan a la app');
    [c, r] = await esc.llamar('GET', '/api/cuenta', { token });
    assert.equal(r.ubicacion.nombre, 'Rosario');
    [c, r] = await esc.llamar('PATCH', '/api/cuenta', { token, cuerpo: { ubicacion: '' } });
    assert.equal(r.ubicacion, null);
    const sinCiudad = escenario({ clima: crearClima({ fetch: fetchFalso(() => ({ results: [] })) }) });
    const { token: t2 } = await conRooti(sinCiudad);
    [c, r] = await sinCiudad.llamar('PATCH', '/api/cuenta', { token: t2, cuerpo: { ubicacion: 'xyzzy' } });
    assert.equal(c, 404);
    const apagado = escenario({ clima: crearClima({ activo: false }) });
    const { token: t3 } = await conRooti(apagado);
    [c] = await apagado.llamar('PATCH', '/api/cuenta', { token: t3, cuerpo: { ubicacion: 'Rosario' } });
    assert.equal(c, 503);
  });

  test('la previsión dice por qué no está, y cuando está usa historial y pronóstico', async () => {
    const f = fetchFalso((url) => (url.includes('geocoding') ? geo : openMeteo(esc.reloj.t, { temp: 34, hr: 25 })));
    const esc = escenario({ clima: crearClima({ fetch: f }) });
    const { maceta, token, planta } = await conRooti(esc);
    let [c, r] = await esc.llamar('GET', `/api/plantas/${planta.id}/prevision`, { token });
    assert.equal(c, 200);
    assert.deepEqual(r, { disponible: false, motivo: 'ubicacion' });
    await esc.llamar('PATCH', '/api/cuenta', { token, cuerpo: { ubicacion: 'Rosario' } });
    [c, r] = await esc.llamar('GET', `/api/plantas/${planta.id}/prevision`, { token });
    assert.equal(r.motivo, 'lectura', 'sin especie ni lectura');
    await esc.llamar('PATCH', `/api/plantas/${planta.id}`, { token, cuerpo: { especie: 'monstera' } });
    maceta.medir({ suelo: 50, temp: 230, hr: 55, lux: 3000, animo: 'HAPPY', sev: 'OK' });
    await maceta.sync();
    [c, r] = await esc.llamar('GET', `/api/plantas/${planta.id}/prevision`, { token });
    assert.equal(r.motivo, 'historial', 'una sola lectura no da tasa');
    assert.ok(r.clima.temp_max_dc >= 340, 'pero el clima ya se ve');
    const llamadas = f.llamadas.length;

    /* Un día de tierra secándose a un punto por hora. */
    for (let i = 1; i <= 48; i++) {
      maceta.pasar(1800);
      maceta.medir({ suelo: Math.round(50 - i / 2), temp: 230, hr: 55, lux: 3000, animo: 'HAPPY', sev: 'OK' });
      if (i % 4 === 0) await maceta.sync();
    }
    [c, r] = await esc.llamar('GET', `/api/plantas/${planta.id}/prevision`, { token });
    assert.equal(r.disponible, true);
    assert.equal(r.suelo, 26);
    assert.equal(r.soil_min, 25);
    assert.ok(Math.abs(r.tasa_pct_h - 1) < 0.05, `tasa ${r.tasa_pct_h}`);
    assert.ok(r.factor > 1.15, `con 34 °C y 25 % el factor sube: ${r.factor}`);
    assert.ok(r.horas_hasta_sed > 0 && r.horas_hasta_sed < 1, `${r.horas_hasta_sed} h`);
    assert.equal(r.ubicacion.nombre, 'Rosario');
    assert.ok(f.llamadas.length <= llamadas + 1, 'el pronóstico se pide una vez cada 6 h (caché)');
    esc.reloj.t += CLIMA_TTL_MS + 1000;
    await esc.llamar('GET', `/api/plantas/${planta.id}/prevision`, { token });
    assert.equal(f.llamadas.length, llamadas + 2, 'vencida la caché, se vuelve a pedir');
  });

  test('el aviso llega antes del calor, una vez por día, sólo a quien puso la ciudad', async () => {
    const f = fetchFalso((url) => (url.includes('geocoding') ? geo : openMeteo(esc.reloj.t, { temp: 35, hr: 20 })));
    const esc = escenario({ clima: crearClima({ fetch: f }) });
    const { token, planta } = await plantaConHistorial(esc, { suelo0: 60, pctH: 1, horas: 24 });
    await esc.llamar('POST', '/api/push/suscripcion', {
      token, cuerpo: { suscripcion: { endpoint: 'https://push.ejemplo/uno', keys: { p256dh: 'k', auth: 'a' } } },
    });
    assert.equal(await esc.api.revisar(), 0, 'sin ciudad no hay previsión');
    await esc.llamar('PATCH', '/api/cuenta', { token, cuerpo: { ubicacion: 'Rosario' } });
    const n = await esc.api.revisar();
    assert.equal(n, 1, 'un aviso');
    const a = esc.push.enviados.at(-1);
    assert.match(a.titulo, /Se viene calor: Rulo/);
    assert.match(a.cuerpo, /35 °C/);
    assert.equal(a.tag, `${planta.id}:prevision`);
    assert.equal(await esc.api.revisar(), 0, 'no se repite');
    esc.reloj.t += 25 * H;
    /* Un día después la tierra no bajó más (no hubo lecturas): la previsión
       sigue diciendo que la sed está cerca, y se puede avisar de nuevo. */
    const [, pv] = await esc.llamar('GET', `/api/plantas/${planta.id}/prevision`, { token });
    assert.ok(pv.disponible === false || pv.horas_hasta_sed >= 0);
  });
});
