"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DesgloseTabla } from "@/components/Desglose";
import { calcularPuesto } from "@/lib/costo";
import { cargarParametros, guardarParametros, type HistorialParametro } from "@/lib/datos";
import { clienteNavegador } from "@/lib/supabase/navegador";
import { PARAMETROS_INICIALES, type Parametros } from "@/lib/tipos";

const campo =
  "w-full rounded-md border border-[color:var(--color-borde)] bg-[color:var(--color-fondo)] px-2.5 py-1.5 text-sm numero";

export default function PantallaParametros() {
  const router = useRouter();
  const [p, setP] = useState<Parametros>(PARAMETROS_INICIALES);
  const [historial, setHistorial] = useState<HistorialParametro[]>([]);
  const [nota, setNota] = useState("");
  const [estado, setEstado] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const sb = clienteNavegador();
    sb.auth.getSession().then(async ({ data }) => {
      if (!data.session) return router.replace("/entrar");
      const actual = await cargarParametros();
      setP({ tarifaKg: actual.tarifaKg, feeFijo: actual.feeFijo, tasaImp: actual.tasaImp });
      setHistorial(actual.historial);
      setCargando(false);
    });
  }, [router]);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (p.tasaImp >= 1) return setEstado("La tasa va en fracción: 0.15, no 15.");
    try {
      await guardarParametros({ ...p, nota });
      const actual = await cargarParametros();
      setHistorial(actual.historial);
      setNota("");
      setEstado("guardado");
    } catch (err) {
      setEstado(String((err as Error).message));
    }
  }

  const numero = (v: string) => Number(v.replace(",", ".")) || 0;
  const ejemplo = calcularPuesto({ precio: 999, envioUs: 0, pesoKg: 0.4 }, p);

  if (cargando) return <p className="pt-16 text-center text-sm text-[color:var(--color-tenue)]">Cargando…</p>;

  return (
    <main>
      <a href="./" className="text-xs text-[color:var(--color-tenue)] underline underline-offset-2">
        ← lo que sigo
      </a>
      <h1 className="mt-3 text-xl font-semibold">Parámetros de costo</h1>
      <p className="mt-1 max-w-prose text-sm text-[color:var(--color-tenue)]">
        Se versionan, no se pisan: cada observación guarda los valores con los que se calculó, así el
        histórico se puede recalcular con los de hoy y también leer con los de entonces. Calibralos
        contra facturas reales del courier.
      </p>

      <form onSubmit={guardar} className="mt-6 grid max-w-md grid-cols-3 gap-3">
        <label className="block">
          <span className="text-xs text-[color:var(--color-tenue)]">US$ por kg</span>
          <input
            value={p.tarifaKg}
            onChange={(e) => setP({ ...p, tarifaKg: numero(e.target.value) })}
            inputMode="decimal"
            className={campo}
          />
        </label>
        <label className="block">
          <span className="text-xs text-[color:var(--color-tenue)]">Fee fijo US$</span>
          <input
            value={p.feeFijo}
            onChange={(e) => setP({ ...p, feeFijo: numero(e.target.value) })}
            inputMode="decimal"
            className={campo}
          />
        </label>
        <label className="block">
          <span className="text-xs text-[color:var(--color-tenue)]">Tasa (0.15 = 15%)</span>
          <input
            value={p.tasaImp}
            onChange={(e) => setP({ ...p, tasaImp: numero(e.target.value) })}
            inputMode="decimal"
            className={campo}
          />
        </label>
        <label className="col-span-3 block">
          <span className="text-xs text-[color:var(--color-tenue)]">Nota (contra qué factura lo calibraste)</span>
          <input
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="factura Aeropaq 04/09, 1.2 kg"
            className={campo.replace(" numero", "")}
          />
        </label>
        <button className="col-span-3 justify-self-start rounded-md bg-[color:var(--color-verde)] px-3 py-1.5 text-sm font-medium text-black">
          Guardar versión nueva
        </button>
      </form>

      {estado && <p className="mt-2 text-xs text-[color:var(--color-tenue)]">{estado}</p>}

      <section className="mt-8 max-w-sm">
        <h2 className="text-sm font-medium">Con estos valores</h2>
        <p className="mb-2 text-xs text-[color:var(--color-tenue)]">Un artículo de US$ 999 y 0,4 kg:</p>
        <DesgloseTabla d={ejemplo} />
      </section>

      {historial.length > 1 && (
        <section className="mt-8">
          <h2 className="text-sm font-medium">Historial</h2>
          <ul className="mt-2 space-y-1 text-xs text-[color:var(--color-tenue)]">
            {historial.map((v) => (
              <li key={v.id} className="numero">
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
