/* animacion.mjs — cómo se mueve un Rooti.
 *
 * FUNCIONES PURAS
 *
 * Nada de acá toca el DOM ni guarda estado: `pose(figura, estado, t)` devuelve
 * dónde va cada grupo en el milisegundo t, y con el mismo t devuelve siempre
 * lo mismo. Por eso se puede probar en Node (test/rooti3d.test.mjs), rebobinar
 * para una captura y, sobre todo, pausar: si el teléfono está en otra pestaña
 * el motor deja de pedir poses y al volver retoma donde el reloj diga, sin
 * saltos raros y sin integrar nada.
 *
 * TRES CAPAS QUE SE SUMAN
 *
 *   1. el reposo    respira siempre, incluso dormido o sin conexión;
 *   2. el ánimo     lo que dice el sensor: sed, frío, calor, ahogo, oscuridad;
 *   3. la escena    la noche, el mimo, el despertar, el saludo.
 *
 * Se suman en vez de elegir una: un Rooti con sed al que le hacen un mimo
 * sigue teniendo la copa caída, pero ronronea. Elegir una sola capa daba
 * personajes que se "olvidaban" de que tenían sed apenas los tocabas.
 *
 * LOS GRUPOS
 *
 * Cada pieza pertenece a un grupo (formas.mjs) y cada grupo gira alrededor de
 * su pivote, que es donde nace del cuerpo:
 *
 *   cuerpo      el bicho entero, pivote en el piso (los pies no se despegan
 *               salvo que salte);
 *   copa        lo que lleva arriba: hojas, flor, esporas, sombrero. Es lo
 *               que más habla: se cae con la sed, se levanta con el mimo, y
 *               llega siempre un pelín tarde (el retardo es lo que hace que
 *               parezca que pesa);
 *   brazo-izq / brazo-der   los que tengan.
 *
 * ARRIBA-ABAJO, NO ADELANTE-ATRÁS
 *
 * Todo el movimiento es de estirar y aplastar (el squash & stretch de toda la
 * vida) y de inclinar. No hay ninguna deformación que hunda la zona de la
 * cara, porque ahí, en la figura impresa, hay un vidrio: si la app mostrara
 * la cara doblándose estaría mintiendo sobre lo que el juguete puede hacer.
 */

/* ------------------------------------------------------------- utilería --- */
const TAU = Math.PI * 2;

/** Una onda de -1 a 1 con período en milisegundos. */
export const onda = (t, periodo, fase = 0) => Math.sin(TAU * (t / periodo + fase));

/** De 0 a 1 y vuelta, suave: sirve para latidos y pulsos. */
export const pulso = (t, periodo, fase = 0) => (1 - Math.cos(TAU * (t / periodo + fase))) / 2;

export const limitar = (v, a, b) => (v < a ? a : v > b ? b : v);
export const mezcla = (a, b, k) => a + (b - a) * k;

/** Suavizado clásico: entra y sale sin tirones. */
export const suave = (k) => { const x = limitar(k, 0, 1); return x * x * (3 - 2 * x); };

/** Rebote que se apaga: 1 al final, con dos o tres sacudidas antes. */
export function rebote(k, vueltas = 2.4, amortiguacion = 5) {
  const x = limitar(k, 0, 1);
  return 1 - Math.cos(x * TAU * vueltas) * Math.exp(-amortiguacion * x) * (1 - x);
}

/* Un movimiento vacío: nada se mueve. */
const quieto = () => ({ en: [0, 0, 0], giro: [0, 0, 0], esc: [1, 1, 1] });

function sumar(a, b) {
  for (let i = 0; i < 3; i++) {
    a.en[i] += b.en[i];
    a.giro[i] += b.giro[i];
    a.esc[i] *= b.esc[i];
  }
  return a;
}

/* Lo que aplasta también ensancha: el volumen se mantiene, que es la mitad de
   por qué un rebote se lee como rebote y no como una escala. */
const achatar = (k) => [1 / Math.sqrt(k), k, 1 / Math.sqrt(k)];

