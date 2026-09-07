import { env } from "../entorno.ts";
import type { Condicion } from "../tipos.ts";
import {
  ahora,
  traer,
  type Adaptador,
  type Consulta,
  type Hallazgo,
  type Lectura,
  type PedidoLectura,
} from "./tipos.ts";

/**
 * eBay por la Browse API oficial.
 *
 * Es gratis, no exige ventas previas como Amazon y devuelve lo que hace falta:
 * precio, envío, condición, si es subasta y cuándo termina. Nada de scraping.
 *
 * Lo que eBay agrega al modelo y las otras tiendas no tenían: el precio de una
 * subasta no es un precio, es una apuesta parcial. Ver `tipoVenta` en tipos.ts
 * y la ventana de subasta en reglas/r1.ts.
 */

/**
 * Sandbox o producción. El sandbox se habilita apenas te aprueban la cuenta de
 * desarrollador y devuelve datos de mentira, pero con la forma exacta de la
 * respuesta real: sirve para confirmar el mapeo de campos sin esperar el
 * keyset de producción.
 */
const enSandbox = () => env("EBAY_ENV") === "sandbox";
const BASE = () => (enSandbox() ? "https://api.sandbox.ebay.com" : "https://api.ebay.com");
const MERCADO = () => env("EBAY_MARKETPLACE") ?? "EBAY_US";

/** El token de aplicación dura dos horas; se pide una vez por corrida. */
let token: { valor: string; vence: number } | null = null;

async function tokenDeApp(): Promise<string> {
  if (token && Date.now() < token.vence) return token.valor;

  const id = env("EBAY_CLIENT_ID");
  const secreto = env("EBAY_CLIENT_SECRET");
  if (!id || !secreto) throw new Error("faltan EBAY_CLIENT_ID o EBAY_CLIENT_SECRET");

  const res = await traer(`${BASE()}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: {
      authorization: `Basic ${btoa(`${id}:${secreto}`)}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials&scope=" + encodeURIComponent("https://api.ebay.com/oauth/api_scope"),
  });
  if (!res.ok) throw new Error(`ebay oauth ${res.status}: ${(await res.text()).slice(0, 200)}`);

  const json = (await res.json()) as { access_token: string; expires_in: number };
  // Un minuto de colchón: un token que vence a mitad de corrida es un 401
  // que parece una tienda caída.
  token = { valor: json.access_token, vence: Date.now() + (json.expires_in - 60) * 1000 };
  return token.valor;
}

/** Para las pruebas y para forzar el refresco entre corridas. */
export const olvidarToken = () => (token = null);

const RE_ITEM = /\/itm\/(?:[^/]*\/)?(\d{11,12})/;

export function itemDeUrl(url: string): string | null {
  return RE_ITEM.exec(url)?.[1] ?? null;
}

type RespuestaItem = {
  price?: { value?: string; currency?: string };
  currentBidPrice?: { value?: string; currency?: string };
  shippingOptions?: { shippingCost?: { value?: string; currency?: string } }[];
  estimatedAvailabilities?: { estimatedAvailabilityStatus?: string; availableQuantity?: number }[];
  buyingOptions?: string[];
  itemEndDate?: string;
  condition?: string;
  itemWebUrl?: string;
  image?: { imageUrl?: string };
  thumbnailImages?: { imageUrl?: string }[];
  additionalImages?: { imageUrl?: string }[];
};

