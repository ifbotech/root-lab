/* diagnostico.mjs — cruzar lo que ve la cámara con lo que miden los sensores.
 *
 * POR QUÉ ESTE MÓDULO EXISTE
 *
 * El sensor mide cuatro cosas: agua en la tierra, temperatura, humedad del
 * aire y luz. La planta tiene muchos más problemas que esos cuatro. Falta de
 * nitrógeno, exceso de sales por fertilizar de más, araña roja, hongos,
 * raíces podridas: nada de eso mueve una lectura, y todo eso se ve en una
 * hoja.
 *
 * Así que la cámara no está para repetir lo que el sensor ya dice. Está para
 * lo contrario:
 *
 *   **el diagnóstico vale justo cuando los sensores dicen que todo está bien
 *   y la planta igual se ve mal.**
 *
 * Ese es el hueco que el hardware no puede tapar, y es donde una foto aporta
 * algo que no es decoración.
 *
 * CÓMO FUNCIONA
 *
 * La API de visión devuelve HALLAZGOS visuales —hojas amarillas, puntas
 * marrones, manchas, caída— sin opinar sobre la causa. La causa sale de
 * cruzar cada hallazgo con la telemetría, y eso se hace acá, en una tabla
 * pura y testeable.
 *
 * El mismo síntoma con distinta telemetría es un problema distinto:
 *
 *   hojas amarillas + tierra encharcada  -> exceso de riego, raíces ahogadas
 *   hojas amarillas + tierra seca        -> sequía sostenida
 *   hojas amarillas + tierra en su rango -> falta de nutrientes  <- el hueco
 *
 * La tercera fila es la que justifica la función entera: es un problema real
 * que el sensor nunca va a ver, y que sin la foto el usuario atribuiría al
 * riego porque es lo único que sabe mirar.
 */

/* Los hallazgos que la visión sabe reportar. Es una lista cerrada a
 * propósito: si el modelo devuelve algo que no está acá, se ignora en vez de
 * inventarle una interpretación. */
export const HALLAZGOS = [
  'sana',
  'hojas_amarillas',
  'puntas_marrones',
  'manchas',
  'caida',
  'hojas_caidas',
  'tallo_estirado',
  'plagas',
  'moho',
];

export const HALLAZGO_ES = {
  sana: 'se ve sana',
  hojas_amarillas: 'hojas amarillas',
  puntas_marrones: 'puntas marrones',
  manchas: 'manchas en las hojas',
  caida: 'hojas caídas o mustias',
  hojas_caidas: 'se le están cayendo hojas',
  tallo_estirado: 'tallos estirados y finos',
  plagas: 'signos de plagas',
  moho: 'moho en la tierra',
};

/* Dónde cae una lectura respecto del rango de la especie. */
export function zona(valor, min, max) {
  if (!Number.isFinite(valor) || !Number.isFinite(min) || !Number.isFinite(max)) {
    return 'desconocida';
  }
  if (valor < min) return 'baja';
  if (valor > max) return 'alta';
  return 'ok';
}

/**
 * Cruza un hallazgo visual con la telemetría y devuelve la conclusión.
 *
 * `confirma` dice si el sensor respalda lo que se ve. Cuando es false y hay
 * un problema visible, estamos justo en el caso que hace valiosa la cámara, y
 * la interfaz lo marca distinto.
 */