/* --------------------------------------------------------------- ánimos --- */
/*
 * Cada ánimo devuelve { cuerpo, copa, brazos, mirada }, y todos los campos son
 * opcionales. Los valores son milímetros y grados: la figura mide unos 150 mm,
 * así que 3 mm ya se ve y 10 mm es un salto.
 */
const ANIMOS = {
  /* Contento: saltitos con anticipación, vuelo y aterrizaje. Es la única
     animación en la que los pies se despegan del piso. */
  HAPPY(t) {
    const ciclo = 2400;
    const k = (t % ciclo) / ciclo;
    let alto = 0; let ap = 1;
    if (k < 0.12) ap = mezcla(1, 0.88, suave(k / 0.12));            /* se agacha */
    else if (k < 0.2) { ap = mezcla(0.88, 1.1, suave((k - 0.12) / 0.08)); alto = 3 * suave((k - 0.12) / 0.08); }
    else if (k < 0.52) {                                            /* vuela */
      const v = (k - 0.2) / 0.32;
      alto = 14 * Math.sin(Math.PI * v) + 3 * (1 - v);
      ap = mezcla(1.1, 0.96, Math.sin(Math.PI * v));
    } else if (k < 0.62) ap = mezcla(0.9, 1, suave((k - 0.52) / 0.1)); /* cae y aplasta */
    return {
      cuerpo: { en: [0, alto, 0], giro: [0, 4 * onda(t, ciclo * 2), 0], esc: achatar(ap) },
      copa: { giro: [-7 * (ap - 1) * 10, 0, 3 * onda(t, ciclo, -0.08)] },
      brazos: 14 + 10 * onda(t, ciclo, 0.1),
    };
  },

  /* Sed: todo cae hacia adelante y el balanceo se hace lento y corto. */
  THIRSTY(t) {
    return {
      cuerpo: { giro: [3, 0, 2.5 * onda(t, 5200)], esc: achatar(0.975) },
      copa: { giro: [17, 0, 6 * onda(t, 5200, -0.12)] },
      brazos: -12,
    };
  },

  /* Frío: tiembla. Amplitud chica y frecuencia alta, que es justo lo que no
     hay que hacer en ninguna otra animación. */
  COLD(t) {
    const tmb = onda(t, 95);
    return {
      cuerpo: { en: [0.5 * tmb, 0, 0.3 * onda(t, 78, 0.25)], giro: [0, 0, 0.8 * tmb], esc: achatar(0.985) },
      copa: { giro: [4, 0, 2.2 * onda(t, 88, 0.3)] },
      brazos: -18,
    };
  },

  /* Calor: se derrite. Se achata, se ensancha y se bambolea despacio. */
  HOT(t) {
    return {
      cuerpo: { giro: [0, 0, 3.2 * onda(t, 3400)], esc: achatar(mezcla(0.94, 0.97, pulso(t, 3400))) },
      copa: { giro: [11, 0, 7 * onda(t, 3400, -0.15)] },
      brazos: -8,
    };
  },

  /* Ahogo: flota. Sube, baja y se ladea, como si el agua lo llevara. */
  DROWNING(t) {
    return {
      cuerpo: { en: [1.5 * onda(t, 4100), 2.5 + 2.5 * onda(t, 2800), 0], giro: [0, 0, 5 * onda(t, 3400)], esc: achatar(1.01) },
      copa: { giro: [2, 0, 8 * onda(t, 3400, -0.18)] },
      brazos: 20,
    };
  },

  /* Aire seco: se encoge y se enrosca un poquito sobre sí mismo. */
  PARCHED_AIR(t) {
    return {
      cuerpo: { giro: [1, 3 * onda(t, 6000), 0], esc: achatar(0.965) },
      copa: { giro: [9, 10 * onda(t, 6000, -0.1), 3] },
      brazos: -10,
    };
  },

  /* Oscuridad: mira alrededor. El cuerpo gira despacio y la cara acompaña. */
  DARK(t) {
    const yaw = onda(t, 5200);
    return {
      cuerpo: { giro: [0, 16 * yaw, 0], esc: achatar(0.99) },
      copa: { giro: [3, 8 * onda(t, 5200, -0.1), 0] },
      brazos: -14,
      mirada: [limitar(yaw * 1.2, -1, 1), -0.1],
    };
  },

  /* Quemado: se quedó sin fuerzas. Casi nada se mueve, y eso es el punto. */
  SCORCHED(t) {
    return {
      cuerpo: { giro: [5, 0, 1.2 * onda(t, 7000)], esc: achatar(0.95) },
      copa: { giro: [26, 0, 3 * onda(t, 7000, -0.15)] },
      brazos: -22,
    };
  },

  SLEEPING(t) {
    return {
      cuerpo: { en: [0, -3, 0], esc: achatar(0.955) },
      copa: { giro: [14, 0, 2 * onda(t, 6200, -0.1)] },
      brazos: -20,
    };
  },

  /* Sin conexión y sin saber: quieto, apenas respirando, la copa de lado.
     Que se note que no es que esté triste: es que no hay noticias. */
  OFFLINE() { return { cuerpo: { esc: achatar(0.985) }, copa: { giro: [6, 0, -4] }, brazos: -12 }; },
  UNKNOWN() { return { cuerpo: { esc: achatar(0.99) }, copa: { giro: [4, 0, 5] }, brazos: -8 }; },
};

