import { env } from "../entorno.ts";
import { ahora, traer, type Adaptador, type Lectura, type PedidoLectura } from "./tipos.ts";

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

const BASE = "https://api.ebay.com";
const MERCADO = () => env("EBAY_MARKETPLACE") ?? "EBAY_US";

/** El token de aplicación dura dos horas; se pide una vez por corrida. */
let token: { valor: string; vence: number } | null = null;

async function tokenDeApp(): Promise<string> {
  if (token && Date.now() < token.vence) return token.valor;

  const id = env("EBAY_CLIENT_ID");
  const secreto = env("EBAY_CLIENT_SECRET");
  if (!id || !secreto) throw new Error("faltan EBAY_CLIENT_ID o EBAY_CLIENT_SECRET");

  const res = await traer(`${BASE}/identity/v1/oauth2/token`, {
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

export const ebay: Adaptador = {
  slug: "ebay",
  nombre: "eBay",
  origen: "api",
  disponible: true,
  async leer(pedido: PedidoLectura): Promise<Lectura> {
    const item = pedido.sku ?? itemDeUrl(pedido.url);
    if (!item) throw new Error(`no se pudo sacar el id de item de ${pedido.url}`);

    const res = await traer(
      `${BASE}/buy/browse/v1/item/get_item_by_legacy_id?legacy_item_id=${encodeURIComponent(item)}`,
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
};
