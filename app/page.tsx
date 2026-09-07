"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Agregar } from "@/components/Agregar";
import { BotonPush } from "@/components/BotonPush";
import { DesgloseTabla } from "@/components/Desglose";
import { calcularPuesto } from "@/lib/costo";
import {
  cargarSeguimiento,
  cargarTiendas,
  cargarUltimaCorrida,
  fijarObjetivo,
  type Corrida,
  type FilaSeguimiento,
  type Tienda,
} from "@/lib/datos";
import { tierDe } from "@/lib/recolector/presupuesto";
import { clienteNavegador } from "@/lib/supabase/navegador";

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

export default function Lista() {
  const router = useRouter();
  const [filas, setFilas] = useState<FilaSeguimiento[] | null>(null);
  const [tiendas, setTiendas] = useState<Tienda[]>([]);
  const [corrida, setCorrida] = useState<Corrida | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refrescar = useCallback(async () => {
    try {
      const [f, t, c] = await Promise.all([cargarSeguimiento(), cargarTiendas(), cargarUltimaCorrida()]);
      setFilas(f);
      setTiendas(t);
      setCorrida(c);
      setError(null);
    } catch (e) {
      setError(String((e as Error).message));
    }
  }, []);

  useEffect(() => {
    const sb = clienteNavegador();
    // El magic link vuelve con el código en la URL; el cliente lo canjea solo.
    sb.auth.getSession().then(({ data }) => {
      if (!data.session) router.replace("/entrar");
      else void refrescar();
    });
  }, [router, refrescar]);

  async function salir() {
    await clienteNavegador().auth.signOut();
    router.replace("/entrar");
  }

  if (filas === null) {
    return <p className="pt-16 text-center text-sm text-[color:var(--color-tenue)]">Cargando…</p>;
  }

  return (
    <main>
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-semibold">Lo que sigo</h1>
          <p className="mt-1 text-sm text-[color:var(--color-tenue)]">
            Precio puesto en Asunción: etiqueta + envío + flete + fee + impuesto.
          </p>
        </div>
        <button onClick={salir} className="text-xs text-[color:var(--color-tenue)] hover:text-[color:var(--color-tinta)]">
          salir
        </button>
      </header>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[color:var(--color-tenue)]">
        <a href="parametros" className="underline underline-offset-2 hover:text-[color:var(--color-tinta)]">
          parámetros de costo
        </a>
        {corrida && (
          <span>
            última corrida {haceCuanto(corrida.inicio)}: {corrida.leidas} lecturas
            {corrida.fallidas ? `, ${corrida.fallidas} fallidas` : ""}
            {corrida.presupuesto ? ` · ${corrida.usadas_hoy}/${corrida.presupuesto} del día` : ""}
          </span>
        )}
        <BotonPush />
      </div>

      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

      <ul className="mt-6 space-y-3">
        {filas.map((f) => (
          <Fila key={f.producto_id} f={f} alGuardar={refrescar} />
        ))}
      </ul>

      {filas.length === 0 && (
        <p className="mt-8 text-sm text-[color:var(--color-tenue)]">
          Todavía no seguís nada. Cargá un producto con su peso y un objetivo.
        </p>
      )}

      <Agregar tiendas={tiendas} alAgregar={refrescar} />
    </main>
  );
}

function Fila({ f, alGuardar }: { f: FilaSeguimiento; alGuardar: () => Promise<void> }) {
  const [objetivo, setObjetivo] = useState(String(f.objetivo_puesto ?? ""));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // El desglose se recalcula con los parámetros congelados en la observación,
  // no con los de hoy: la fila explica el número con el que se leyó.
  const desglose =
    f.precio !== null && f.tarifa_kg !== null
      ? calcularPuesto(
          { precio: f.precio, envioUs: f.envio_us ?? 0, pesoKg: f.peso_kg },
          { tarifaKg: f.tarifa_kg, feeFijo: f.fee_fijo!, tasaImp: f.tasa_imp! }
        )
      : null;

  const delta = desglose && f.objetivo_puesto !== null ? desglose.puesto - f.objetivo_puesto : null;
  const tier = tierDe(f.distancia);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!f.watch_id) return;
    const n = Number(objetivo.replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) return setError("objetivo inválido");
    setGuardando(true);
    try {
      await fijarObjetivo(f.watch_id, n);
      await alGuardar();
      setError(null);
    } catch (err) {
      setError(String((err as Error).message));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <li className="rounded-lg border border-[color:var(--color-borde)] bg-[color:var(--color-panel)] p-4">
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
        <form onSubmit={guardar} className="mt-3 flex items-center gap-2">
          <span className="text-xs text-[color:var(--color-tenue)]">objetivo</span>
          <input
            value={objetivo}
            onChange={(e) => setObjetivo(e.target.value)}
            inputMode="decimal"
            className="numero w-24 rounded-md border border-[color:var(--color-borde)] bg-[color:var(--color-fondo)] px-2 py-1 text-sm"
          />
          <button
            disabled={guardando}
            className="text-xs text-[color:var(--color-tenue)] underline underline-offset-2 hover:text-[color:var(--color-tinta)] disabled:opacity-50"
          >
            guardar
          </button>
          {f.armado === false && (
            <span className="text-xs text-[color:var(--color-tenue)]">· ya avisé: espera otro 5% de baja</span>
          )}
          {error && <span className="text-xs text-red-400">{error}</span>}
        </form>
      )}
    </li>
  );
}
