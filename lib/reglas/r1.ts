import { calcularPuesto, type Desglose } from "../costo.ts";
import type { Observacion, Parametros, Watch } from "../tipos.ts";
import { pasaAntiRuido, reArmar, type Contexto, type EstadoWatch } from "./antiruido.ts";

/**
 * R1 — objetivo: precio_puesto ≤ objetivo_que_yo_puse.
 *
 * Es la única regla de esta versión. R2 (estadística) y R3 (error de precio)
 * necesitan historial y varias tiendas confiables leyendo al mismo tiempo;
 * construirlas ahora sería construirlas sobre datos que no existen.
 * Un producto sin historial corre solo R1 y R3: R1 no necesita nada previo.
 */

/** Cuánto puede tener de vieja una lectura para decidir sobre ella. */
export const FRESCURA_HORAS = 12;

export type Candidata = {
  observacion: Observacion;
  /** Para poder decir en la alerta de qué tienda es. */
  tienda: string;
  url: string;
};

export type ResultadoR1 =
  | {
      avisa: true;
      candidata: Candidata;
      desglose: Desglose;
      nuevoEstado: EstadoWatch;
    }
  | { avisa: false; motivo: string; mejor: { candidata: Candidata; desglose: Desglose } | null };

export function evaluarR1(
  watch: Watch,
  candidatas: readonly Candidata[],
  parametros: Parametros,
  ctx: Omit<Contexto, "referencia">
): ResultadoR1 {
  if (!watch.activo) return { avisa: false, motivo: "watch inactivo", mejor: null };
  if (watch.objetivoPuesto === null) {
    return { avisa: false, motivo: "el watch no tiene objetivo", mejor: null };
  }

  const frescas = candidatas.filter((c) => {
    const o = c.observacion;
    if (o.estado !== "ok" || o.precio === null) return false;
    const horas = (ctx.ahora.getTime() - new Date(o.ts).getTime()) / 3.6e6;
    return horas <= FRESCURA_HORAS;
  });

  // El desglose se recalcula acá con los parámetros de cada observación:
  // así una alerta vieja sigue mostrando la cuenta con la que se disparó.
  const conCosto = frescas.map((c) => ({
    candidata: c,
    desglose: calcularPuesto(
      { precio: c.observacion.precio!, envioUs: c.observacion.envioUs, pesoKg: c.observacion.pesoKg },
      { tarifaKg: c.observacion.tarifaKg, feeFijo: c.observacion.feeFijo, tasaImp: c.observacion.tasaImp }
    ),
  }));

  // La comparación es entre precios puestos, no entre etiquetas: una tienda
  // con etiqueta más cara y envío gratis puede ganar.
  const ordenadas = conCosto
    .slice()
    .sort((a, b) => a.desglose.puesto - b.desglose.puesto);
  const mejor = ordenadas[0] ?? null;

  if (!mejor) return { avisa: false, motivo: "sin lecturas frescas y válidas", mejor: null };

  // Para el mejor precio con stock, no el mejor precio a secas.
  const mejorConStock = ordenadas.find((x) => x.candidata.observacion.stock === true) ?? null;
  const elegida = mejorConStock ?? mejor;

  const objetivo = watch.objetivoPuesto;
  const estadoReArmado = reArmar(
    {
      ultimaAlertaEn: watch.ultimaAlertaEn,
      ultimoPuestoAlertado: watch.ultimoPuestoAlertado,
      armado: watch.armado,
    },
    elegida.desglose.puesto,
    objetivo
  );

  if (elegida.desglose.puesto > objetivo) {
    const falta = elegida.desglose.puesto - objetivo;
    return {
      avisa: false,
      motivo: `US$ ${falta.toFixed(2)} por encima del objetivo`,
      mejor: elegida,
    };
  }

  const veredicto = pasaAntiRuido(
    watch.regla,
    elegida.desglose.puesto,
    elegida.candidata.observacion.stock,
    estadoReArmado,
    { ...ctx, referencia: objetivo }
  );

  if (!veredicto.avisa) return { avisa: false, motivo: veredicto.motivo, mejor: elegida };

  return {
    avisa: true,
    candidata: elegida.candidata,
    desglose: elegida.desglose,
    nuevoEstado: veredicto.nuevoEstado,
  };
}

/** Distancia relativa al umbral: 0 = ya disparó, 0.05 = está al 5%. */
export function distanciaAlUmbral(puesto: number | null, objetivo: number | null): number | null {
  if (puesto === null || objetivo === null || objetivo <= 0) return null;
  return Math.max(0, (puesto - objetivo) / objetivo);
}