export function interpretar(hallazgo, tel, especie) {
  const suelo = zona(tel?.soil_pct, especie?.soil_min, especie?.soil_max);
  const aire = Number.isFinite(tel?.rh_pct) && Number.isFinite(especie?.rh_min)
    ? (tel.rh_pct < especie.rh_min ? 'baja' : 'ok') : 'desconocida';
  const luz = zona(tel?.lux, especie?.lux_min, especie?.lux_max);
  const temp = zona(tel?.temp_dc, especie?.temp_min_dc, especie?.temp_max_dc);

  switch (hallazgo) {
    case 'sana':
      return {
        causa: 'nada que corregir',
        detalle: 'La foto coincide con lo que miden los sensores.',
        confirma: true, accion: null, gravedad: 'ninguna',
      };

    case 'hojas_amarillas':
      if (suelo === 'alta') {
        return {
          causa: 'exceso de riego',
          detalle: `La tierra está al ${tel.soil_pct}%, por encima del rango. Amarillear con la tierra mojada casi siempre es raíz ahogada.`,
          confirma: true, gravedad: 'alta',
          accion: 'Dejá de regar hasta que la tierra baje del rango y revisá que la maceta drene.',
        };
      }
      if (suelo === 'baja') {
        return {
          causa: 'sequía sostenida',
          detalle: `La tierra está al ${tel.soil_pct}%, por debajo del rango.`,
          confirma: true, gravedad: 'media',
          accion: 'Regá y volvé a mirarla en una semana.',
        };
      }
      return {
        causa: 'probable falta de nutrientes',
        detalle: 'El riego está bien y aun así amarillea. Eso ningún sensor lo mide: suele ser falta de nitrógeno, sobre todo si hace más de seis meses que no se cambia el sustrato.',
        confirma: false, gravedad: 'media',
        accion: 'Fertilizá suave, la mitad de lo que diga el envase, y esperá tres semanas.',
      };

    case 'puntas_marrones':
      if (aire === 'baja') {
        return {
          causa: 'aire seco',
          detalle: `La humedad del aire está al ${tel.rh_pct}% y esta especie quiere al menos ${especie.rh_min}%.`,
          confirma: true, gravedad: 'baja',
          accion: 'Agrupala con otras plantas o poné un plato con agua cerca.',
        };
      }
      return {
        causa: 'probable exceso de sales',
        detalle: 'El aire está bien, así que las puntas quemadas apuntan a acumulación de fertilizante o a cloro del agua de la canilla.',
        confirma: false, gravedad: 'baja',
        accion: 'Regá a fondo con agua reposada para lavar el sustrato y no fertilices por un mes.',
      };

    case 'manchas':
      if (suelo === 'alta') {
        return {
          causa: 'probable hongo',
          detalle: `Manchas con la tierra al ${tel.soil_pct}%, encima del rango: la humedad sostenida es el ambiente donde prosperan.`,
          confirma: true, gravedad: 'alta',
          accion: 'Sacá las hojas afectadas, espaciá los riegos y mejorá la ventilación.',
        };
      }
      return {
        causa: 'manchas sin causa ambiental visible',
        detalle: 'Los sensores no muestran nada raro, así que puede ser quemadura de sol puntual, agua sobre las hojas, o el principio de algo que conviene mirar de nuevo en unos días.',
        confirma: false, gravedad: 'media',
        accion: 'Sacá una foto nueva en tres días y compará.',
      };

    case 'caida':
    case 'hojas_caidas':
      if (suelo === 'baja') {
        return {
          causa: 'sed',
          detalle: `La tierra está al ${tel.soil_pct}%. La planta se desmaya antes de secarse.`,
          confirma: true, gravedad: 'alta',
          accion: 'Regá ahora. Suele recuperarse en unas horas.',
        };
      }
      if (suelo === 'alta') {
        return {
          causa: 'raíces ahogadas',
          detalle: `Mustia con la tierra al ${tel.soil_pct}%: parece sed pero es lo contrario. Las raíces podridas no pueden absorber, y la planta se marchita con los pies en el agua.`,
          confirma: true, gravedad: 'alta',
          accion: 'No riegues. Sacala de la maceta y revisá si hay raíces blandas y marrones.',
        };
      }
      if (temp !== 'ok' && temp !== 'desconocida') {
        return {
          causa: 'golpe de temperatura',
          detalle: `El riego está bien pero la temperatura está ${temp === 'baja' ? 'por debajo' : 'por encima'} del rango.`,
          confirma: true, gravedad: 'media',
          accion: 'Movela de lugar y dale unos días.',
        };
      }
      return {
        causa: 'mustia sin causa medible',
        detalle: 'Agua, temperatura y luz están en rango. Con esos tres descartados, lo que queda suele estar bajo tierra: raíces apretadas o dañadas.',
        confirma: false, gravedad: 'media',
        accion: 'Revisá las raíces. Si llenaron la maceta, es hora de trasplantar.',
      };

    case 'tallo_estirado':
      if (luz === 'baja') {
        return {
          causa: 'falta de luz',
          detalle: `Recibe menos luz de la que necesita, y estirarse buscando la ventana es exactamente lo que hace una planta en esa situación.`,
          confirma: true, gravedad: 'media',
          accion: 'Movela a un lugar más claro. Los tallos ya estirados no se acortan; lo nuevo va a crecer compacto.',
        };
      }
      return {
        causa: 'estiramiento con luz suficiente',
        detalle: 'El sensor mide luz de sobra. Puede ser que el sensor esté mirando a la ventana y la planta no, o que el estiramiento sea viejo y de antes de moverla.',
        confirma: false, gravedad: 'baja',
        accion: 'Fijate que el sensor de luz esté a la altura de las hojas y no apuntando al vidrio.',
      };

    case 'plagas':
      return {
        causa: 'plaga',
        detalle: aire === 'baja'
          ? `Con el aire al ${tel.rh_pct}% el ambiente favorece a la araña roja, que es la que aparece con aire seco.`
          : 'Ningún sensor detecta plagas: esto sólo se ve mirando.',
        confirma: false, gravedad: 'alta',
        accion: 'Aislala de las otras plantas hoy mismo y tratala. Revisá el envés de las hojas.',
      };

    case 'moho':
      return {
        causa: 'moho en el sustrato',
        detalle: suelo === 'alta'
          ? `Tierra al ${tel.soil_pct}%, por encima del rango: mojada y sin ventilación es donde sale.`
          : 'Suele ser poca ventilación más que exceso de agua.',
        confirma: suelo === 'alta', gravedad: 'baja',
        accion: 'Raspá la capa de arriba, dejá secar más entre riegos y ventilá el ambiente.',
      };

    default:
      return {
        causa: 'hallazgo desconocido',
        detalle: 'La app no sabe interpretar esto todavía.',
        confirma: false, gravedad: 'ninguna', accion: null,
      };
  }
}

