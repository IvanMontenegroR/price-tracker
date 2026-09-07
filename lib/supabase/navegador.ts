"use client";
import { createBrowserClient } from "@supabase/ssr";

function crear() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: "tracker" },
      // El magic link vuelve con el código en la URL y no hay ruta de
      // servidor que lo canjee: lo hace el cliente al cargar.
      auth: { detectSessionInUrl: true, flowType: "pkce" },
    }
  );
}

let cliente: ReturnType<typeof crear> | null = null;

/**
 * El único cliente del sitio estático: clave anon y RLS.
 *
 * No hay servidor propio, así que todo lo que ve la pantalla pasa por las
 * políticas de la base. La clave anon es pública por diseño; lo que protege
 * los datos es la RLS, no esconder la clave.
 */
export function clienteNavegador() {
  if (!cliente) cliente = crear();
  return cliente;
}

/** La base del sitio: "/price-tracker" en Pages, "" en local. */
export const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
