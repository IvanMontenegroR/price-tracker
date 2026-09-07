import { ahora, traer, type Adaptador, type Lectura, type PedidoLectura } from "./tipos.ts";

/**
 * Scraping liviano y genérico: casi todas las tiendas grandes publican
 * schema.org/Product en un <script type="application/ld+json"> porque lo
 * necesitan para Google Shopping. Leer eso es un GET y un JSON.parse; no hace
 * falta navegador ni parsear el HTML de la página, que es lo que se rompe
 * cada dos semanas.
 *
 * Se usa solo para tiendas sin feed ni API. Amazon queda afuera por contrato.
 */

type Nodo = Record<string, unknown>;

const EN_STOCK = /InStock|LimitedAvailability|OnlineOnly|InStoreOnly/i;
const SIN_STOCK = /OutOfStock|SoldOut|Discontinued|BackOrder|PreOrder/i;

export function extraerBloquesJsonLd(html: string): unknown[] {
  const bloques: unknown[] = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const m of html.matchAll(re)) {
    try {
      bloques.push(JSON.parse(m[1].trim()));
    } catch {
      // Un bloque roto no invalida los demás.
    }
  }
  return bloques;
}

function* aplanar(x: unknown): Generator<Nodo> {
  if (Array.isArray(x)) {
    for (const y of x) yield* aplanar(y);
    return;
  }
  if (x && typeof x === "object") {
    const n = x as Nodo;
    yield n;
    if ("@graph" in n) yield* aplanar(n["@graph"]);
    if ("offers" in n) yield* aplanar(n.offers);
    if ("hasVariant" in n) yield* aplanar(n.hasVariant);
  }
}

const esTipo = (n: Nodo, t: string): boolean => {
  const tipo = n["@type"];
  return Array.isArray(tipo) ? tipo.some((x) => String(x).includes(t)) : String(tipo ?? "").includes(t);
};

const aNumero = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = Number(v.replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

/** Precio, moneda y stock a partir del JSON-LD de una página de producto. */
export function leerOferta(bloques: unknown[]): Omit<Lectura, "ts"> {
  let precio: number | null = null;
  let moneda = "USD";
  let stock: boolean | null = null;
  let envio: number | null = null;

  for (const bloque of bloques) {
    for (const nodo of aplanar(bloque)) {
      if (!esTipo(nodo, "Offer") && !esTipo(nodo, "AggregateOffer")) continue;

      const p = aNumero(nodo.price ?? nodo.lowPrice ?? nodo.highPrice);
      // Me quedo con el menor precio ofrecido en la página.
      if (p !== null && (precio === null || p < precio)) precio = p;

      if (typeof nodo.priceCurrency === "string") moneda = nodo.priceCurrency;

      const disp = String(nodo.availability ?? "");
      if (SIN_STOCK.test(disp)) stock = stock === true ? true : false;
      else if (EN_STOCK.test(disp)) stock = true;

      const envioNodo = nodo.shippingDetails as Nodo | undefined;
      const tarifa = envioNodo?.shippingRate as Nodo | undefined;
      const e = aNumero(tarifa?.value);
      if (e !== null && (envio === null || e < envio)) envio = e;
    }
  }

  return { precio, envio, moneda, stock };
}

export type ConfigJsonLd = {
  slug: string;
  nombre: string;
  /** Algunas tiendas cortan pedidos sin un UA de navegador. */
  userAgent?: string;
};

export function adaptadorJsonLd(cfg: ConfigJsonLd): Adaptador {
  return {
    slug: cfg.slug,
    nombre: cfg.nombre,
    origen: "scrape",
    disponible: true,
    async leer(pedido: PedidoLectura): Promise<Lectura> {
      const res = await traer(pedido.url, {
        headers: cfg.userAgent ? { "user-agent": cfg.userAgent } : {},
      });
      if (!res.ok) throw new Error(`${cfg.slug} ${res.status}`);
      const html = await res.text();
      const bloques = extraerBloquesJsonLd(html);
      if (bloques.length === 0) throw new Error(`${cfg.slug}: la página no trae JSON-LD`);
      const oferta = leerOferta(bloques);
      // El envío casi nunca está en el JSON-LD; null lo resuelve el default
      // de la tienda en config, no una suposición del adaptador.
      return { ...oferta, ts: ahora(), crudo: { bloques: bloques.length } };
    },
  };
}
