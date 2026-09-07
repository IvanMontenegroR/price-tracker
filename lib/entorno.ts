/**
 * Una sola forma de leer variables de entorno.
 *
 * El mismo motor corre en tres runtimes: Node (los scripts), Deno (la edge
 * function que hace de cron) y el navegador (donde no hay ninguna de las dos).
 * Sin esto, `process.env` explota en Deno y `Deno.env` no existe en Node.
 */
type ConDeno = { Deno?: { env: { get(k: string): string | undefined } } };

export function env(clave: string): string | undefined {
  const deno = (globalThis as unknown as ConDeno).Deno;
  if (deno?.env) {
    try {
      return deno.env.get(clave);
    } catch {
      // Sin permiso de entorno: se trata como no configurada.
      return undefined;
    }
  }
  if (typeof process !== "undefined" && process.env) return process.env[clave];
  return undefined;
}

export function envNumero(clave: string, porDefecto: number): number {
  const v = env(clave);
  if (v === undefined || v.trim() === "") return porDefecto;
  const n = Number(v);
  return Number.isFinite(n) ? n : porDefecto;
}
