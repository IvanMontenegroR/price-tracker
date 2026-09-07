import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Refresca la sesión en cada navegación; sin esto el magic link dura una carga. */
export async function middleware(pedido: NextRequest) {
  let respuesta = NextResponse.next({ request: pedido });

  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => pedido.cookies.getAll(),
        setAll: (cs) => {
          cs.forEach(({ name, value }) => pedido.cookies.set(name, value));
          respuesta = NextResponse.next({ request: pedido });
          cs.forEach(({ name, value, options }) => respuesta.cookies.set(name, value, options));
        },
      },
    }
  );
  await sb.auth.getUser();
  return respuesta;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icono.svg|sw.js|manifest.json|api/cron).*)"],
};