export const ANIMOS_CON_POSE = Object.keys(ANIMOS);

/* --------------------------------------------------------------- escena --- */

/** La respiración de base, que está siempre. */
function respirar(t, lento) {
  const per = lento ? 5600 : 3400;
  const amp = lento ? 0.022 : 0.013;
  const r = onda(t, per);
  return {
    cuerpo: { en: [0, 0, 0], giro: [0, 0, 0], esc: achatar(1 - amp * r) },
    /* La copa llega tarde: ése retardo es todo el peso que aparenta tener. */
    copa: { en: [0, 0, 0], giro: [1.6 * onda(t, per, -0.11), 0, 1.1 * onda(t, per * 1.7, -0.08)], esc: [1, 1, 1] },
  };
}

/**
 * La pose completa en el milisegundo `t`.
 *
 * estado: { animo, noche, dormido, despertar, mimo, saludo, desde }
 *   desde   el milisegundo en que empezó el despertar o el saludo, para que
 *           esas dos animaciones (que tienen principio y fin) sepan por dónde
 *           van. Si falta, se toma 0.
 */
export function pose(figura, estado = {}, t = 0) {
  const {
    animo = 'HAPPY', noche = false, dormido = false, despertar = false, mimo = 0, saludo = false, desde = 0,
  } = estado;

  const durmiendo = dormido || (noche && ['HAPPY', 'SLEEPING', 'OFFLINE', 'UNKNOWN'].includes(animo));
  const receta = ANIMOS[durmiendo ? 'SLEEPING' : animo] || ANIMOS.UNKNOWN;
  const capa = receta(t);

  /* Un movimiento puede traer sólo lo que le importa; lo que falta, quieto. */
  const completo = (m) => ({ ...quieto(), ...(m || {}) });

  const base = respirar(t, durmiendo);
  const cuerpo = sumar(quieto(), base.cuerpo);
  const copa = sumar(quieto(), base.copa);
  sumar(cuerpo, completo(capa.cuerpo));
  sumar(copa, completo(capa.copa));

  let mirada = capa.mirada ? capa.mirada.slice() : [0, 0];
  let brazos = capa.brazos ?? 0;

  /* La noche: se sienta. Más ancho, más bajo, la copa vencida. */
  if (durmiendo) {
    sumar(cuerpo, completo({ en: [0, -4, 0], esc: [1.03, 0.95, 1.03] }));
    sumar(copa, completo({ giro: [8, 0, 0] }));
    brazos -= 8;
  }

  /* El mimo: ronronea. Vibración corta y rápida, y la copa que se levanta:
     es la diferencia entre "me tocan" y "me gusta que me toquen". */
  if (mimo > 0) {
    const m = limitar(mimo, 0, 1);
    sumar(cuerpo, completo({ en: [0.4 * m * onda(t, 110), 0.8 * m * pulso(t, 900), 0], esc: achatar(1 + 0.02 * m) }));
    sumar(copa, completo({ giro: [-9 * m, 0, 4 * m * onda(t, 900, -0.1)] }));
    brazos += 22 * m;
    mirada = [mirada[0], limitar(mirada[1] + 0.25 * m, -1, 1)];
  }

  /* El despertar: un estirón con rebote, un segundo y medio, y se acabó. */
  if (despertar) {
    const k = limitar((t - desde) / 1500, 0, 1);
    const e = rebote(k, 2.2, 5.5);
    sumar(cuerpo, completo({ en: [0, 3 * (1 - k) * Math.sin(Math.PI * k), 0], esc: achatar(mezcla(0.9, 1, e)) }));
    sumar(copa, completo({ giro: [-16 * (1 - e), 0, 0] }));
    brazos += 30 * Math.sin(Math.PI * k);
  }

  /* El saludo: el brazo derecho arriba, dos segundos. */
  let brazoDer = brazos;
  if (saludo) {
    const k = limitar((t - desde) / 2000, 0, 1);
    const alto = Math.sin(Math.PI * limitar(k * 1.15, 0, 1)) ** 0.6;
    brazoDer = brazos + alto * (62 + 16 * onda(t, 340));
    mirada = [limitar(mirada[0] + 0.3 * alto, -1, 1), mirada[1]];
  }

  const grupos = {};
  for (const nombre of Object.keys(figura.grupos || {})) {
    if (nombre === 'cuerpo') continue;
    if (nombre === 'copa') { grupos.copa = copa; continue; }
    if (nombre === 'brazo-izq') { grupos[nombre] = { en: [0, 0, 0], giro: [0, 0, -brazos], esc: [1, 1, 1] }; continue; }
    if (nombre === 'brazo-der') { grupos[nombre] = { en: [0, 0, 0], giro: [0, 0, brazoDer], esc: [1, 1, 1] }; continue; }
    grupos[nombre] = quieto();
  }

  /* La sombra delata la altura: cuando salta, se achica y se aclara. */
  const alto = cuerpo.en[1];
  return {
    cuerpo,
    grupos,
    mirada,
    sombra: { esc: limitar(1 - alto / 90, 0.55, 1.12), alfa: limitar(0.22 - alto / 420, 0.07, 0.24) },
  };
}

