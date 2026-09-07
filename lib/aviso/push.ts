import webpush from "web-push";
import type { SuscripcionPush } from "../db/deposito";
import { asunto, type ContenidoAlerta } from "./plantilla";

/**
 * Web Push. En iOS solo funciona si la app está instalada en la pantalla de
 * inicio, y las suscripciones se caen solas. Por eso el email va siempre y
 * una suscripción muerta (404/410) se borra en vez de reintentarse.
 */
function configurar(): boolean {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const sujeto = process.env.VAPID_SUBJECT ?? "mailto:nadie@example.com";
  if (!pub || !priv) return false;
  webpush.setVapidDetails(sujeto, pub, priv);
  return true;
}

export type ResultadoPush = { enviados: number; muertas: string[]; detalle: string };

export async function enviarPush(subs: SuscripcionPush[], c: ContenidoAlerta): Promise<ResultadoPush> {
  if (subs.length === 0) return { enviados: 0, muertas: [], detalle: "sin suscripciones" };
  if (!configurar()) return { enviados: 0, muertas: [], detalle: "sin configurar (faltan claves VAPID)" };

  const cuerpo = JSON.stringify({
    titulo: asunto(c),
    cuerpo: `Etiqueta US$ ${c.desglose.etiqueta.toFixed(2)} + envío ${c.desglose.envioUs.toFixed(2)} + flete ${c.desglose.flete.toFixed(2)} + fee ${c.desglose.fee.toFixed(2)} + imp. ${c.desglose.impuesto.toFixed(2)}`,
    url: c.url,
  });

  const muertas: string[] = [];
  let enviados = 0;
  const errores: string[] = [];

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          cuerpo
        );
        enviados++;
      } catch (e: unknown) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) muertas.push(s.endpoint);
        else errores.push(String((e as Error).message ?? e));
      }
    })
  );

  return {
    enviados,
    muertas,
    detalle: `${enviados}/${subs.length} enviados${errores.length ? `; errores: ${errores.join("; ")}` : ""}`,
  };
}
