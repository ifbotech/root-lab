/* presupuesto.mjs — cuánto puede gastar la IA, y cuánto puede usar cada uno.
 *
 * TRES CAPAS, DE AFUERA HACIA ADENTRO
 *
 * 1. TOPE DE GASTO GLOBAL. Un máximo en dólares por día y por mes para todo
 *    ROOTLAB (ROOTLAB_IA_TOPE_DIA_USD, ROOTLAB_IA_TOPE_MES_USD). Antes de
 *    cada llamada real se suma lo gastado más lo MÁXIMO que podría costar
 *    esa llamada; si se pasaría, no se llama. A mitad de camino (80 %) y al
 *    llegar, se avisa por email a quien administra (ROOTLAB_ADMIN_EMAIL).
 *    Es la capa que protege la tarjeta aunque todo lo demás falle.
 *
 * 2. SÓLO CON UN ROOTI. Reconocer, diagnosticar y chatear piden una planta
 *    vinculada a un Rooti de la cuenta (lo verifica api.mjs). Crear cuentas
 *    no da acceso a la IA.
 *
 * 3. CUOTA DIARIA POR PLAN. Plan gratis: 3 mensajes de chat por día por
 *    cuenta, 3 reconocimientos y 2 diagnósticos por día por Rooti. El plan
 *    pro (a futuro) sube las cuotas, pero nunca saltea el tope global. El
 *    "día" es el de la zona horaria de la persona: la cuota se renueva a su
 *    medianoche, no a la de Londres.
 *
 * Todo sale de la tabla ia_uso, que guarda cada llamada con sus tokens y su
 * costo: sobrevive a reinicios y se puede auditar (tools/uso-ia.mjs).
 *
 * PRECIOS
 *
 * En dólares por millón de tokens. Como un dólar por millón es un
 * micro-dólar por token, el costo en micro-dólares es tokens × precio, sin
 * redondeos. Un modelo desconocido se cobra como el más caro: ante la duda,
 * el tope se alcanza antes, no después. Los valores por defecto hay que
 * confirmarlos contra https://www.anthropic.com/pricing y se pueden pisar con
 * ROOTLAB_IA_PRECIOS (JSON).
 */
import { diaLocal, inicioDiaUtc, inicioMesUtc, mesUtc } from './tiempo.mjs';

export const PRECIOS_POR_DEFECTO = {
  'claude-opus-5': { entrada: 5, salida: 25 },
  'claude-sonnet-5': { entrada: 3, salida: 15 },
  'claude-haiku-4-5': { entrada: 1, salida: 5 },
};

export const LIMITES_POR_DEFECTO = {
  gratis: { chat: 3, identificar: 3, diagnosticar: 2 },
  pro: { chat: 200, identificar: 20, diagnosticar: 20 },
};

/* Por Rooti o por cuenta. */
const ALCANCE = { chat: 'cuenta', identificar: 'planta', diagnosticar: 'planta' };

const MENSAJES = {
  chat: (l) => `Ya usaste los ${l} mensajes de hoy. Mañana tu planta vuelve a tener ganas de charlar.`,
  identificar: (l) => `Ya reconociste ${l} fotos de este Rooti hoy. Podés elegir la especie de la lista, o probar mañana.`,
  diagnosticar: (l) => `Ya hiciste ${l} diagnósticos de este Rooti hoy. Mañana podés sacarle otra foto.`,
};

export function precioDe(modelo, precios = PRECIOS_POR_DEFECTO) {
  const clave = Object.keys(precios)
    .filter((k) => String(modelo || '').startsWith(k))
    .sort((a, b) => b.length - a.length)[0];
  if (clave) return precios[clave];
  return Object.values(precios).reduce((a, b) => (b.salida > a.salida ? b : a));
}

/** Micro-dólares de una llamada, con el caché de prompts de Anthropic. */
export function costoMicro(modelo, uso = {}, precios = PRECIOS_POR_DEFECTO) {
  const p = precioDe(modelo, precios);
  return Math.round(
    (uso.entrada || 0) * p.entrada
    + (uso.cache_escritura || 0) * p.entrada * 1.25
    + (uso.cache_lectura || 0) * p.entrada * 0.1
    + (uso.salida || 0) * p.salida,
  );
}

