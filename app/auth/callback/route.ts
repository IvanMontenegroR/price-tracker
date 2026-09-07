import { NextResponse } from "next/server";
import { clienteServidor } from "@/lib/supabase/servidor";

export async function GET(pedido: Request) {
  const url = new URL(pedido.url);
  const code = url.searchParams.get("code");
  if (code) {
    const sb = await clienteServidor();
    await sb.auth.exchangeCodeForSession(code);
  }
  return NextResponse.redirect(new URL("/", url.origin));
}