/* ------------------------------------------------------------- efectos --- */
/*
 * Las cositas que flotan alrededor: los copos del frío, el vaho del calor, el
 * polvillo del aire seco, las burbujas del ahogo, los Zzz de la noche, los
 * corazones del mimo y los destellos de la rareza. Son las mismas que dibuja
 * el firmware en la cara (art/face.c): en la maceta pasan por delante de los
 * ojos y acá rodean al personaje entero, pero son el mismo idioma.
 *
 * Devuelve posiciones en milímetros, en el mismo mundo que la figura.
 */
export function efectos(figura, estado = {}, t = 0) {
  const { animo = 'HAPPY', noche = false, dormido = false, mimo = 0, rareza = 'comun' } = estado;
  const durmiendo = dormido || (noche && ['HAPPY', 'SLEEPING', 'OFFLINE', 'UNKNOWN'].includes(animo));
  const l = figura.limites;
  const alto = l.hi[1];
  const radio = Math.max(l.hi[0], -l.lo[0]);
  const salida = [];

  const sembrar = (n, tipo, hacer) => {
    for (let i = 0; i < n; i++) salida.push({ tipo, ...hacer(i, (i * 0.618) % 1) });
  };

  if (!durmiendo && animo === 'COLD') {
    sembrar(7, 'copo', (i, s) => {
      const k = ((t / 4200 + s) % 1);
      return { en: [mezcla(-radio, radio, s) + 6 * onda(t, 1900, s), alto * (1.05 - k), radio * 0.5 * onda(t, 3100, s) ], esc: 0.8 + s * 0.5, alfa: Math.sin(Math.PI * k) };
    });
  }
  if (!durmiendo && animo === 'HOT') {
    sembrar(5, 'vaho', (i, s) => {
      const k = ((t / 2600 + s) % 1);
      return { en: [mezcla(-radio * 0.7, radio * 0.7, s) + 5 * onda(t, 1500, s), alto * (0.85 + k * 0.5), 0], esc: 0.6 + k * 1.2, alfa: Math.sin(Math.PI * k) * 0.6 };
    });
  }
  if (!durmiendo && animo === 'PARCHED_AIR') {
    sembrar(9, 'polvillo', (i, s) => {
      const k = ((t / 5200 + s) % 1);
      const a = TAU * s + t / 2600;
      return { en: [Math.cos(a) * radio * 1.1, alto * (0.2 + 0.7 * k), Math.sin(a) * radio * 1.1], esc: 0.5 + s * 0.4, alfa: Math.sin(Math.PI * k) * 0.7 };
    });
  }
  if (!durmiendo && animo === 'DROWNING') {
    sembrar(8, 'burbuja', (i, s) => {
      const k = ((t / 3000 + s) % 1);
      return { en: [mezcla(-radio, radio, s) * 0.8, alto * (0.1 + k * 0.95), radio * 0.4 * onda(t, 2700, s)], esc: 0.5 + s, alfa: (1 - k) * 0.8 };
    });
  }
  if (durmiendo) {
    sembrar(3, 'zzz', (i) => {
      const k = ((t / 3200 + i * 0.33) % 1);
      return { en: [radio * 0.45 + i * 7 + 4 * onda(t, 2400, i * 0.3), alto * (0.92 + k * 0.4), 0], esc: 0.7 + i * 0.35, alfa: Math.sin(Math.PI * k) };
    });
  }
  if (mimo > 0) {
    sembrar(4, 'corazon', (i, s) => {
      const k = ((t / 1600 + s) % 1);
      return { en: [mezcla(-radio * 0.6, radio * 0.6, s), alto * (0.6 + k * 0.55), radio * 0.3], esc: (0.6 + s * 0.6) * limitar(mimo, 0, 1), alfa: Math.sin(Math.PI * k) * limitar(mimo, 0, 1) };
    });
  }
  if (!durmiendo && (rareza === 'raro' || rareza === 'epico')) {
    const n = rareza === 'epico' ? 8 : 4;
    sembrar(n, 'destello', (i, s) => {
      const a = TAU * (i / n) + t / (rareza === 'epico' ? 4200 : 6400);
      const y = alto * (0.25 + 0.6 * ((s + t / 7000) % 1));
      return { en: [Math.cos(a) * radio * 1.25, y, Math.sin(a) * radio * 1.25], esc: 0.7 + 0.5 * pulso(t, 1800, s), alfa: 0.35 + 0.5 * pulso(t, 1800, s) };
    });
  }
  return salida;
}