const aNumero = (v: string | undefined): number | null => {
  if (v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function leerItem(item: RespuestaItem): Omit<Lectura, "ts"> {
  const opciones = item.buyingOptions ?? [];
  const esSubasta = opciones.includes("AUCTION");
  // En una subasta con "cómpralo ya", `price` es el fijo y `currentBidPrice`
  // la puja. Sigo el que se puede pagar hoy: si hay fijo, ese.
  const fijo = aNumero(item.price?.value);
  const puja = aNumero(item.currentBidPrice?.value);
  const soloSubasta = esSubasta && !opciones.includes("FIXED_PRICE");

  const precio = soloSubasta ? (puja ?? fijo) : (fijo ?? puja);
  const envio = aNumero(item.shippingOptions?.[0]?.shippingCost?.value);

  const disponibilidad = item.estimatedAvailabilities?.[0];
  const stock =
    disponibilidad?.estimatedAvailabilityStatus === undefined
      ? null
      : disponibilidad.estimatedAvailabilityStatus !== "OUT_OF_STOCK";

  return {
    precio,
    envio,
    moneda: item.price?.currency ?? item.currentBidPrice?.currency ?? "USD",
    stock,
    tipoVenta: soloSubasta ? "subasta" : opciones.includes("BEST_OFFER") ? "mejor_oferta" : "fijo",
    terminaEn: item.itemEndDate ?? null,
    imagen: item.image?.imageUrl ?? item.thumbnailImages?.[0]?.imageUrl ?? null,
    crudo: { condition: item.condition, buyingOptions: opciones },
  };
}

/** Las condiciones de eBay, traducidas a las mías. */
export function condicionDeEbay(c: string | undefined): Condicion | null {
  if (!c) return null;
  const t = c.toLowerCase();
  if (t.includes("for parts") || t.includes("not working")) return null;
  if (t.includes("open box") || t.includes("new other")) return "open_box";
  if (t.includes("refurb")) return "reacondicionado";
  if (t.startsWith("new")) return "nuevo";
  return "usado";
}

type Resumen = {
  itemId?: string;
  title?: string;
  itemWebUrl?: string;
  price?: { value?: string; currency?: string };
  currentBidPrice?: { value?: string; currency?: string };
  shippingOptions?: { shippingCost?: { value?: string } }[];
  condition?: string;
  buyingOptions?: string[];
  itemEndDate?: string;
  image?: { imageUrl?: string };
  seller?: { username?: string };
};

export const ebay: Adaptador = {
  slug: "ebay",
  nombre: "eBay",
  origen: "api",
  disponible: true,
  async leer(pedido: PedidoLectura): Promise<Lectura> {
    const item = pedido.sku ?? itemDeUrl(pedido.url);
    if (!item) throw new Error(`no se pudo sacar el id de item de ${pedido.url}`);

    const res = await traer(
      `${BASE()}/buy/browse/v1/item/get_item_by_legacy_id?legacy_item_id=${encodeURIComponent(item)}`,
      {
        headers: {
          authorization: `Bearer ${await tokenDeApp()}`,
          "X-EBAY-C-MARKETPLACE-ID": MERCADO(),
        },
      }
    );

    // Una publicación que terminó devuelve 404: no es una falla del adaptador,
    // es un listing que hay que dar de baja.
    if (res.status === 404) {
      return { precio: null, envio: null, moneda: "USD", stock: false, ts: ahora(), crudo: { fin: true } };
    }
    if (!res.ok) throw new Error(`ebay ${res.status}: ${(await res.text()).slice(0, 200)}`);

    return { ...leerItem((await res.json()) as RespuestaItem), ts: ahora() };
  },

  /**
   * Buscar en el catálogo. El recorte de precio va en el filtro del servidor
   * y no en mi código: lo que no viaja no cuesta cupo ni hay que descartar
   * después.
   */
  async buscar(consulta: Consulta): Promise<Hallazgo[]> {
    const filtros: string[] = [];
    const min = consulta.precioMin ?? null;
    const max = consulta.precioMax ?? null;
    if (min !== null || max !== null) {
      filtros.push(`price:[${min !== null ? min.toFixed(0) : ""}..${max !== null ? max.toFixed(0) : ""}]`);
      filtros.push("priceCurrency:USD");
    }

    const params = new URLSearchParams({
      q: consulta.texto,
      limit: String(Math.min(consulta.maximo ?? 25, 50)),
    });
    if (filtros.length) params.set("filter", filtros.join(","));

    const res = await traer(`${BASE()}/buy/browse/v1/item_summary/search?${params}`, {
      headers: {
        authorization: `Bearer ${await tokenDeApp()}`,
        "X-EBAY-C-MARKETPLACE-ID": MERCADO(),
      },
    });
    if (!res.ok) throw new Error(`ebay búsqueda ${res.status}: ${(await res.text()).slice(0, 200)}`);

    const json = (await res.json()) as { itemSummaries?: Resumen[] };
    return (json.itemSummaries ?? []).flatMap((r) => {
      const url = r.itemWebUrl ?? "";
      const id = itemDeUrl(url);
      // Sin id de item no hay nada que releer después: no sirve como listing.
      if (!id) return [];
      const opciones = r.buyingOptions ?? [];
      const soloSubasta = opciones.includes("AUCTION") && !opciones.includes("FIXED_PRICE");
      const fijo = aNumero(r.price?.value);
      const puja = aNumero(r.currentBidPrice?.value);
      return [
        {
          url,
          sku: id,
          titulo: r.title ?? "",
          precio: soloSubasta ? (puja ?? fijo) : (fijo ?? puja),
          envio: aNumero(r.shippingOptions?.[0]?.shippingCost?.value),
          moneda: r.price?.currency ?? "USD",
          condicion: condicionDeEbay(r.condition),
          tipoVenta: soloSubasta ? ("subasta" as const) : opciones.includes("BEST_OFFER") ? ("mejor_oferta" as const) : ("fijo" as const),
          terminaEn: r.itemEndDate ?? null,
          imagen: r.image?.imageUrl ?? null,
          vendedor: r.seller?.username ?? null,
        },
      ];
    });
  },
};