/**
 * El diagnóstico completo: todos los hallazgos cruzados, más un veredicto.
 *
 * El veredicto distingue tres situaciones y las tres se ven distinto en la
 * interfaz, porque significan cosas distintas para quien cuida la planta:
 *
 *   'sana'      la foto y los sensores coinciden en que está bien
 *   'confirma'  se ve un problema y el sensor ya lo estaba diciendo
 *   'revela'    se ve un problema que NINGÚN sensor podía ver
 *
 * El tercero es el que justifica sacar la foto.
 */
export function diagnosticar(hallazgos, tel, especie) {
  const lista = (hallazgos || []).filter((h) => HALLAZGOS.includes(h));

  if (lista.length === 0) {
    return {
      veredicto: 'sin-datos',
      titulo: 'No pude leer la foto',
      resumen: 'Probá de nuevo con más luz y la planta entera en el cuadro.',
      conclusiones: [],
    };
  }

  const conclusiones = lista
    .filter((h) => h !== 'sana' || lista.length === 1)
    .map((h) => ({ hallazgo: h, ...interpretar(h, tel, especie) }));

  const problemas = conclusiones.filter((c) => c.gravedad !== 'ninguna');

  if (problemas.length === 0) {
    return {
      veredicto: 'sana',
      titulo: 'Se ve bien, y los sensores coinciden',
      resumen: 'No hay nada que corregir hoy.',
      conclusiones,
    };
  }

  const revela = problemas.filter((c) => !c.confirma);
  const orden = { alta: 0, media: 1, baja: 2, ninguna: 3 };
  problemas.sort((a, b) => orden[a.gravedad] - orden[b.gravedad]);

  if (revela.length > 0) {
    return {
      veredicto: 'revela',
      titulo: 'La cámara ve algo que los sensores no',
      resumen: revela.length === 1
        ? `Los números están en rango, pero se ve ${HALLAZGO_ES[revela[0].hallazgo]}. Eso ningún sensor lo mide.`
        : `Los números están en rango, pero se ven ${revela.length} cosas que ningún sensor mide.`,
      conclusiones: problemas,
    };
  }

  return {
    veredicto: 'confirma',
    titulo: 'La foto confirma lo que dicen los sensores',
    resumen: `${HALLAZGO_ES[problemas[0].hallazgo]}, y la causa se ve en los números.`,
    conclusiones: problemas,
  };
}
