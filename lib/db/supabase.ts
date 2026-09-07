import { clienteAdmin } from "../supabase/admin.ts";

/** El cliente ya viene apuntado al schema tracker. */
type ClienteTracker = ReturnType<typeof clienteAdmin>;
import { PARAMETROS_INICIALES, type Observacion, type Parametros } from "../tipos.ts";
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

/** Salto de precio que cuenta como "evento" para priorizar. */
const SALTO_EVENTO = 0.03;
const VENTANA_HISTORIAL_DIAS = 7;
const MAX_OBSERVACIONES = 5000;

const inicioDelDia = (): string => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
};

export class DepositoSupabase implements Deposito {
  constructor(private sb: ClienteTracker = clienteAdmin()) {}

  async planificacion() {
    const [listings, watches, observaciones, apagadas, corridas] = await Promise.all([
      this.sb
        .from("listing")
        .select(
          "id, usuario_id, producto_id, url, sku, vendedor, producto:producto(nombre, peso_kg), tienda:tienda(slug, adaptador, activa)"
        )
        .eq("activo", true),
      this.sb.from("watch").select("producto_id, objetivo_puesto").eq("activo", true).eq("regla", "R1"),
      this.sb
        .from("observacion")
        .select("listing_id, ts, puesto_py, stock, termina_en")
        .eq("estado", "ok")
        .gte("ts", new Date(Date.now() - VENTANA_HISTORIAL_DIAS * 864e5).toISOString())
        .order("ts", { ascending: false })
        .limit(MAX_OBSERVACIONES),
      this.sb.from("tienda_estado").select("apagada_hasta, tienda:tienda(slug)").gt("apagada_hasta", new Date().toISOString()),
      this.sb.from("corrida").select("leidas, fallidas").gte("inicio", inicioDelDia()),
    ]);

    for (const r of [listings, watches, observaciones, apagadas, corridas]) {
      if (r.error) throw new Error(`planificación: ${r.error.message}`);
    }

    const objetivos = new Map<string, number | null>(
      (watches.data ?? []).map((w: any) => [w.producto_id, w.objetivo_puesto])
    );

    // Agrupo en memoria: a escala personal son unos pocos miles de filas y
    // ahorra un RPC por listing.
    const porListing = new Map<
      string,
      { ts: string; puesto: number | null; stock: boolean | null; terminaEn: string | null }[]
    >();
    for (const o of (observaciones.data ?? []) as any[]) {
      const arr = porListing.get(o.listing_id) ?? [];
      arr.push({
        ts: o.ts,
        puesto: o.puesto_py === null ? null : Number(o.puesto_py),
        stock: o.stock,
        terminaEn: o.termina_en ?? null,
      });
      porListing.set(o.listing_id, arr);
    }

    const filas: FilaPlanificacion[] = (listings.data ?? [])
      .filter((l: any) => l.tienda?.activa)
      .map((l: any) => {
        const hist = porListing.get(l.id) ?? [];
        const ultima = hist[0] ?? null;
        const previa = hist[1] ?? null;
        const objetivo = objetivos.get(l.producto_id) ?? null;
        const puesto = ultima?.puesto ?? null;

        const evento =
          !!ultima &&
          !!previa &&
          (ultima.stock !== previa.stock ||
            (ultima.puesto !== null &&
              previa.puesto !== null &&
              previa.puesto > 0 &&
              Math.abs(ultima.puesto - previa.puesto) / previa.puesto > SALTO_EVENTO));

        return {
          listingId: l.id,
          usuarioId: l.usuario_id,
          productoId: l.producto_id,
          productoNombre: l.producto?.nombre ?? "",
          pesoKg: Number(l.producto?.peso_kg ?? 0),
          tiendaSlug: l.tienda.slug,
          adaptador: l.tienda.adaptador,
          url: l.url,
          sku: l.sku,
          vendedor: l.vendedor,
          ultimaLectura: ultima?.ts ?? null,
          terminaEn: ultima?.terminaEn ?? null,
          historial: hist.map((h) => h.puesto).filter((p): p is number => p !== null),
          distancia:
            puesto === null || objetivo === null || Number(objetivo) <= 0
              ? null
              : Math.max(0, (puesto - Number(objetivo)) / Number(objetivo)),
          evento,
        };
      });

    const usadasHoy = (corridas.data ?? []).reduce(
      (n: number, c: any) => n + (c.leidas ?? 0) + (c.fallidas ?? 0),
      0
    );

    return {
      filas,
      tiendasApagadas: new Set<string>((apagadas.data ?? []).map((a: any) => a.tienda?.slug).filter(Boolean)),
      usadasHoy,
    };
  }

