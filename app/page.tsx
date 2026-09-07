"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Agregar } from "@/components/Agregar";
import { BotonPush } from "@/components/BotonPush";
import { Tarjeta } from "@/components/Tarjeta";
import { Boton, Esqueleto, Icono } from "@/components/ui";
import {
  cargarParametros,
  cargarSeguimiento,
  cargarTiendas,
  cargarUltimaCorrida,
  type Corrida,
  type FilaSeguimiento,
  type Tienda,
} from "@/lib/datos";
import { clienteNavegador } from "@/lib/supabase/navegador";
import type { Parametros } from "@/lib/tipos";

function haceCuanto(ts: string | null): string {
  if (!ts) return "nunca";
  const min = (Date.now() - new Date(ts).getTime()) / 60000;
  if (min < 1) return "recién";
  if (min < 60) return `hace ${Math.round(min)} min`;
  if (min < 48 * 60) return `hace ${Math.round(min / 60)} h`;
  return `hace ${Math.round(min / 1440)} d`;
}

export default function Lista() {
  const router = useRouter();
  const [filas, setFilas] = useState<FilaSeguimiento[] | null>(null);
  const [tiendas, setTiendas] = useState<Tienda[]>([]);
  const [corrida, setCorrida] = useState<Corrida | null>(null);
  const [parametros, setParametros] = useState<Parametros | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [abrirAgregar, setAbrirAgregar] = useState(false);

  const refrescar = useCallback(async () => {
    try {
      const [f, t, c, p] = await Promise.all([
        cargarSeguimiento(),
        cargarTiendas(),
        cargarUltimaCorrida(),
        cargarParametros(),
      ]);
      setFilas(f);
      setTiendas(t);
      setCorrida(c);
      setParametros(p);
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

  const cumpliendo = (filas ?? []).filter(
    (f) => f.puesto_py !== null && f.objetivo_puesto !== null && f.puesto_py <= f.objetivo_puesto
  ).length;

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-borde bg-fondo/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <h1 className="text-base font-semibold leading-tight sm:text-lg">Lo que sigo</h1>
            <p className="truncate text-[11px] text-tenue sm:text-xs">
              {filas === null
                ? "cargando…"
                : filas.length === 0
                  ? "todavía nada"
                  : `${filas.length} producto${filas.length === 1 ? "" : "s"}${cumpliendo ? ` · ${cumpliendo} en objetivo` : ""}`}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <a
              href="parametros"
              className="compacto rounded-xl p-2.5 text-tenue transition hover:bg-panel hover:text-tinta"
              title="Parámetros de costo"
            >
              <Icono nombre="ajustes" className="h-5 w-5" />
            </a>
            <button
              onClick={salir}
              className="compacto rounded-xl p-2.5 text-tenue transition hover:bg-panel hover:text-tinta"
              title="Salir"
            >
              <Icono nombre="salir" className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-28 pt-4 sm:px-6 lg:grid lg:grid-cols-[minmax(0,1fr)_296px] lg:gap-8 lg:pb-10">
        <div className="min-w-0">
          {error && (
            <div className="mb-4 rounded-xl border border-rojo/30 bg-rojo/10 px-4 py-3 text-sm text-rojo">{error}</div>
          )}

          {filas === null ? (
            <ul className="space-y-3">
              {[0, 1, 2].map((i) => (
                <li key={i} className="rounded-tarjeta border border-borde bg-panel p-4 sm:p-5">
                  <div className="flex gap-4">
                    <Esqueleto className="h-16 w-16 shrink-0 sm:h-20 sm:w-20" />
                    <div className="flex-1 space-y-2">
                      <Esqueleto className="h-4 w-2/3" />
                      <Esqueleto className="h-3 w-1/2" />
                      <Esqueleto className="h-1 w-full" />
                    </div>
                    <Esqueleto className="h-6 w-20 shrink-0" />
                  </div>
                </li>
              ))}
            </ul>
          ) : filas.length === 0 ? (
            <div className="rounded-tarjeta border border-dashed border-borde bg-panel/50 px-6 py-14 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-panel-alto text-tenue">
                <Icono nombre="caja" className="h-6 w-6" />
              </div>
              <h2 className="text-sm font-semibold">Todavía no seguís nada</h2>
              <p className="mx-auto mt-1.5 max-w-xs text-xs text-tenue">
                Cargá un producto con su peso y el precio puesto al que lo comprarías. El peso es lo único
                que no se puede leer de la tienda.
              </p>
              <Boton variante="fuerte" className="mt-5" onClick={() => setAbrirAgregar(true)}>
                <Icono nombre="mas" /> Seguir algo
              </Boton>
            </div>
          ) : (
            <ul className="space-y-3">
              {filas.map((f) => (
                <Tarjeta key={f.producto_id} f={f} alGuardar={refrescar} />
              ))}
            </ul>
          )}
        </div>

        {/* En escritorio el estado del sistema vive al costado; en celular baja
            al final, porque lo primero tienen que ser los precios. */}
        <aside className="mt-8 space-y-3 lg:mt-0">
          <section className="rounded-tarjeta border border-borde bg-panel p-4">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-apagado">El recolector</h2>
            {corrida ? (
              <>
                <p className="text-sm">
                  Última corrida <span className="text-tenue">{haceCuanto(corrida.inicio)}</span>
                </p>
                <p className="mt-1 text-xs text-tenue">
                  {corrida.leidas} lectura{corrida.leidas === 1 ? "" : "s"}
                  {corrida.fallidas ? `, ${corrida.fallidas} fallida${corrida.fallidas === 1 ? "" : "s"}` : ""}
                </p>
                {corrida.presupuesto ? (
                  <div className="mt-3">
                    <div className="h-1 overflow-hidden rounded-full bg-borde-suave">
                      <div
                        className="barra h-full rounded-full bg-tenue/50"
                        style={{ width: `${Math.min(100, ((corrida.usadas_hoy ?? 0) / corrida.presupuesto) * 100)}%` }}
                      />
                    </div>
                    <p className="numero mt-1.5 text-[11px] text-apagado">
                      {corrida.usadas_hoy}/{corrida.presupuesto} peticiones del día
                    </p>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="text-xs text-tenue">Todavía no corrió.</p>
            )}
          </section>

          <section className="rounded-tarjeta border border-borde bg-panel p-4">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-apagado">Costo de traer</h2>
            {parametros && (
              <ul className="space-y-1.5 text-sm">
                <li className="flex justify-between">
                  <span className="text-tenue">Flete</span>
                  <span className="numero">US$ {parametros.tarifaKg}/kg</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-tenue">Fee fijo</span>
                  <span className="numero">US$ {parametros.feeFijo}</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-tenue">Impuesto</span>
                  <span className="numero">{(parametros.tasaImp * 100).toFixed(0)}%</span>
                </li>
              </ul>
            )}
            <a href="parametros" className="mt-3 inline-block text-xs text-verde hover:underline">
              calibrar
            </a>
          </section>

          <section className="rounded-tarjeta border border-borde bg-panel p-4">
            <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-apagado">
              <Icono nombre="campana" className="h-3.5 w-3.5" /> Avisos
            </h2>
            <BotonPush />
          </section>

          <Boton variante="fuerte" className="hidden w-full lg:inline-flex" onClick={() => setAbrirAgregar(true)}>
            <Icono nombre="mas" /> Seguir algo nuevo
          </Boton>
        </aside>
      </main>

      {/* En celular, el botón principal está donde llega el pulgar. */}
      <button
        onClick={() => setAbrirAgregar(true)}
        className="fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] right-5 z-40 flex h-14 w-14 items-center justify-center rounded-2xl bg-verde text-black shadow-lg shadow-black/40 transition active:scale-95 lg:hidden"
        aria-label="Seguir algo nuevo"
      >
        <Icono nombre="mas" className="h-6 w-6" />
      </button>

      <Agregar
        abierta={abrirAgregar}
        cerrar={() => setAbrirAgregar(false)}
        tiendas={tiendas}
        alAgregar={refrescar}
      />
    </div>
  );
}