class ErrorCuota extends Error {
  constructor(codigo, mensaje, extra = {}) { super(mensaje); this.codigo = codigo; Object.assign(this, extra); }
}

export function crearPresupuesto({
  db,
  reloj = () => Date.now(),
  topeDiaUsd = 2,
  topeMesUsd = 20,
  limites = LIMITES_POR_DEFECTO,
  precios = PRECIOS_POR_DEFECTO,
  alAlerta = null,
} = {}) {
  const topeDia = Math.round(topeDiaUsd * 1e6);
  const topeMes = Math.round(topeMesUsd * 1e6);

  function alertar(t) {
    if (!alAlerta) return;
    const chequeos = [
      ['diario', diaLocal(t, 'UTC'), db.iaGastoDesde(inicioDiaUtc(t)), topeDia],
      ['mensual', mesUtc(t), db.iaGastoDesde(inicioMesUtc(t)), topeMes],
    ];
    for (const [periodo, clave, gastado, tope] of chequeos) {
      if (tope <= 0) continue;
      for (const umbral of [80, 100]) {
        const marca = `alerta-ia:${periodo}:${clave}:${umbral}`;
        if (gastado >= tope * (umbral / 100) && !db.metaLeer(marca)) {
          db.metaEscribir(marca, t);
          alAlerta({ periodo, gastado: gastado / 1e6, tope: tope / 1e6, umbral });
        }
      }
    }
  }

  const api = {
    precios,

    limitesDe(cuenta) { return limites[cuenta?.plan] || limites.gratis; },

    /** { usados, limite, restantes } de una cuenta (y un Rooti) hoy, en su zona. */
    cuota(cuenta, tipo, planta = null) {
      const dia = diaLocal(reloj(), cuenta.tz);
      const limite = api.limitesDe(cuenta)[tipo] ?? 0;
      const usados = ALCANCE[tipo] === 'planta'
        ? db.iaUsosPlanta(planta, tipo, dia)
        : db.iaUsosCuenta(cuenta.id, tipo, dia);
      return { usados, limite, restantes: Math.max(0, limite - usados) };
    },

    verificarCuota(cuenta, tipo, planta = null) {
      const c = api.cuota(cuenta, tipo, planta);
      if (c.restantes <= 0) throw new ErrorCuota(429, MENSAJES[tipo](c.limite), { cuota: c });
      return c;
    },

    estado() {
      const t = reloj();
      return {
        gastado_dia_usd: db.iaGastoDesde(inicioDiaUtc(t)) / 1e6,
        tope_dia_usd: topeDia / 1e6,
        gastado_mes_usd: db.iaGastoDesde(inicioMesUtc(t)) / 1e6,
        tope_mes_usd: topeMes / 1e6,
      };
    },

    /** Antes de una llamada real: ¿alcanza el tope para lo peor que puede costar? */
    verificarTope(modelo, { entrada = 3000, salida = 1024 } = {}) {
      const t = reloj();
      const peor = costoMicro(modelo, { entrada, salida }, precios);
      const dia = db.iaGastoDesde(inicioDiaUtc(t));
      const mes = db.iaGastoDesde(inicioMesUtc(t));
      if ((topeDia > 0 && dia + peor > topeDia) || (topeMes > 0 && mes + peor > topeMes)) {
        alertar(t);
        throw new ErrorCuota(503, 'La IA de ROOTLAB está en pausa por hoy: llegamos al límite de uso. Volvé a probar mañana.');
      }
    },

    /** Después de una llamada (real o simulada): queda anotada y cuenta para la cuota. */
    registrar({ cuenta, planta = null, tipo, fuente, modelo = null, uso = {} }) {
      const t = reloj();
      const costo = fuente === 'claude' ? costoMicro(modelo, uso, precios) : 0;
      db.iaUsoRegistrar({
        t, dia: diaLocal(t, cuenta?.tz), cuenta: cuenta?.id || null, planta, tipo, fuente, modelo,
        tokens_in: (uso.entrada || 0) + (uso.cache_escritura || 0) + (uso.cache_lectura || 0),
        tokens_out: uso.salida || 0,
        costo_micro: costo,
      });
      if (costo > 0) alertar(t);
      return costo;
    },
  };
  return api;
}
