// Vocabulario del dominio. Tres cosas separadas, y encima watch y alerta.

/** Parámetros de costo de importación. Globales, editables, versionados. */
export type Parametros = {
  id?: string;
  /** USD por kilo que cobra el courier. */
  tarifaKg: number;
  /** USD fijos por envío. */
  feeFijo: number;
  /** Tasa de importación sobre el precio de etiqueta, 0.15 = 15%. */
  tasaImp: number;
  vigenteDesde?: string;
  nota?: string | null;
};

export const PARAMETROS_INICIALES: Parametros = {
  tarifaKg: 7,
  feeFijo: 5,
  tasaImp: 0.15,
};

/** La entidad abstracta: "iPhone 17 Pro 256GB". El peso vive acá. */
export type Producto = {
  id: string;
  usuarioId: string;
  nombre: string;
  marca: string | null;
  pesoKg: number;
  notas: string | null;
};

export type Condicion = "nuevo" | "open_box" | "reacondicionado";

/** Ese producto en una tienda concreta. */
export type Listing = {
  id: string;
  productoId: string;
  tiendaId: string;
  url: string;
  sku: string | null;
  vendedor: string | null;
  condicion: Condicion;
  activo: boolean;
};

export type Tienda = {
  id: string;
  slug: string;
  nombre: string;
  /** Clave en el registro de adaptadores. */
  adaptador: string;
  /** Si entra en el cálculo de mercado_hoy (R3). */
  confiable: boolean;
  activa: boolean;
  config: Record<string, unknown>;
};

export type Origen = "feed" | "api" | "scrape" | "fixture";
export type EstadoLectura = "ok" | "nula" | "absurda";

/** Una lectura: (listing, timestamp, precio, envío, stock). */
export type Observacion = {
  id?: number;
  listingId: string;
  usuarioId: string;
  ts: string;
  precio: number | null;
  envioUs: number | null;
  moneda: string;
  stock: boolean | null;
  origen: Origen;
  estado: EstadoLectura;
  /** Parámetros congelados, para poder recalcular el histórico. */
  parametrosId: string | null;
  tarifaKg: number;
  feeFijo: number;
  tasaImp: number;
  pesoKg: number;
  /** Lo calcula la base como columna generada. */
  puestoPy?: number | null;
  crudo?: unknown;
};

export type Regla = "R1" | "R2" | "R3";

export type Watch = {
  id: string;
  usuarioId: string;
  productoId: string;
  regla: Regla;
  objetivoPuesto: number | null;
  activo: boolean;
  ultimaAlertaEn: string | null;
  ultimoPuestoAlertado: number | null;
  /** Histéresis: false = ya disparó y espera reset. */
  armado: boolean;
};

export type Tier = "caliente" | "normal" | "frio";
