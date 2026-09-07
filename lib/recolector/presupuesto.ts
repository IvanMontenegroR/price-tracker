import { volatilidad } from "../estadistica.ts";
import type { Tier } from "../tipos.ts";

/**
 * Frecuencia por presupuesto, no por intervalo.
 *
 * No existe "cada X minutos": existe un techo de peticiones por día que se
 * reparte por prioridad. Si el presupuesto se agota, los fríos dejan de
 * chequearse y los calientes siguen. El sistema se auto-degrada; nunca se pasa
 * de costo.
 */

export const CADENCIA_MINUTOS: Record<Tier, number> = {
  caliente: 5,
  normal: 30,
  frio: 60 * 24,
};

/** A menos del 5% de disparar es caliente. */
export const UMBRAL_CALIENTE = 0.05;
/** Más del 50% por encima del objetivo: no va a pasar nada hoy. */
export const UMBRAL_FRIO = 0.5;
/** Fracción del presupuesto diario que queda reservada para los calientes. */
export const RESERVA_CALIENTE = 0.15;

export type CandidataLectura = {
  listingId: string;
  tiendaSlug: string;
  /** Cierre de la subasta, si es una. */
  terminaEn?: string | null;
  /** Distancia relativa al objetivo: 0 = ya disparó, 0.05 = está al 5%. */
  distancia: number | null;
  /** Precios puestos recientes de este listing, para medir volatilidad. */
  historial: readonly number[];
  ultimaLectura: string | null;
  /** Cambió el stock o hubo un salto de precio en la última lectura. */
  evento: boolean;
};

/** Una subasta que cierra dentro de esta ventana es caliente, valga lo que valga. */
export const CIERRE_CALIENTE_MINUTOS = 90;

export function tierDe(distancia: number | null, terminaEn?: string | null, ahora?: Date): Tier {
  // El reloj de una subasta manda sobre el precio: si cierra en veinte
  // minutos, es ahora o nunca aunque esté lejos del objetivo.
  if (terminaEn) {
    const faltan = (new Date(terminaEn).getTime() - (ahora ?? new Date()).getTime()) / 60_000;
    if (faltan > 0 && faltan <= CIERRE_CALIENTE_MINUTOS) return "caliente";
  }
  if (distancia === null) return "normal"; // sin objetivo: ni urgente ni olvidado
  if (distancia <= UMBRAL_CALIENTE) return "caliente";
  if (distancia >= UMBRAL_FRIO) return "frio";
  return "normal";
}

/** Una publicación que ya cerró no se lee más: no hay nada que leer. */
export function terminada(c: CandidataLectura, ahora: Date): boolean {
  return !!c.terminaEn && new Date(c.terminaEn).getTime() <= ahora.getTime();
}

/**
 * score = volatilidad_histórica × cercanía_al_umbral × evento
 *
 * La volatilidad es MAD/mediana, no desvío estándar: un solo error de precio
 * en el historial no debe convertir un producto quieto en prioritario.
 */
export function score(c: CandidataLectura): number {
  const vol = volatilidad(c.historial);
  const cercania = c.distancia === null ? 0.5 : 1 / (1 + c.distancia * 10);
  const evento = c.evento ? 2 : 1;
  // El piso de volatilidad evita que un producto sin historial quede en cero
  // y nunca se lea: sin lecturas no hay historial, y sin historial no hay score.
  return Math.max(vol, 0.01) * cercania * evento;
}

export function vencida(c: CandidataLectura, tier: Tier, ahora: Date): boolean {
  return atraso(c, tier, ahora) >= 1;
}

/** Cuántas cadencias pasaron desde la última lectura. 1 = recién vencida. */
export function atraso(c: CandidataLectura, tier: Tier, ahora: Date): number {
  // Nunca leído va primero: sin una lectura no hay historial, no hay distancia
  // y el producto es invisible en la lista.
  if (!c.ultimaLectura) return NUNCA_LEIDO;
  const minutos = (ahora.getTime() - new Date(c.ultimaLectura).getTime()) / 60_000;
  return minutos / CADENCIA_MINUTOS[tier];
}

export const NUNCA_LEIDO = 1e6;

/**
 * La prioridad final: score × atraso, sin tope al atraso.
 *
 * El score solo no alcanza. Si el presupuesto es más chico que la demanda —que
 * es el caso normal—, el listing de score más alto se lleva todos los slots y
 * el resto no se lee nunca: en la corrida de un día con techo de una lectura
 * por tick, un solo producto se llevó 284 de 288 lecturas y los otros nueve
 * quedaron invisibles. El atraso sin tope garantiza que a todos les llegue el
 * turno —el que espera crece sin límite, el que se lee vuelve a 1—, y el score
 * sigue decidiendo cuántas veces le toca a cada uno.
 */
export function prioridad(c: CandidataLectura, tier: Tier, ahora: Date): number {
  return score(c) * atraso(c, tier, ahora);
}

export type Plan = {
  aLeer: { candidata: CandidataLectura; tier: Tier; score: number }[];
  /** Vencidas que quedaron afuera por presupuesto. */
  postergadas: number;
  restanteDespues: number;
  soloCalientes: boolean;
};

export function planificar(
  candidatas: readonly CandidataLectura[],
  op: {
    ahora: Date;
    presupuestoDiario: number;
    usadasHoy: number;
    maxPorTick: number;
    /** Tiendas apagadas por el circuit breaker. */
    tiendasApagadas?: ReadonlySet<string>;
  }
): Plan {
  const apagadas = op.tiendasApagadas ?? new Set<string>();
  const restante = Math.max(0, op.presupuestoDiario - op.usadasHoy);
  const soloCalientes = restante <= op.presupuestoDiario * RESERVA_CALIENTE;

  const vencidas = candidatas
    .filter((c) => !apagadas.has(c.tiendaSlug))
    .filter((c) => !terminada(c, op.ahora))
    .map((c) => {
      const tier = tierDe(c.distancia, c.terminaEn, op.ahora);
      return { candidata: c, tier, score: prioridad(c, tier, op.ahora) };
    })
    .filter((x) => vencida(x.candidata, x.tier, op.ahora))
    .filter((x) => !soloCalientes || x.tier === "caliente")
    .sort((a, b) => b.score - a.score);

  const cupo = Math.min(restante, op.maxPorTick);
  const aLeer = vencidas.slice(0, cupo);

  return {
    aLeer,
    postergadas: vencidas.length - aLeer.length,
    restanteDespues: restante - aLeer.length,
    soloCalientes,
  };
}
