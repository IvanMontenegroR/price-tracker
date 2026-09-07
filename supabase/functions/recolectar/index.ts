import { cronAutorizado } from "../../../lib/db/autorizacion.ts";
import { DepositoSupabase } from "../../../lib/db/supabase.ts";
import { correr } from "../../../lib/recolector/correr.ts";

/**
 * El cron.
 *
 * Vive acá y no en un servidor propio porque es el único lugar donde la
 * service_role puede estar sin pasar por el navegador: el sitio es estático.
 * Lo dispara pg_cron cada cinco minutos con el secreto de Vault en la
 * cabecera, y la autorización se resuelve contra la base —ver autorizacion.ts,
 * que explica por qué no es una variable de entorno—.
 *
 * No importa que los disparos no sean exactos. El planificador no asume ticks
 * parejos: en cada corrida mira qué está vencido según su cadencia y cuánto
 * presupuesto queda. Un tick que llega tarde lee más cosas; uno que se pierde
 * no rompe nada.
 */
Deno.serve(async (pedido: Request) => {
  if (!(await cronAutorizado(pedido.headers.get("x-cron-secreto")))) {
    return new Response("no autorizado", { status: 401 });
  }

  try {
    const resumen = await correr({ deposito: new DepositoSupabase() });
    return Response.json(resumen);
  } catch (e) {
    // El error viaja en la respuesta y queda en los logs de la función: sin
    // esto, un cron que falla en silencio parece un día sin ofertas.
    console.error(e);
    return Response.json({ error: String((e as Error).message) }, { status: 500 });
  }
});
