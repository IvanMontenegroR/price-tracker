import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Cliente para server components y server actions: RLS con mi sesión. */
export async function clienteServidor() {
  const store = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: "tracker" },
      cookies: {
        getAll: () => store.getAll(),
        setAll: (cs) => {
          try {
            cs.forEach(({ name, value, options }) => store.set(name, value, options));
          } catch {
            // Desde un server component no se pueden escribir cookies; el
            // middleware ya refrescó la sesión.
          }
        },
      },
    }
  );
}

export async function usuarioActual() {
  const sb = await clienteServidor();
  const { data } = await sb.auth.getUser();
  return data.user ?? null;
}
