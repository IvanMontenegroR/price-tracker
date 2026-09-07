import { adaptadorPara } from "../adaptadores/registro.ts";
import type { Adaptador } from "../adaptadores/tipos.ts";
import { enviarEmail } from "../aviso/email.ts";
import { enviarPush } from "../aviso/push.ts";
import type { ContenidoAlerta } from "../aviso/plantilla.ts";
import type { Deposito, FilaPlanificacion, ResumenCorrida, SuscripcionPush } from "../db/deposito.ts";
import { envNumero } from "../entorno.ts";
import { mediana } from "../estadistica.ts";
import { evaluarR1, type Candidata } from "../reglas/r1.ts";
import type { Observacion, Parametros } from "../tipos.ts";
import { planificar, tierDe, type CandidataLectura } from "./presupuesto.ts";
import { APAGADO_MINUTOS, clasificar, diagnosticar } from "./salud.ts";

/**
 * Una corrida del cron: planifica con el presupuesto, lee, guarda, revisa la
 * salud de las tiendas, evalúa R1 y avisa. Todo lo de afuera —base, tiendas,
 * envío— entra por parámetro, así que la corrida entera se puede probar en
 * memoria y sin red.
 */

export type Avisador = (
  destino: { email: string | null; push: SuscripcionPush[] },
  contenido: ContenidoAlerta
) => Promise<Record<string, string>>;

export const avisadorReal: Avisador = async (destino, contenido) => {
  const canales: Record<string, string> = {};
  canales.email = destino.email ? await enviarEmail(destino.email, contenido) : "sin email";
  const push = await enviarPush(destino.push, contenido);
  canales.push = push.detalle;
  return canales;
};

export type OpcionesCorrida = {
  deposito: Deposito;
  adaptadores?: (clave: string) => Adaptador;
  presupuestoDiario?: number;
  maxPorTick?: number;
  concurrencia?: number;
  ahora?: Date;
  avisar?: Avisador;
};

async function enTanda<T, R>(xs: readonly T[], n: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const salida: R[] = new Array(xs.length);
  let i = 0;
  const obreros = Array.from({ length: Math.min(n, xs.length) }, async () => {
    while (i < xs.length) {
      const j = i++;
      salida[j] = await f(xs[j]);
    }
  });
  await Promise.all(obreros);
  return salida;
}

export type Resultado = ResumenCorrida & { alertas: number; motivos: Record<string, string> };

