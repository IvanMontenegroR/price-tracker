import { redirect } from "next/navigation";
import { Agregar } from "@/components/Agregar";
import { BotonPush } from "@/components/BotonPush";
import { DesgloseTabla } from "@/components/Desglose";
import { FormaAccion } from "@/components/FormaAccion";
import { fijarObjetivo, salir } from "./acciones";
import { calcularPuesto } from "@/lib/costo";
import { tierDe } from "@/lib/recolector/presupuesto";
import { clienteServidor, usuarioActual } from "@/lib/supabase/servidor";

export const dynamic = "force-dynamic";

type Fila = {
  producto_id: string;
  nombre: string;
  marca: string | null;
  peso_kg: number;
  watch_id: string | null;
  objetivo_puesto: number | null;
  armado: boolean | null;
  listing_id: string | null;
  tienda: string | null;
  tienda_nombre: string | null;
  url: string | null;
  condicion: string | null;
  precio: number | null;
  envio_us: number | null;
  stock: boolean | null;
  leido_en: string | null;
  puesto_py: number | null;
  tarifa_kg: number | null;
  fee_fijo: number | null;
  tasa_imp: number | null;
  distancia: number | null;
};

const usd = (n: number) => `US$ ${n.toFixed(2)}`;

function haceCuanto(ts: string | null): string {
  if (!ts) return "nunca";
  const min = (Date.now() - new Date(ts).getTime()) / 60000;
  if (min < 1) return "recién";
  if (min < 60) return `hace ${Math.round(min)} min`;
  if (min < 48 * 60) return `hace ${Math.round(min / 60)} h`;
  return `hace ${Math.round(min / 1440)} días`;
}

const COLOR_TIER: Record<string, string> = {
  caliente: "text-[color:var(--color-ambar)]",
  normal: "text-[color:var(--color-tenue)]",
  frio: "text-[color:var(--color-tenue)]",
};

export default async function Lista() {
  const usuario = await usuarioActual();
  if (!usuario) redirect("/entrar");

  const sb = await clienteServidor();
  const [{ data: filas }, { data: tiendas }, { data: parametros }, { data: corrida }] = await Promise.all([
    sb.from("v_seguimiento").select("*").order("nombre"),
    sb.from("tienda").select("slug, nombre").eq("activa", true).order("nombre"),
    sb
      .from("parametros")
      .select("tarifa_kg, fee_fijo, tasa_imp")
      .order("vigente_desde", { ascending: false })
      .limit(1)
      .maybeSingle(),
    sb.from("corrida").select("inicio, leidas, fallidas, presupuesto, usadas_hoy").order("inicio", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const lista = (filas ?? []) as unknown as Fila[];
  const disponiblesParaPush = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null;

  return (
    <main>
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-semibold">Lo que sigo</h1>
          <p className="mt-1 text-sm text-[color:var(--color-tenue)]">
            Precio puesto en Asunción: etiqueta + envío + flete + fee + impuesto.
          </p>
        </div>
        <form action={salir}>
          <button className="text-xs text-[color:var(--color-tenue)] hover:text-[color:var(--color-tinta)]">salir</button>
        </form>
      </header>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[color:var(--color-tenue)]">
        <a href="/parametros" className="underline underline-offset-2 hover:text-[color:var(--color-tinta)]">
          {parametros
            ? `US$ ${Number(parametros.tarifa_kg)}/kg · US$ ${Number(parametros.fee_fijo)} fijo · ${(Number(parametros.tasa_imp) * 100).toFixed(0)}%`
            : "cargar parámetros de costo"}
        </a>
        {corrida && (
          <span>
            última corrida {haceCuanto(corrida.inicio)}: {corrida.leidas} lecturas
            {corrida.fallidas ? `, ${corrida.fallidas} fallidas` : ""}
            {corrida.presupuesto ? ` · ${corrida.usadas_hoy}/${corrida.presupuesto} del día` : ""}
          </span>
        )}
        <BotonPush clavePublica={disponiblesParaPush} />
      </div>

      <ul className="mt-6 space-y-3">
        {lista.map((f) => {
          const hayLectura = f.precio !== null && f.tarifa_kg !== null;
          const desglose = hayLectura
            ? calcularPuesto(
                { precio: Number(f.precio), envioUs: Number(f.envio_us ?? 0), pesoKg: Number(f.peso_kg) },
                { tarifaKg: Number(f.tarifa_kg), feeFijo: Number(f.fee_fijo), tasaImp: Number(f.tasa_imp) }
              )
            : null;
          const objetivo = f.objetivo_puesto === null ? null : Number(f.objetivo_puesto);
          const delta = desglose && objetivo !== null ? desglose.puesto - objetivo : null;
          const tier = tierDe(f.distancia === null ? null : Number(f.distancia));

          return (
            <li key={f.producto_id} className="rounded-lg border border-[color:var(--color-borde)] bg-[color:var(--color-panel)] p-4">
              <div className="flex items-baseline justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="truncate font-medium">{f.nombre}</h2>
                  <p className="mt-0.5 text-xs text-[color:var(--color-tenue)]">
                    {f.peso_kg} kg
                    {f.tienda_nombre ? ` · ${f.tienda_nombre}` : " · sin listing todavía"}
                    {f.condicion && f.condicion !== "nuevo" ? ` · ${f.condicion}` : ""}
                    {" · "}
                    {haceCuanto(f.leido_en)}
                    {f.stock === false && <span className="text-red-400"> · agotado</span>}
                    {desglose && <span className={COLOR_TIER[tier]}> · {tier}</span>}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <div className="numero text-lg font-semibold">{desglose ? usd(desglose.puesto) : "—"}</div>
                  {delta !== null && (
                    <div className={`numero text-xs ${delta <= 0 ? "text-[color:var(--color-verde)]" : "text-[color:var(--color-tenue)]"}`}>
                      {delta <= 0 ? "−" : "+"}
                      {usd(Math.abs(delta))} vs objetivo
                    </div>
                  )}
                </div>
              </div>

              {desglose && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs text-[color:var(--color-tenue)]">desglose</summary>
                  <div className="mt-2 max-w-sm">
                    <DesgloseTabla d={desglose} />
                    {f.url && (
                      <a href={f.url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs underline underline-offset-2">
                        ver en {f.tienda_nombre}
                      </a>
                    )}
                  </div>
                </details>
              )}

              {f.watch_id && (
                <FormaAccion accion={fijarObjetivo} className="mt-3 flex items-center gap-2">
                  <input type="hidden" name="watch_id" value={f.watch_id} />
                  <span className="text-xs text-[color:var(--color-tenue)]">objetivo</span>
                  <input
                    name="objetivo"
                    inputMode="decimal"
                    defaultValue={objetivo ?? ""}
                    className="numero w-24 rounded-md border border-[color:var(--color-borde)] bg-[color:var(--color-fondo)] px-2 py-1 text-sm"
                  />
                  <button className="text-xs text-[color:var(--color-tenue)] underline underline-offset-2 hover:text-[color:var(--color-tinta)]">
                    guardar
                  </button>
                  {f.armado === false && (
                    <span className="text-xs text-[color:var(--color-tenue)]">· ya avisé: espera otro 5% de baja</span>
                  )}
                </FormaAccion>
              )}
            </li>
          );
        })}
      </ul>

      {lista.length === 0 && (
        <p className="mt-8 text-sm text-[color:var(--color-tenue)]">
          Todavía no seguís nada. Cargá un producto con su peso y un objetivo.
        </p>
      )}

      <Agregar tiendas={(tiendas ?? []) as { slug: string; nombre: string }[]} />
    </main>
  );
}
