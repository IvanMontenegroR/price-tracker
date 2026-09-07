import type { Desglose } from "../costo.ts";
import type { MuestraTienda } from "../recolector/salud.ts";
import type { Candidato, ProductoABuscar } from "../descubrimiento/descubrir.ts";
import type { Observacion, Parametros, Watch } from "../tipos.ts";

/**
 * Todo lo que el recolector necesita de la base, detrás de una interfaz.
 * Hay dos implementaciones: Supabase (producción) y memoria (pruebas y la
 * corrida de humo). El motor no sabe cuál está usando.
 */

export type FilaPlanificacion = {
  listingId: string;
  usuarioId: string;
  productoId: string;
  productoNombre: string;
  pesoKg: number;
  tiendaSlug: string;
  adaptador: string;
  url: string;
  sku: string | null;
  vendedor: string | null;
  imagenUrl: string | null;
  ultimaLectura: string | null;
  /** Cierre de la subasta, de la última lectura. null en precio fijo. */
  terminaEn: string | null;
  /** Precios puestos recientes, del más nuevo al más viejo. */
  historial: number[];
  distancia: number | null;
  evento: boolean;
};

export type CandidataEval = {
  productoId: string;
  tienda: string;
  url: string;
  observacion: Observacion;
};

export type WatchConProducto = Watch & { productoNombre: string; pesoKg: number };

export type Evaluacion = {
  watches: WatchConProducto[];
  candidatas: Map<string, CandidataEval[]>;
  alertasHoy: Map<string, number>;
  ultimaAlertaProducto: Map<string, string>;
};

export type SuscripcionPush = { endpoint: string; p256dh: string; auth: string };

export type DatosAlerta = {
  usuarioId: string;
  watchId: string;
  productoId: string;
  observacionId: number | null;
  regla: string;
  puesto: number;
  desglose: Desglose & { tienda: string; url: string; producto: string };
  canales: Record<string, string>;
};

export type ResumenCorrida = {
  inicio: string;
  fin: string;
  leidas: number;
  fallidas: number;
  postergadas: number;
  presupuesto: number;
  usadasHoy: number;
  detalle: Record<string, unknown>;
};

export interface Deposito {
  planificacion(): Promise<{
    filas: FilaPlanificacion[];
    tiendasApagadas: Set<string>;
    usadasHoy: number;
  }>;
  parametrosDe(usuarioId: string): Promise<Parametros>;
  guardarObservaciones(obs: Observacion[]): Promise<Observacion[]>;
  muestrasSalud(): Promise<MuestraTienda[]>;
  apagarTienda(slug: string, motivo: string, hasta: string): Promise<void>;
  actualizarImagen(listingId: string, imagen: string): Promise<void>;

  /** Productos a los que les toca búsqueda, con lo que ya se les propuso. */
  productosParaBuscar(horas: number, limite: number): Promise<ProductoABuscar[]>;
  guardarCandidatos(candidatos: Candidato[]): Promise<void>;
  /** Convierte un candidato en listing y lo marca aceptado. */
  adoptar(candidatos: Candidato[]): Promise<number>;
  marcarBuscado(productoId: string): Promise<void>;
  evaluacion(): Promise<Evaluacion>;
  registrarAlerta(datos: DatosAlerta): Promise<void>;
  actualizarWatch(
    watchId: string,
    estado: { ultimaAlertaEn: string | null; ultimoPuestoAlertado: number | null; armado: boolean }
  ): Promise<void>;
  destinatario(usuarioId: string): Promise<{ email: string | null; push: SuscripcionPush[] }>;
  registrarCorrida(r: ResumenCorrida): Promise<void>;
}
