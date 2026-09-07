import { NextResponse } from "next/server";
import { clienteServidor, usuarioActual } from "@/lib/supabase/servidor";

export async function POST(pedido: Request) {
  const usuario = await usuarioActual();
  if (!usuario) return new NextResponse("sin sesión", { status: 401 });

  const sub = (await pedido.json()) as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return new NextResponse("suscripción incompleta", { status: 400 });
  }

  const sb = await clienteServidor();
  const { error } = await sb.from("suscripcion_push").upsert(
    {
      usuario_id: usuario.id,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
    },
    { onConflict: "endpoint" }
  );
  if (error) return new NextResponse(error.message, { status: 500 });
  return NextResponse.json({ ok: true });
}
