import { redirect } from "next/navigation";
import { guardarParametros } from "../acciones";
import { calcularPuesto } from "@/lib/costo";
import { DesgloseTabla } from "@/components/Desglose";
import { FormaAccion } from "@/components/FormaAccion";
import { PARAMETROS_INICIALES } from "@/lib/tipos";
import { clienteServidor, usuarioActual } from "@/lib/supabase/servidor";

export const dynamic = "force-dynamic";

const campo =
  "w-full rounded-md border border-[color:var(--color-borde)] bg-[color:var(--color-fondo)] px-2.5 py-1.5 text-sm numero";

export default async function Parametros() {
  const usuario = await usuarioActual();
  if (!usuario) redirect("/entrar");
  const sb = await clienteServidor();

  const { data: versiones } = await sb
    .from("parametros")
    .select("tarifa_kg, fee_fijo, tasa_imp, nota, vigente_desde")
    .order("vigente_desde", { ascending: false })
    .limit(10);

  const actual = versiones?.[0]
    ? {
        tarifaKg: Number(versiones[0].tarifa_kg),
        feeFijo: Number(versiones[0].fee_fijo),
        tasaImp: Number(versiones[0].tasa_imp),
      }
    : PARAMETROS_INICIALES;

  // Ejemplo fijo para ver el efecto del cambio antes de guardarlo.
  const ejemplo = calcularPuesto({ precio: 999, envioUs: 0, pesoKg: 0.4 }, actual);

  return (
    <main>
      <a href="/" className="text-xs text-[color:var(--color-tenue)] underline underline-offset-2">← lo que sigo</a>
      <h1 className="mt-3 text-xl font-semibold">Parámetros de costo</h1>
      <p className="mt-1 max-w-prose text-sm text-[color:var(--color-tenue)]">
        Se versionan, no se pisan: cada observación guarda los valores con los que se calculó, así el
        histórico se puede recalcular con los de hoy y también leer con los de entonces. Calibralos
        contra facturas reales del courier.
      </p>

      <FormaAccion accion={guardarParametros} className="mt-6 grid max-w-md grid-cols-3 gap-3">
        <label className="block">
          <span className="text-xs text-[color:var(--color-tenue)]">US$ por kg</span>
          <input name="tarifa_kg" defaultValue={actual.tarifaKg} inputMode="decimal" className={campo} />
        </label>
        <label className="block">
          <span className="text-xs text-[color:var(--color-tenue)]">Fee fijo US$</span>
          <input name="fee_fijo" defaultValue={actual.feeFijo} inputMode="decimal" className={campo} />
        </label>
        <label className="block">
          <span className="text-xs text-[color:var(--color-tenue)]">Tasa (0.15 = 15%)</span>
          <input name="tasa_imp" defaultValue={actual.tasaImp} inputMode="decimal" className={campo} />
        </label>
        <label className="col-span-3 block">
          <span className="text-xs text-[color:var(--color-tenue)]">Nota (contra qué factura lo calibraste)</span>
          <input name="nota" placeholder="factura Aeropaq 04/09, 1.2 kg" className={campo.replace(" numero", "")} />
        </label>
        <button className="col-span-3 justify-self-start rounded-md bg-[color:var(--color-verde)] px-3 py-1.5 text-sm font-medium text-black">
          Guardar versión nueva
        </button>
      </FormaAccion>

      <section className="mt-8 max-w-sm">
        <h2 className="text-sm font-medium">Con estos valores</h2>
        <p className="mb-2 text-xs text-[color:var(--color-tenue)]">Un artículo de US$ 999 y 0,4 kg:</p>
        <DesgloseTabla d={ejemplo} />
      </section>

      {versiones && versiones.length > 1 && (
        <section className="mt-8">
          <h2 className="text-sm font-medium">Historial</h2>
          <ul className="mt-2 space-y-1 text-xs text-[color:var(--color-tenue)]">
            {versiones.map((v) => (
              <li key={v.vigente_desde} className="numero">
                {new Date(v.vigente_desde).toLocaleDateString("es-PY")} · US$ {Number(v.tarifa_kg)}/kg · US${" "}
                {Number(v.fee_fijo)} · {(Number(v.tasa_imp) * 100).toFixed(0)}%
                {v.nota ? ` — ${v.nota}` : ""}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