  async parametrosDe(usuarioId: string): Promise<Parametros> {
    const { data, error } = await this.sb
      .from("parametros")
      .select("id, tarifa_kg, fee_fijo, tasa_imp, vigente_desde")
      .eq("usuario_id", usuarioId)
      .lte("vigente_desde", new Date().toISOString())
      .order("vigente_desde", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`parámetros: ${error.message}`);
    if (!data) return { ...PARAMETROS_INICIALES };
    return {
      id: data.id,
      tarifaKg: Number(data.tarifa_kg),
      feeFijo: Number(data.fee_fijo),
      tasaImp: Number(data.tasa_imp),
      vigenteDesde: data.vigente_desde,
    };
  }

  async guardarObservaciones(obs: Observacion[]): Promise<Observacion[]> {
    if (obs.length === 0) return [];
    const { data, error } = await this.sb
      .from("observacion")
      .insert(
        obs.map((o) => ({
          listing_id: o.listingId,
          usuario_id: o.usuarioId,
          ts: o.ts,
          precio: o.precio,
          envio_us: o.envioUs,
          moneda: o.moneda,
          stock: o.stock,
          origen: o.origen,
          estado: o.estado,
          tipo_venta: o.tipoVenta,
          termina_en: o.terminaEn,
          parametros_id: o.parametrosId,
          peso_kg: o.pesoKg,
          tarifa_kg: o.tarifaKg,
          fee_fijo: o.feeFijo,
          tasa_imp: o.tasaImp,
          crudo: o.crudo ?? null,
        }))
      )
      .select("id, listing_id, ts, puesto_py");
    if (error) throw new Error(`guardar observaciones: ${error.message}`);
    const ids = new Map((data ?? []).map((d: any) => [`${d.listing_id}|${d.ts}`, d]));
    return obs.map((o) => {
      const d = ids.get(`${o.listingId}|${o.ts}`);
      return { ...o, id: d?.id, puestoPy: d?.puesto_py === null || d === undefined ? null : Number(d.puesto_py) };
    });
  }

  async muestrasSalud(): Promise<MuestraTienda[]> {
    const { data, error } = await this.sb
      .from("observacion")
      .select("estado, listing:listing(tienda:tienda(slug))")
      .gte("ts", new Date(Date.now() - 3600_000).toISOString());
    if (error) throw new Error(`salud: ${error.message}`);
    const acc = new Map<string, MuestraTienda>();
    for (const o of (data ?? []) as any[]) {
      const slug = o.listing?.tienda?.slug;
      if (!slug) continue;
      const m = acc.get(slug) ?? { tiendaSlug: slug, total: 0, malas: 0 };
      m.total++;
      if (o.estado !== "ok") m.malas++;
      acc.set(slug, m);
    }
    return [...acc.values()];
  }

  async apagarTienda(slug: string, motivo: string, hasta: string): Promise<void> {
    const { data: tienda } = await this.sb.from("tienda").select("id").eq("slug", slug).single();
    if (!tienda) return;
    const { error } = await this.sb
      .from("tienda_estado")
      .upsert(
        { tienda_id: tienda.id, apagada_hasta: hasta, motivo, actualizado_en: new Date().toISOString() },
        { onConflict: "tienda_id" }
      );
    if (error) throw new Error(`apagar tienda: ${error.message}`);
  }

