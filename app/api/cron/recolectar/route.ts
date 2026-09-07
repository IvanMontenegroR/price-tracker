import { NextResponse } from "next/server";
import { DepositoSupabase } from "@/lib/db/supabase";
import { correr } from "@/lib/recolector/correr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * El cron. Vercel lo llama cada 5 minutos con Authorization: Bearer $CRON_SECRET.
 * No hace falta que el intervalo coincida con la cadencia de nada: cada tick
 * planifica con el presupuesto que queda y lee lo que corresponde. Si el
 * presupuesto se agotó, el tick no hace nada y no cuesta nada.
 */
export async function GET(pedido: Request) {
  const secreto = process.env.CRON_SECRET;
  const cabecera = pedido.headers.get("authorization");
  if (secreto && cabecera !== `Bearer ${secreto}`) {
    return new NextResponse("no autorizado", { status: 401 });
  }

  try {
    const resumen = await correr({ deposito: new DepositoSupabase() });
    return NextResponse.json(resumen);
  } catch (e) {
    // El error viaja en la respuesta: sin esto, un cron que falla en silencio
    // parece un día sin ofertas.
    return NextResponse.json({ error: String((e as Error).message) }, { status: 500 });
  }
}
