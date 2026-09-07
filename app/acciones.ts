"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { clienteServidor, usuarioActual } from "@/lib/supabase/servidor";

const numero = (v: FormDataEntryValue | null): number | null => {
  if (v === null || String(v).trim() === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/**
 * Agregar algo que quiero seguir: producto (con su peso), el listing donde
 * mirarlo y el objetivo. Las tres cosas juntas porque por separado no sirven:
 * un producto sin peso no tiene precio puesto y un producto sin listing no
 * se lee nunca.
 */
export async function agregarSeguimiento(datos: FormData) {
  const usuario = await usuarioActual();
  if (!usuario) redirect("/entrar");
  const sb = await clienteServidor();

  const nombre = String(datos.get("nombre") ?? "").trim();
  const pesoKg = numero(datos.get("peso_kg"));
  const objetivo = numero(datos.get("objetivo"));
  const url = String(datos.get("url") ?? "").trim();
  const tiendaSlug = String(datos.get("tienda") ?? "").trim();
  const sku = String(datos.get("sku") ?? "").trim() || null;

  if (!nombre || !pesoKg || pesoKg <= 0) return { error: "Falta el nombre o el peso en kg." };
  if (!objetivo) return { error: "Falta el objetivo: sin objetivo, R1 no puede disparar." };

  const { data: producto, error: e1 } = await sb
    .from("producto")
    .insert({ usuario_id: usuario.id, nombre, peso_kg: pesoKg, marca: String(datos.get("marca") ?? "") || null })
    .select("id")
    .single();
  if (e1) return { error: e1.message };

  const { error: e2 } = await sb.from("watch").insert({
    usuario_id: usuario.id,
    producto_id: producto.id,
    regla: "R1",
    objetivo_puesto: objetivo,
  });
  if (e2) return { error: e2.message };

  if (url && tiendaSlug) {
    const { data: tienda } = await sb.from("tienda").select("id").eq("slug", tiendaSlug).single();
    if (tienda) {
      await sb.from("listing").insert({
        usuario_id: usuario.id,
        producto_id: producto.id,
        tienda_id: tienda.id,
        url,
        sku,
        condicion: String(datos.get("condicion") ?? "nuevo"),
      });
    }
  }

  revalidatePath("/");
  return { ok: true };
}

export async function agregarListing(datos: FormData) {
  const usuario = await usuarioActual();
  if (!usuario) redirect("/entrar");
  const sb = await clienteServidor();

  const productoId = String(datos.get("producto_id") ?? "");
  const url = String(datos.get("url") ?? "").trim();
  const tiendaSlug = String(datos.get("tienda") ?? "").trim();
  if (!productoId || !url || !tiendaSlug) return { error: "Faltan datos del listing." };

  const { data: tienda } = await sb.from("tienda").select("id").eq("slug", tiendaSlug).single();
  if (!tienda) return { error: `No conozco la tienda "${tiendaSlug}".` };

  const { error } = await sb.from("listing").insert({
    usuario_id: usuario.id,
    producto_id: productoId,
    tienda_id: tienda.id,
    url,
    sku: String(datos.get("sku") ?? "").trim() || null,
    condicion: String(datos.get("condicion") ?? "nuevo"),
  });
  if (error) return { error: error.message };
  revalidatePath("/");
  return { ok: true };
}

/** Cambiar el objetivo re-arma el watch: es una decisión nueva. */
export async function fijarObjetivo(datos: FormData) {
  const usuario = await usuarioActual();
  if (!usuario) redirect("/entrar");
  const sb = await clienteServidor();

  const watchId = String(datos.get("watch_id") ?? "");
  const objetivo = numero(datos.get("objetivo"));
  if (!watchId || !objetivo) return { error: "Objetivo inválido." };

  const { error } = await sb
    .from("watch")
    .update({ objetivo_puesto: objetivo, armado: true, ultimo_puesto_alertado: null })
    .eq("id", watchId);
  if (error) return { error: error.message };
  revalidatePath("/");
  return { ok: true };
}

/**
 * Los parámetros no se editan: se versionan. Una fila nueva con vigente_desde
 * de ahora. Las observaciones viejas siguen explicando su propio número con
 * los valores que tenían encima.
 */
export async function guardarParametros(datos: FormData) {
  const usuario = await usuarioActual();
  if (!usuario) redirect("/entrar");
  const sb = await clienteServidor();

  const tarifaKg = numero(datos.get("tarifa_kg"));
  const feeFijo = numero(datos.get("fee_fijo"));
  const tasaImp = numero(datos.get("tasa_imp"));
  if (tarifaKg === null || feeFijo === null || tasaImp === null) return { error: "Parámetros incompletos." };
  if (tasaImp >= 1) return { error: "La tasa va en fracción: 0.15, no 15." };

  const { error } = await sb.from("parametros").insert({
    usuario_id: usuario.id,
    tarifa_kg: tarifaKg,
    fee_fijo: feeFijo,
    tasa_imp: tasaImp,
    nota: String(datos.get("nota") ?? "").trim() || null,
  });
  if (error) return { error: error.message };
  revalidatePath("/");
  revalidatePath("/parametros");
  return { ok: true };
}

export async function borrarProducto(datos: FormData) {
  const usuario = await usuarioActual();
  if (!usuario) redirect("/entrar");
  const sb = await clienteServidor();
  const { error } = await sb.from("producto").delete().eq("id", String(datos.get("producto_id") ?? ""));
  if (error) return { error: error.message };
  revalidatePath("/");
  return { ok: true };
}

export async function salir() {
  const sb = await clienteServidor();
  await sb.auth.signOut();
  redirect("/entrar");
}
