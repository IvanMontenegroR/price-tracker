import { ahora, traer, type Adaptador, type Lectura, type PedidoLectura } from "./tipos.ts";
import { env } from "../entorno.ts";

/**
 * Best Buy: API oficial. La clave es gratis y el uso está permitido, así que
 * no hay razón para scrapear acá.
 *
 * El sku sale de la URL (.../site/algo/6418599.p) o se carga a mano.
 */
const RE_SKU = /\/(\d{7})\.p/;

export function skuDeUrl(url: string): string | null {
  return RE_SKU.exec(url)?.[1] ?? null;
}

export const bestbuy: Adaptador = {
  slug: "bestbuy",
  nombre: "Best Buy",
  origen: "api",
  disponible: true,
  async leer(pedido: PedidoLectura): Promise<Lectura> {
    const clave = env("BESTBUY_API_KEY");
    if (!clave) throw new Error("falta BESTBUY_API_KEY");

    const sku = pedido.sku ?? skuDeUrl(pedido.url);
    if (!sku) throw new Error(`no se pudo sacar el sku de ${pedido.url}`);

    const campos = "sku,name,salePrice,regularPrice,onlineAvailability,orderable,shippingCost";
    const url =
      `https://api.bestbuy.com/v1/products(sku=${sku})` +
      `?apiKey=${encodeURIComponent(clave)}&format=json&show=${campos}`;

    const res = await traer(url);
    if (!res.ok) throw new Error(`best buy ${res.status}`);
    const json = (await res.json()) as {
      products?: {
        salePrice?: number;
        shippingCost?: number | string;
        onlineAvailability?: boolean;
        orderable?: string;
      }[];
    };
    const p = json.products?.[0];
    if (!p) return { precio: null, envio: null, moneda: "USD", stock: null, ts: ahora(), crudo: json };

    const envio = typeof p.shippingCost === "string" ? Number(p.shippingCost) : p.shippingCost;

    return {
      precio: typeof p.salePrice === "number" ? p.salePrice : null,
      envio: Number.isFinite(envio) ? Number(envio) : 0,
      moneda: "USD",
      // orderable "Available" es más fiel que onlineAvailability para decidir compra.
      stock: p.orderable ? p.orderable === "Available" : (p.onlineAvailability ?? null),
      ts: ahora(),
      crudo: p,
    };
  },
};
