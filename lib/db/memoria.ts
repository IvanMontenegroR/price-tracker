import { PARAMETROS_INICIALES, type Observacion, type Parametros } from "../tipos.ts";
import type { Candidato, ProductoABuscar } from "../descubrimiento/descubrir.ts";
import type { MuestraTienda } from "../recolector/salud.ts";
import type {
  CandidataEval,
  DatosAlerta,
  Deposito,
  Evaluacion,
  FilaPlanificacion,
  ResumenCorrida,
  SuscripcionPush,
  WatchConProducto,
} from "./deposito.ts";

/**
 * Depósito en memoria. Lo usan las pruebas y la corrida de humo: el motor
 * completo —planificación, lectura, costo, reglas, anti-ruido— se puede correr
 * sin base y sin red, que es la única forma de que las pruebas sean rápidas y
 * deterministas.
 */
export class DepositoMemoria implements Deposito {
  /**
   * Reloj inyectable: la simulación de un día corre en tiempo comprimido y
   * las ventanas (12 h de frescura, cooldown, salud de la última hora) tienen
   * que medirse contra ese reloj y no contra el del sistema.
   */
  reloj: () => Date = () => new Date();
  parametros: Parametros = { ...PARAMETROS_INICIALES, id: "param-0" };
  filas: FilaPlanificacion[] = [];
  tiendasApagadas = new Set<string>();
  usadasHoy = 0;
  observaciones: Observacion[] = [];
  watches: WatchConProducto[] = [];
  alertas: { alerta: DatosAlerta; en: string }[] = [];
  corridas: ResumenCorrida[] = [];
  apagados: { slug: string; motivo: string; hasta: string }[] = [];
  email: string | null = "yo@example.com";
  push: SuscripcionPush[] = [];
  private secuencia = 1;

  async planificacion() {
    // El historial se recalcula desde lo ya observado: así la segunda corrida
    // de una simulación ve lo que dejó la primera.
    const filas = this.filas.map((f) => {
      const propias = this.observaciones
        .filter((o) => o.listingId === f.listingId && o.estado === "ok")
        .sort((a, b) => (a.ts < b.ts ? 1 : -1));
      return {
        ...f,
        ultimaLectura: propias[0]?.ts ?? f.ultimaLectura,
        terminaEn: propias[0]?.terminaEn ?? f.terminaEn,
        historial: propias.map((o) => o.puestoPy).filter((p): p is number => typeof p === "number"),
      };
    });
    return { filas, tiendasApagadas: this.tiendasApagadas, usadasHoy: this.usadasHoy };
  }

  async parametrosDe(): Promise<Parametros> {
    return this.parametros;
  }

  async guardarObservaciones(obs: Observacion[]): Promise<Observacion[]> {
    const guardadas = obs.map((o) => ({
      ...o,
      id: this.secuencia++,
      // Réplica de la columna generada de Postgres.
      puestoPy:
        o.precio === null
          ? null
          : Math.round(
              (o.precio + (o.envioUs ?? 0) + o.pesoKg * o.tarifaKg + o.feeFijo + o.precio * o.tasaImp) * 100
            ) / 100,
    }));
    this.observaciones.push(...guardadas);
    return guardadas;
  }

  async muestrasSalud(): Promise<MuestraTienda[]> {
    const desde = this.reloj().getTime() - 3600_000;
    const porListing = new Map(this.filas.map((f) => [f.listingId, f.tiendaSlug]));
    const acc = new Map<string, MuestraTienda>();
    for (const o of this.observaciones) {
      if (new Date(o.ts).getTime() < desde) continue;
      const slug = porListing.get(o.listingId);
      if (!slug) continue;
      const m = acc.get(slug) ?? { tiendaSlug: slug, total: 0, malas: 0 };
      m.total++;
      if (o.estado !== "ok") m.malas++;
      acc.set(slug, m);
    }
    return [...acc.values()];
  }

  async apagarTienda(slug: string, motivo: string, hasta: string) {
    this.apagados.push({ slug, motivo, hasta });
    this.tiendasApagadas.add(slug);
  }

  async actualizarImagen(listingId: string, imagen: string) {
    const f = this.filas.find((x) => x.listingId === listingId);
    if (f) f.imagenUrl = imagen;
  }

  productosBuscables: ProductoABuscar[] = [];
  candidatos: Candidato[] = [];
  adoptados: Candidato[] = [];
  buscados: string[] = [];

  async productosParaBuscar(_horas: number, limite: number) {
    return this.productosBuscables.slice(0, limite);
  }

  async guardarCandidatos(candidatos: Candidato[]) {
    this.candidatos.push(...candidatos);
  }

  async adoptar(candidatos: Candidato[]) {
    this.adoptados.push(...candidatos);
    return candidatos.length;
  }

  async marcarBuscado(productoId: string) {
    this.buscados.push(productoId);
  }

  async evaluacion(): Promise<Evaluacion> {
    const desde = this.reloj().getTime() - 12 * 3600_000;
    const info = new Map(this.filas.map((f) => [f.listingId, f]));
    const candidatas = new Map<string, CandidataEval[]>();
    const vistos = new Set<string>();
    for (const o of [...this.observaciones].sort((a, b) => (a.ts < b.ts ? 1 : -1))) {
      if (o.estado !== "ok" || new Date(o.ts).getTime() < desde) continue;
      if (vistos.has(o.listingId)) continue;
      vistos.add(o.listingId);
      const f = info.get(o.listingId);
      if (!f) continue;
      const arr = candidatas.get(f.productoId) ?? [];
      arr.push({ productoId: f.productoId, tienda: f.tiendaSlug, url: f.url, observacion: o });
      candidatas.set(f.productoId, arr);
    }

    const hoy = new Date(this.reloj());
    hoy.setUTCHours(0, 0, 0, 0);
    const alertasHoy = new Map<string, number>();
    const ultimaAlertaProducto = new Map<string, string>();
    for (const { alerta, en } of this.alertas) {
      if (new Date(en) >= hoy) {
        alertasHoy.set(alerta.usuarioId, (alertasHoy.get(alerta.usuarioId) ?? 0) + 1);
      }
      const previa = ultimaAlertaProducto.get(alerta.productoId);
      if (!previa || en > previa) ultimaAlertaProducto.set(alerta.productoId, en);
    }
    return { watches: this.watches, candidatas, alertasHoy, ultimaAlertaProducto };
  }

  async registrarAlerta(d: DatosAlerta) {
    this.alertas.push({ alerta: d, en: this.reloj().toISOString() });
  }

  async actualizarWatch(
    watchId: string,
    estado: { ultimaAlertaEn: string | null; ultimoPuestoAlertado: number | null; armado: boolean }
  ) {
    const w = this.watches.find((x) => x.id === watchId);
    if (w) Object.assign(w, estado);
  }

  async destinatario() {
    return { email: this.email, push: this.push };
  }

  async registrarCorrida(r: ResumenCorrida) {
    this.corridas.push(r);
    this.usadasHoy += r.leidas + r.fallidas;
  }
}
