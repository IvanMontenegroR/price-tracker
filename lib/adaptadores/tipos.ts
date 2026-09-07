import type { Origen, TipoVenta } from "../tipos.ts";
import { env } from "../entorno.ts";

/**
 * Todas las tiendas tienen la misma firma: dado un listing, devolver
 * { precio, envio, moneda, stock, timestamp }. Agregar una tienda no toca
 * nada del resto: se escribe un archivo acá y se registra en registro.ts.
 */

export type Lectura = {
  precio: number | null;
  envio: number | null;
  moneda: string;
  stock: boolean | null;
  ts: string;
  /** Por defecto "fijo": es lo que son todas las tiendas menos eBay. */
  tipoVenta?: TipoVenta;
  terminaEn?: string | null;
  /** Lo que devolvió la fuente, para poder auditar una lectura rara. */
  crudo?: unknown;
};

export type PedidoLectura = {
  url: string;
  sku: string | null;
  vendedor: string | null;
};

export interface Adaptador {
  slug: string;
  nombre: string;
  origen: Origen;
  /** false = está detrás de la interfaz pero sin implementar. */
  disponible: boolean;
  leer(pedido: PedidoLectura): Promise<Lectura>;
}

export class NoImplementado extends Error {}

export const ahora = (): string => new Date().toISOString();

/** Un GET liviano: un pedido, timeout corto, sin navegador. */
export async function traer(url: string, init: RequestInit = {}, timeoutMs = 15_000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: {
        "user-agent": env("USER_AGENT") ?? "precio-puesto/0.1 (uso personal)",
        "accept-language": "en-US,en;q=0.9",
        ...(init.headers ?? {}),
      },
    });
  } finally {
    clearTimeout(t);
  }
}
