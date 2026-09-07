"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DesgloseTabla } from "@/components/Desglose";
import { Boton, Campo, Icono } from "@/components/ui";
import { calcularPuesto } from "@/lib/costo";
import { cargarParametros, guardarParametros, type HistorialParametro } from "@/lib/datos";
import { clienteNavegador } from "@/lib/supabase/navegador";
import { PARAMETROS_INICIALES, type Parametros } from "@/lib/tipos";

export default function PantallaParametros() {
  const router = useRouter();
  const [p, setP] = useState<Parametros>(PARAMETROS_INICIALES);
  const [historial, setHistorial] = useState<HistorialParametro[]>([]);
  const [nota, setNota] = useState("");
  const [estado, setEstado] = useState<{ tipo: "ok" | "mal"; texto: string } | null>(null);
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
    if (p.tasaImp >= 1) return setEstado({ tipo: "mal", texto: "La tasa va en fracción: 0.15, no 15." });
    try {
      await guardarParametros({ ...p, nota });
      const actual = await cargarParametros();
      setHistorial(actual.historial);
      setNota("");
      setEstado({ tipo: "ok", texto: "Guardado como versión nueva." });
    } catch (err) {
      setEstado({ tipo: "mal", texto: String((err as Error).message) });
    }
  }

  const numero = (v: string) => Number(v.replace(",", ".")) || 0;
  const ejemplo = calcularPuesto({ precio: 999, envioUs: 0, pesoKg: 0.45 }, p);

  if (cargando) return <p className="p-8 text-center text-sm text-tenue">Cargando…</p>;

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-borde bg-fondo/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3 sm:px-6">
          <a href="./" className="compacto -ml-2 rounded-xl p-2 text-tenue transition hover:bg-panel hover:text-tinta">
            <Icono nombre="flecha" className="h-5 w-5" />
          </a>
          <div>
            <h1 className="text-base font-semibold leading-tight sm:text-lg">Costo de traer</h1>
            <p className="text-[11px] text-tenue sm:text-xs">Los tres números que convierten etiqueta en precio puesto</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <p className="max-w-prose text-sm leading-relaxed text-tenue">
          Se versionan, no se pisan: cada observación guarda los valores con los que se calculó, así el
          histórico se puede recalcular con los de hoy y también leer con los de entonces. Calibralos contra
          facturas reales del courier.
        </p>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <form onSubmit={guardar} className="space-y-4 rounded-tarjeta border border-borde bg-panel p-4 sm:p-5">
            <div className="grid grid-cols-3 gap-3">
              <Campo
                etiqueta="US$ por kg"
                value={p.tarifaKg}
                onChange={(e) => setP({ ...p, tarifaKg: numero(e.target.value) })}
                inputMode="decimal"
                className="numero"
              />
              <Campo
                etiqueta="Fee fijo"
                value={p.feeFijo}
                onChange={(e) => setP({ ...p, feeFijo: numero(e.target.value) })}
                inputMode="decimal"
                className="numero"
              />
              <Campo
                etiqueta="Tasa"
                value={p.tasaImp}
                onChange={(e) => setP({ ...p, tasaImp: numero(e.target.value) })}
                inputMode="decimal"
                className="numero"
                ayuda="0.15 = 15%"
              />
            </div>
            <Campo
              etiqueta="Nota"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="factura Aeropaq 04/09, 1.2 kg"
              ayuda="Contra qué factura lo calibraste"
            />
            <Boton variante="fuerte" className="w-full">
              Guardar versión nueva
            </Boton>
            {estado && (
              <p className={`text-xs ${estado.tipo === "ok" ? "text-verde" : "text-rojo"}`}>{estado.texto}</p>
            )}
          </form>

          <section className="rounded-tarjeta border border-borde bg-panel p-4 sm:p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-apagado">Con estos valores</h2>
            <p className="mb-3 mt-1 text-xs text-tenue">Un artículo de US$ 999 y 0,45 kg:</p>
            <DesgloseTabla d={ejemplo} />
          </section>
        </div>

        {historial.length > 1 && (
          <section className="mt-6 rounded-tarjeta border border-borde bg-panel p-4 sm:p-5">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-apagado">Historial</h2>
            <ul className="space-y-2 text-xs">
              {historial.map((v) => (
                <li key={v.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-borde-suave pb-2 last:border-0">
                  <span className="numero text-tenue">{new Date(v.vigente_desde).toLocaleDateString("es-PY")}</span>
                  <span className="numero">
                    US$ {Number(v.tarifa_kg)}/kg · US$ {Number(v.fee_fijo)} · {(Number(v.tasa_imp) * 100).toFixed(0)}%
                  </span>
                  {v.nota && <span className="text-apagado">{v.nota}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
