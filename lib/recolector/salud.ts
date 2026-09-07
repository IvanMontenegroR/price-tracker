import type { EstadoLectura } from "../tipos";

/**
 * Circuit breaker por tienda.
 *
 * Un scraper roto no devuelve un error: devuelve precios. Nulos, cero, o el
 * precio de un accesorio de la misma página. Eso genera una tormenta de
 * errores falsos —y en R3, alertas de "error de precio" que son error mío—.
 * Si un adaptador pasa del 30% de lecturas malas en una hora, se apaga solo y
 * sale del cálculo de mercado_hoy hasta que lo revise.
 */

export const UMBRAL_MALAS = 0.3;
export const MINIMO_LECTURAS = 5;
export const APAGADO_MINUTOS = 60;

export type MuestraTienda = { tiendaSlug: string; total: number; malas: number };

export type Diagnostico = {
  tiendaSlug: string;
  ratio: number;
  apagar: boolean;
  motivo: string;
};

export function diagnosticar(m: MuestraTienda): Diagnostico {
  if (m.total < MINIMO_LECTURAS) {
    return { tiendaSlug: m.tiendaSlug, ratio: 0, apagar: false, motivo: "muestra chica" };
  }
  const ratio = m.malas / m.total;
  return {
    tiendaSlug: m.tiendaSlug,
    ratio,
    apagar: ratio > UMBRAL_MALAS,
    motivo: `${m.malas}/${m.total} lecturas malas en la última hora (${(ratio * 100).toFixed(0)}%)`,
  };
}

/**
 * Clasifica una lectura antes de guardarla. "Absurda" es lo que no puede ser
 * cierto: precio cero, negativo, o a años luz de lo que esa cosa vale.
 * El piso es deliberadamente bajo (2% de la mediana) para no confundirse con
 * un error de precio real, que es justo lo que R3 tiene que poder ver.
 */
export function clasificar(
  precio: number | null,
  medianaHistorica: number | null
): EstadoLectura {
  if (precio === null || !Number.isFinite(precio)) return "nula";
  if (precio <= 0) return "absurda";
  if (medianaHistorica !== null && medianaHistorica > 0) {
    if (precio > medianaHistorica * 20) return "absurda";
    if (precio < medianaHistorica * 0.02) return "absurda";
  }
  return "ok";
}

export const esMala = (e: EstadoLectura): boolean => e !== "ok";
