import { createClient } from "@supabase/supabase-js";
import { env } from "../entorno.ts";

/**
 * Cliente del cron: service role, salta RLS. Solo se usa del lado del
 * servidor y nunca se expone al navegador.
 */
export function clienteAdmin() {
  const url = env("SUPABASE_URL") ?? env("NEXT_PUBLIC_SUPABASE_URL");
  const clave = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !clave) throw new Error("faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, clave, {
    db: { schema: "tracker" },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