/**
 * Dónde poner el polvo sobre el cuerpo: puntos repartidos por la superficie,
 * fijos para cada Rooti y cada llave (para que no salten al redibujar), y
 * siempre sobre la mitad de adelante, que es la que se toca.
 */
export function motasDePolvo(figura, cuantas, llave = '') {
  const l = figura.limites;
  const radio = Math.max(l.hi[0], -l.lo[0]);
  let semilla = 2166136261;
  for (const c of `${figura.id}/${llave}`) semilla = Math.imul(semilla ^ c.charCodeAt(0), 16777619) >>> 0;
  const azar = () => { semilla = (Math.imul(semilla, 1664525) + 1013904223) >>> 0; return semilla / 4294967296; };
  const motas = [];
  for (let i = 0; i < cuantas; i++) {
    /* ±70° desde el frente: más que eso y la mota queda en la espalda,
       donde nadie la ve ni la puede frotar. */
    const a = (azar() - 0.5) * (Math.PI * 0.78);
    const y = mezcla(l.hi[1] * 0.12, l.hi[1] * 0.92, azar());
    const r = radio * mezcla(0.6, 1, azar());
    motas.push({ en: [Math.sin(a) * r, y, Math.cos(a) * r], r: 2 + azar() * 2.4 });
  }
  return motas;
}