  async evaluacion(): Promise<Evaluacion> {
    const desde = new Date(Date.now() - 12 * 3600_000).toISOString();
    const [watches, listings, observaciones, alertas] = await Promise.all([
      this.sb
        .from("watch")
        .select(
          "id, usuario_id, producto_id, regla, objetivo_puesto, activo, ultima_alerta_en, ultimo_puesto_alertado, armado, producto:producto(nombre, peso_kg)"
        )
        .eq("activo", true)
        .eq("regla", "R1"),
      this.sb
        .from("listing")
        .select("id, producto_id, usuario_id, url, tienda:tienda(slug)")
        .eq("activo", true),
      this.sb.from("observacion").select("*").eq("estado", "ok").gte("ts", desde).order("ts", { ascending: false }),
      this.sb.from("alerta").select("usuario_id, producto_id, enviada_en").gte("enviada_en", inicioDelDia()),
    ]);
    for (const r of [watches, listings, observaciones, alertas]) {
      if (r.error) throw new Error(`evaluación: ${r.error.message}`);
    }

    const infoListing = new Map(
      (listings.data ?? []).map((l: any) => [l.id, { productoId: l.producto_id, url: l.url, tienda: l.tienda?.slug ?? "?" }])
    );

    const candidatas = new Map<string, CandidataEval[]>();
    const vistos = new Set<string>();
    for (const o of (observaciones.data ?? []) as any[]) {
      if (vistos.has(o.listing_id)) continue; // ya ordenado por ts desc: la primera es la última
      vistos.add(o.listing_id);
      const info = infoListing.get(o.listing_id);
      if (!info) continue;
      const c: CandidataEval = {
        productoId: info.productoId,
        tienda: info.tienda,
        url: info.url,
        observacion: {
          id: o.id,
          listingId: o.listing_id,
          usuarioId: o.usuario_id,
          ts: o.ts,
          precio: o.precio === null ? null : Number(o.precio),
          envioUs: o.envio_us === null ? null : Number(o.envio_us),
          moneda: o.moneda,
          stock: o.stock,
          origen: o.origen,
          estado: o.estado,
          tipoVenta: o.tipo_venta ?? "fijo",
          terminaEn: o.termina_en ?? null,
          parametrosId: o.parametros_id,
          pesoKg: Number(o.peso_kg),
          tarifaKg: Number(o.tarifa_kg),
          feeFijo: Number(o.fee_fijo),
          tasaImp: Number(o.tasa_imp),
          puestoPy: o.puesto_py === null ? null : Number(o.puesto_py),
        },
      };
      const arr = candidatas.get(info.productoId) ?? [];
      arr.push(c);
      candidatas.set(info.productoId, arr);
    }

    const alertasHoy = new Map<string, number>();
    const ultimaAlertaProducto = new Map<string, string>();
    for (const a of (alertas.data ?? []) as any[]) {
      alertasHoy.set(a.usuario_id, (alertasHoy.get(a.usuario_id) ?? 0) + 1);
      const prev = ultimaAlertaProducto.get(a.producto_id);
      if (!prev || a.enviada_en > prev) ultimaAlertaProducto.set(a.producto_id, a.enviada_en);
    }

    const lista: WatchConProducto[] = (watches.data ?? []).map((w: any) => ({
      id: w.id,
      usuarioId: w.usuario_id,
      productoId: w.producto_id,
      regla: w.regla,
      objetivoPuesto: w.objetivo_puesto === null ? null : Number(w.objetivo_puesto),
      activo: w.activo,
      ultimaAlertaEn: w.ultima_alerta_en,
      ultimoPuestoAlertado: w.ultimo_puesto_alertado === null ? null : Number(w.ultimo_puesto_alertado),
      armado: w.armado,
      productoNombre: w.producto?.nombre ?? "",
      pesoKg: Number(w.producto?.peso_kg ?? 0),
    }));

    return { watches: lista, candidatas, alertasHoy, ultimaAlertaProducto };
  }

  async registrarAlerta(d: DatosAlerta): Promise<void> {
    const { error } = await this.sb.from("alerta").insert({
      usuario_id: d.usuarioId,
      watch_id: d.watchId,
      producto_id: d.productoId,
      observacion_id: d.observacionId,
      regla: d.regla,
      puesto: d.puesto,
      desglose: d.desglose,
      canales: d.canales,
    });
    if (error) throw new Error(`registrar alerta: ${error.message}`);
  }

  async actualizarWatch(
    watchId: string,
    estado: { ultimaAlertaEn: string | null; ultimoPuestoAlertado: number | null; armado: boolean }
  ): Promise<void> {
    const { error } = await this.sb
      .from("watch")
      .update({
        ultima_alerta_en: estado.ultimaAlertaEn,
        ultimo_puesto_alertado: estado.ultimoPuestoAlertado,
        armado: estado.armado,
      })
      .eq("id", watchId);
    if (error) throw new Error(`actualizar watch: ${error.message}`);
  }

  async destinatario(usuarioId: string): Promise<{ email: string | null; push: SuscripcionPush[] }> {
    const [{ data: user }, subs] = await Promise.all([
      this.sb.auth.admin.getUserById(usuarioId),
      this.sb.from("suscripcion_push").select("endpoint, p256dh, auth").eq("usuario_id", usuarioId),
    ]);
    return {
      email: user?.user?.email ?? null,
      push: (subs.data ?? []) as SuscripcionPush[],
    };
  }

  async registrarCorrida(r: ResumenCorrida): Promise<void> {
    const { error } = await this.sb.from("corrida").insert({
      inicio: r.inicio,
      fin: r.fin,
      leidas: r.leidas,
      fallidas: r.fallidas,
      postergadas: r.postergadas,
      presupuesto: r.presupuesto,
      usadas_hoy: r.usadasHoy,
      detalle: r.detalle,
    });
    if (error) throw new Error(`registrar corrida: ${error.message}`);
  }
}
