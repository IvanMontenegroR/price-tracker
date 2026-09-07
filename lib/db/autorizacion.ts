import { clienteAdmin } from "../supabase/admin.ts";

/**
 * Autoriza el disparo del cron contra el secreto guardado en Vault.
 *
 * La comparación se hace en la base y no contra una variable de entorno de la
 * función, por dos razones: no hay que cargar el mismo secreto en dos lados
 * —y que se desincronicen es cuestión de tiempo—, y sobre todo esto **falla
 * cerrado**: si el secreto no existe o la consulta falla, no autoriza. Con una
 * variable de entorno, olvidarse de cargarla dejaba el endpoint abierto a
 * cualquiera que supiera la URL.
 */
export async function cronAutorizado(token: string | null): Promise<boolean> {
  if (!token) return false;
  try {
    const { data, error } = await clienteAdmin().rpc("cron_autorizado", { token });
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}