export async function correr(op: OpcionesCorrida): Promise<Resultado> {
  const ahora = op.ahora ?? new Date();
  const inicio = ahora.toISOString();
  const deposito = op.deposito;
  const buscarAdaptador = op.adaptadores ?? adaptadorPara;
  const avisar = op.avisar ?? avisadorReal;
  const presupuestoDiario = op.presupuestoDiario ?? envNumero("PRESUPUESTO_DIARIO", 2000);
  const maxPorTick = op.maxPorTick ?? envNumero("MAX_POR_TICK", 40);

  const { filas, tiendasApagadas, usadasHoy } = await deposito.planificacion();
  const porListing = new Map(filas.map((f) => [f.listingId, f]));

  const candidatas: CandidataLectura[] = filas.map((f) => ({
    listingId: f.listingId,
    tiendaSlug: f.tiendaSlug,
    terminaEn: f.terminaEn,
    distancia: f.distancia,
    historial: f.historial,
    ultimaLectura: f.ultimaLectura,
    evento: f.evento,
  }));

  const plan = planificar(candidatas, {
    ahora,
    presupuestoDiario,
    usadasHoy,
    maxPorTick,
    tiendasApagadas,
  });

  // Los parámetros se leen una vez por usuario y se congelan en cada
  // observación: si mañana cambio la tarifa por kilo, lo de hoy sigue
  // explicando su propio número.
  const cacheParametros = new Map<string, Parametros>();
  const parametrosDe = async (usuarioId: string): Promise<Parametros> => {
    const y = cacheParametros.get(usuarioId);
    if (y) return y;
    const p = await deposito.parametrosDe(usuarioId);
    cacheParametros.set(usuarioId, p);
    return p;
  };

  const errores: Record<string, string> = {};
  let fallidas = 0;

  const observaciones = await enTanda(plan.aLeer, op.concurrencia ?? 4, async (x): Promise<Observacion | null> => {
    const fila = porListing.get(x.candidata.listingId) as FilaPlanificacion;
    const parametros = await parametrosDe(fila.usuarioId);
    const base = {
      listingId: fila.listingId,
      usuarioId: fila.usuarioId,
      pesoKg: fila.pesoKg,
      parametrosId: parametros.id ?? null,
      tarifaKg: parametros.tarifaKg,
      feeFijo: parametros.feeFijo,
      tasaImp: parametros.tasaImp,
    };

    let adaptador: Adaptador;
    try {
      adaptador = buscarAdaptador(fila.adaptador);
    } catch (e) {
      errores[fila.tiendaSlug] = String((e as Error).message);
      return null;
    }
    if (!adaptador.disponible) {
      // Amazon cae acá: está registrado, no implementado, y no rompe la corrida.
      errores[fila.tiendaSlug] = "adaptador no disponible";
      return null;
    }

    try {
      const lectura = await adaptador.leer({ url: fila.url, sku: fila.sku, vendedor: fila.vendedor });
      const estado = clasificar(lectura.precio, mediana(fila.historial));
      if (estado !== "ok") fallidas++;
      return {
        ...base,
        // El sello de tiempo es el del recolector, no el del adaptador: un
        // feed puede traer un precio de anoche, y lo que ordena el historial
        // es cuándo lo leí yo. El ts de la fuente queda en crudo.
        ts: ahora.toISOString(),
        precio: lectura.precio,
        envioUs: lectura.envio,
        moneda: lectura.moneda,
        stock: lectura.stock,
        origen: adaptador.origen,
        estado,
        tipoVenta: lectura.tipoVenta ?? "fijo",
        terminaEn: lectura.terminaEn ?? null,
        crudo: { fuente: lectura.crudo ?? null, tsFuente: lectura.ts },
      };
    } catch (e) {
      fallidas++;
      errores[`${fila.tiendaSlug}:${fila.listingId.slice(0, 8)}`] = String((e as Error).message);
      // Una lectura que falló también es un dato: es lo que alimenta el
      // circuit breaker. Se guarda como nula, no se descarta.
      return {
        ...base,
        ts: ahora.toISOString(),
        precio: null,
        envioUs: null,
        moneda: "USD",
        stock: null,
        origen: adaptador.origen,
        estado: "nula",
        tipoVenta: "fijo",
        terminaEn: null,
        crudo: { error: String((e as Error).message) },
      };
    }
  });

  const guardadas = await deposito.guardarObservaciones(
    observaciones.filter((o): o is Observacion => o !== null)
  );

  // Circuit breaker: un adaptador que devuelve basura sale de circulación solo.
  const apagadas: string[] = [];
  for (const muestra of await deposito.muestrasSalud()) {
    const d = diagnosticar(muestra);
    if (d.apagar) {
      const hasta = new Date(ahora.getTime() + APAGADO_MINUTOS * 60_000).toISOString();
      await deposito.apagarTienda(d.tiendaSlug, d.motivo, hasta);
      apagadas.push(`${d.tiendaSlug}: ${d.motivo}`);
    }
  }

  // ── Reglas y aviso ────────────────────────────────────────────────────────
  const evaluacion = await deposito.evaluacion();
  const motivos: Record<string, string> = {};
  let alertas = 0;

  for (const watch of evaluacion.watches) {
    const cands: Candidata[] = (evaluacion.candidatas.get(watch.productoId) ?? []).map((c) => ({
      observacion: c.observacion,
      tienda: c.tienda,
      url: c.url,
    }));

    const parametros = await parametrosDe(watch.usuarioId);
    const r = evaluarR1(watch, cands, parametros, {
      ahora,
      alertasHoy: evaluacion.alertasHoy.get(watch.usuarioId) ?? 0,
      ultimaAlertaProducto: evaluacion.ultimaAlertaProducto.get(watch.productoId) ?? null,
    });

    if (!r.avisa) {
      motivos[watch.productoNombre] = r.motivo;
      continue;
    }

    const contenido: ContenidoAlerta = {
      producto: watch.productoNombre,
      tienda: r.candidata.tienda,
      url: r.candidata.url,
      objetivo: watch.objetivoPuesto,
      desglose: r.desglose,
      regla: watch.regla,
    };

    const destino = await deposito.destinatario(watch.usuarioId);
    const canales = await avisar(destino, contenido);

    await deposito.registrarAlerta({
      usuarioId: watch.usuarioId,
      watchId: watch.id,
      productoId: watch.productoId,
      observacionId: r.candidata.observacion.id ?? null,
      regla: watch.regla,
      puesto: r.desglose.puesto,
      desglose: { ...r.desglose, tienda: r.candidata.tienda, url: r.candidata.url, producto: watch.productoNombre },
      canales,
    });
    await deposito.actualizarWatch(watch.id, r.nuevoEstado);

    // El techo diario y el cooldown tienen que valer dentro de la misma corrida.
    evaluacion.alertasHoy.set(watch.usuarioId, (evaluacion.alertasHoy.get(watch.usuarioId) ?? 0) + 1);
    evaluacion.ultimaAlertaProducto.set(watch.productoId, ahora.toISOString());
    motivos[watch.productoNombre] = `alerta enviada: US$ ${r.desglose.puesto.toFixed(2)}`;
    alertas++;
  }

  const resumen: Resultado = {
    inicio,
    fin: new Date().toISOString(),
    leidas: guardadas.length,
    fallidas,
    postergadas: plan.postergadas,
    presupuesto: presupuestoDiario,
    usadasHoy: usadasHoy + plan.aLeer.length,
    alertas,
    motivos,
    detalle: {
      tiers: plan.aLeer.reduce<Record<string, number>>((acc, x) => {
        acc[x.tier] = (acc[x.tier] ?? 0) + 1;
        return acc;
      }, {}),
      soloCalientes: plan.soloCalientes,
      apagadas,
      errores,
      alertas,
    },
  };

  await deposito.registrarCorrida(resumen);
  return resumen;
}

export { tierDe };
