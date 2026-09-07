import { ahora, traer, type Adaptador, type Lectura, type PedidoLectura } from "./tipos";

/**
 * Feeds de afiliados (Awin, Impact): la fuente preferida cuando la tienda está.
 * Traen precio y stock, se actualizan a diario, son gratis y son legales.
 *
 * Ambas redes exportan el catálogo como CSV. El adaptador baja el archivo una
 * vez por corrida, lo indexa por sku y de ahí en más responde en memoria: mil
 * listings de esa tienda cuestan un solo pedido.
 *
 * Hoy no tengo ninguna cuenta de publisher aprobada, así que no hay ninguna
 * tienda registrada con este adaptador. El día que aprueben una, es una
 * entrada en registro.ts y nada más.
 */

export type ColumnasFeed = {
  sku: string;
  precio: string;
  envio?: string;
  moneda?: string;
  stock?: string;
  url?: string;
};

export const COLUMNAS_AWIN: ColumnasFeed = {
  sku: "merchant_product_id",
  precio: "search_price",
  envio: "delivery_cost",
  moneda: "currency",
  stock: "in_stock",
  url: "merchant_deep_link",
};

export const COLUMNAS_IMPACT: ColumnasFeed = {
  sku: "CatalogItemId",
  precio: "CurrentPrice",
  moneda: "Currency",
  stock: "StockAvailability",
  url: "Url",
};

/** CSV con comillas dobles y comas dentro de campo. */
export function parsearCsv(texto: string, separador = ","): Record<string, string>[] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = "";
  let entreComillas = false;

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (entreComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++; }
        else entreComillas = false;
      } else campo += c;
      continue;
    }
    if (c === '"') { entreComillas = true; continue; }
    if (c === separador) { fila.push(campo); campo = ""; continue; }
    if (c === "\n") { fila.push(campo); filas.push(fila); fila = []; campo = ""; continue; }
    if (c === "\r") continue;
    campo += c;
  }
  if (campo !== "" || fila.length) { fila.push(campo); filas.push(fila); }

  const [cabecera, ...resto] = filas;
  if (!cabecera) return [];
  return resto
    .filter((f) => f.some((x) => x !== ""))
    .map((f) => Object.fromEntries(cabecera.map((col, i) => [col.trim(), (f[i] ?? "").trim()])));
}

const VERDADERO = /^(1|true|y|yes|in ?stock|available|si|sí)$/i;

export function lecturaDeFila(fila: Record<string, string>, cols: ColumnasFeed): Omit<Lectura, "ts"> {
  const num = (v: string | undefined): number | null => {
    if (!v) return null;
    const n = Number(v.replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) ? n : null;
  };
  const crudoStock = cols.stock ? fila[cols.stock] : undefined;
  return {
    precio: num(fila[cols.precio]),
    envio: cols.envio ? num(fila[cols.envio]) : null,
    moneda: (cols.moneda ? fila[cols.moneda] : "") || "USD",
    stock: crudoStock === undefined || crudoStock === "" ? null : VERDADERO.test(crudoStock),
  };
}

export type ConfigFeed = {
  slug: string;
  nombre: string;
  /** URL del datafeed, normalmente con la clave del publisher adentro. */
  urlFeed: string;
  columnas: ColumnasFeed;
  separador?: string;
};

export function adaptadorFeed(cfg: ConfigFeed): Adaptador {
  let indice: Map<string, Record<string, string>> | null = null;

  return {
    slug: cfg.slug,
    nombre: cfg.nombre,
    origen: "feed",
    disponible: true,
    async leer(pedido: PedidoLectura): Promise<Lectura> {
      if (!indice) {
        const res = await traer(cfg.urlFeed, {}, 60_000);
        if (!res.ok) throw new Error(`${cfg.slug}: feed ${res.status}`);
        const filas = parsearCsv(await res.text(), cfg.separador ?? ",");
        indice = new Map(filas.map((f) => [f[cfg.columnas.sku], f]));
      }
      if (!pedido.sku) throw new Error(`${cfg.slug}: el listing no tiene sku y el feed indexa por sku`);
      const fila = indice.get(pedido.sku);
      if (!fila) return { precio: null, envio: null, moneda: "USD", stock: null, ts: ahora(), crudo: { enFeed: false } };
      return { ...lecturaDeFila(fila, cfg.columnas), ts: ahora(), crudo: fila };
    },
  };
}
