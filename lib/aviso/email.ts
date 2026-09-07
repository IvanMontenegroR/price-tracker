import { Resend } from "resend";
import { asunto, htmlAlerta, textoAlerta, type ContenidoAlerta } from "./plantilla";

/**
 * Email: el canal de respaldo obligatorio. El push falla en silencio en iOS
 * —permiso revocado, PWA desinstalada, suscripción vencida— y una alerta que
 * no llega es peor que no tener alertas, porque uno cree que no hubo ofertas.
 */
export async function enviarEmail(a: string, c: ContenidoAlerta): Promise<string> {
  const clave = process.env.RESEND_API_KEY;
  const desde = process.env.EMAIL_DESDE;
  if (!clave || !desde) return "sin configurar (falta RESEND_API_KEY o EMAIL_DESDE)";

  const resend = new Resend(clave);
  const { data, error } = await resend.emails.send({
    from: desde,
    to: a,
    subject: asunto(c),
    text: textoAlerta(c),
    html: htmlAlerta(c),
  });
  if (error) return `error: ${error.message}`;
  return `ok ${data?.id ?? ""}`.trim();
}
