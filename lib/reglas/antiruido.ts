import type { Regla } from "../tipos.ts";

/**
 * El anti-ruido es el producto. Sin esto la herramienta se vuelve inusable
 * en una semana: un precio que oscila alrededor del objetivo genera una
 * alerta por chequeo, y a los tres días dejo de mirar los avisos.
 */

export const COOLDOWN_HORAS = 12;
export const TECHO_DIARIO = 5;
/** Tras avisar a X, no reabrir hasta que baje otro 5%. */
export const CAIDA_PARA_REABRIR = 0.05;

/** R3 (error de precio) es urgente por definición: ignora cooldown y techo. */
export const exentaDeRuido = (regla: Regla): boolean => regla === "R3";

export type EstadoWatch = {
  ultimaAlertaEn: string | null;
  ultimoPuestoAlertado: number | null;
  armado: boolean;
};

export type Contexto = {
  ahora: Date;
  /** Alertas ya enviadas hoy para este usuario, cualquier producto. */
  alertasHoy: number;
  /** Última alerta para ESTE producto, cualquier regla. El cooldown es por producto. */
  ultimaAlertaProducto: string | null;
  /** La referencia contra la que se compara: el objetivo en R1. */
  referencia: number | null;
};

export type Veredicto =
  | { avisa: true; nuevoEstado: EstadoWatch }
  | { avisa: false; motivo: string };

/**
 * Decide si una condición ya disparada se convierte en aviso.
 * La condición de la regla se evalúa antes; acá solo se filtra ruido.
 */
export function pasaAntiRuido(
  regla: Regla,
  puesto: number,
  stock: boolean | null,
  estado: EstadoWatch,
  ctx: Contexto
): Veredicto {
  // Sin stock nunca alerta. Precio bajo + agotado = ruido, y de los peores:
  // es el que más ganas dan de mirar y el único que no se puede comprar.
  if (stock !== true) return { avisa: false, motivo: "sin stock" };

  const exenta = exentaDeRuido(regla);

  if (!exenta) {
    if (ctx.alertasHoy >= TECHO_DIARIO) {
      return { avisa: false, motivo: `techo diario (${TECHO_DIARIO}) alcanzado` };
    }
    if (ctx.ultimaAlertaProducto) {
      const horas = (ctx.ahora.getTime() - new Date(ctx.ultimaAlertaProducto).getTime()) / 3.6e6;
      if (horas < COOLDOWN_HORAS) {
        return { avisa: false, motivo: `cooldown: ${horas.toFixed(1)}h de ${COOLDOWN_HORAS}h` };
      }
    }
  }

  // Histéresis. Dos formas de reabrir: baja otro 5%, o el precio volvió por
  // encima de la referencia y bajó de nuevo (lo re-arma reArmar()).
  if (!estado.armado) {
    const previo = estado.ultimoPuestoAlertado;
    if (previo !== null && puesto > previo * (1 - CAIDA_PARA_REABRIR)) {
      const falta = (previo * (1 - CAIDA_PARA_REABRIR)).toFixed(2);
      return { avisa: false, motivo: `histéresis: hace falta ≤ US$ ${falta}` };
    }
  }

  return {
    avisa: true,
    nuevoEstado: {
      ultimaAlertaEn: ctx.ahora.toISOString(),
      ultimoPuestoAlertado: puesto,
      armado: false,
    },
  };
}

/**
 * Se llama en cada lectura, dispare o no: si el precio volvió por encima de la
 * referencia, el watch se re-arma y la próxima bajada vuelve a avisar.
 */
export function reArmar(estado: EstadoWatch, puesto: number | null, referencia: number | null): EstadoWatch {
  if (estado.armado) return estado;
  if (puesto === null || referencia === null) return estado;
  if (puesto > referencia) return { ...estado, armado: true };
  return estado;
}
