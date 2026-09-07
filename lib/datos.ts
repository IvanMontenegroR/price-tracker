"use client";

import { clienteNavegador } from "./supabase/navegador.ts";
import { PARAMETROS_INICIALES, type Parametros } from "./tipos.ts";

/**
 * Todo lo que la pantalla lee y escribe, contra la base directamente.
 *
 * No hay capa de servidor propia: la RLS es la que decide qué puedo ver y qué
 * puedo escribir. Cada consulta de acá corre con mi sesión, nunca con la
 * service_role —esa vive solo en la edge function del recolector—.
 */

export type FilaSeguimiento = {
  producto_id: string;
  nombre: string;
  marca: string | null;
  peso_kg: number;
  watch_id: string | null;
  objetivo_puesto: number | null;
  armado: boolean | null;
  tienda: string | null;
  tienda_nombre: string | null;
  url: string | null;
  condicion: string | null;
  precio: number | null;
  envio_us: number | null;
  stock: boolean | null;
  leido_en: string | null;
  puesto_py: number | null;
  tarifa_kg: number | null;
  fee_fijo: number | null;
  tasa_imp: number | null;
  distancia: number | null;
};

export type Tienda = { slug: string; nombre: string };

export type Corrida = {
  inicio: string;
  leidas: number;
  fallidas: number;
  presupuesto: number | null;
  usadas_hoy: number | null;
};

const numero = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

export async function cargarSeguimiento(): Promise<FilaSeguimiento[]> {
  const sb = clienteNavegador();
  const { data, error } = await sb.from("v_seguimiento").select("*").order("nombre");
  if (error) throw new Error(error.message);
  return (data ?? []).map((f: Record<string, unknown>) => ({
    ...f,
    peso_kg: Number(f.peso_kg),
    objetivo_puesto: numero(f.objetivo_puesto),
    precio: numero(f.precio),
    envio_us: numero(f.envio_us),
    puesto_py: numero(f.puesto_py),
    tarifa_kg: numero(f.tarifa_kg),
    fee_fijo: numero(f.fee_fijo),
    tasa_imp: numero(f.tasa_imp),
    distancia: numero(f.distancia),
  })) as FilaSeguimiento[];
}

export async function cargarTiendas(): Promise<Tienda[]> {
  const sb = clienteNavegador();
  const { data } = await sb.from("tienda").select("slug, nombre").eq("activa", true).order("nombre");
  return (data ?? []) as Tienda[];
}

export async function cargarUltimaCorrida(): Promise<Corrida | null> {
  const sb = clienteNavegador();
  const { data } = await sb
    .from("corrida")
    .select("inicio, leidas, fallidas, presupuesto, usadas_hoy")
    .order("inicio", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as Corrida) ?? null;
}

export async function cargarParametros(): Promise<Parametros & { historial: HistorialParametro[] }> {
  const sb = clienteNavegador();
  const { data } = await sb
    .from("parametros")
    .select("id, tarifa_kg, fee_fijo, tasa_imp, nota, vigente_desde")
    .order("vigente_desde", { ascending: false })
    .limit(10);

  const filas = (data ?? []) as HistorialParametro[];
  const actual = filas[0];
  return {
    ...(actual
      ? { id: actual.id, tarifaKg: Number(actual.tarifa_kg), feeFijo: Number(actual.fee_fijo), tasaImp: Number(actual.tasa_imp) }
      : PARAMETROS_INICIALES),
    historial: filas,
  };
}

export type HistorialParametro = {
  id: string;
  tarifa_kg: number;
  fee_fijo: number;
  tasa_imp: number;
  nota: string | null;
  vigente_desde: string;
};

async function usuarioId(): Promise<string> {
  const sb = clienteNavegador();
  const { data } = await sb.auth.getUser();
  if (!data.user) throw new Error("sin sesión");
  return data.user.id;
}

/**
 * Producto, watch y listing se crean juntos: por separado no sirven. Un
 * producto sin peso no tiene precio puesto, y uno sin listing no se lee nunca.
 */
export async function agregarSeguimiento(datos: {
  nombre: string;
  marca?: string | null;
  pesoKg: number;
  objetivo: number;
  tiendaSlug?: string;
  url?: string;
  sku?: string | null;
  condicion?: string;
}): Promise<void> {
  const sb = clienteNavegador();
  const uid = await usuarioId();

  const { data: producto, error: e1 } = await sb
    .from("producto")
    .insert({ usuario_id: uid, nombre: datos.nombre, marca: datos.marca ?? null, peso_kg: datos.pesoKg })
    .select("id")
    .single();
  if (e1) throw new Error(e1.message);

  const { error: e2 } = await sb
    .from("watch")
    .insert({ usuario_id: uid, producto_id: producto.id, regla: "R1", objetivo_puesto: datos.objetivo });
  if (e2) throw new Error(e2.message);

  if (datos.url && datos.tiendaSlug) {
    const { data: tienda } = await sb.from("tienda").select("id").eq("slug", datos.tiendaSlug).single();
    if (!tienda) throw new Error(`no conozco la tienda "${datos.tiendaSlug}"`);
    const { error: e3 } = await sb.from("listing").insert({
      usuario_id: uid,
      producto_id: producto.id,
      tienda_id: tienda.id,
      url: datos.url,
      sku: datos.sku ?? null,
      condicion: datos.condicion ?? "nuevo",
    });
    if (e3) throw new Error(e3.message);
  }
}

/** Cambiar el objetivo re-arma el watch: es una decisión nueva. */
export async function fijarObjetivo(watchId: string, objetivo: number): Promise<void> {
  const sb = clienteNavegador();
  const { error } = await sb
    .from("watch")
    .update({ objetivo_puesto: objetivo, armado: true, ultimo_puesto_alertado: null })
    .eq("id", watchId);
  if (error) throw new Error(error.message);
}

/**
 * Los parámetros no se editan: se versionan. Las observaciones viejas siguen
 * explicando su propio número con los valores que tenían encima.
 */
export async function guardarParametros(p: Parametros & { nota?: string }): Promise<void> {
  const sb = clienteNavegador();
  const uid = await usuarioId();
  const { error } = await sb.from("parametros").insert({
    usuario_id: uid,
    tarifa_kg: p.tarifaKg,
    fee_fijo: p.feeFijo,
    tasa_imp: p.tasaImp,
    nota: p.nota?.trim() || null,
  });
  if (error) throw new Error(error.message);
}

export async function guardarSuscripcionPush(sub: PushSubscriptionJSON): Promise<void> {
  const sb = clienteNavegador();
  const uid = await usuarioId();
  if (!sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) throw new Error("suscripción incompleta");
  const { error } = await sb.from("suscripcion_push").upsert(
    { usuario_id: uid, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    { onConflict: "endpoint" }
  );
  if (error) throw new Error(error.message);
}
