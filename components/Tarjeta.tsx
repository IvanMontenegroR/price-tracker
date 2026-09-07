"use client";

import { useState } from "react";
import { DesgloseTabla } from "./Desglose";
import { Foto } from "./Foto";
import { Boton, Chip, Icono } from "./ui";
import { calcularPuesto } from "@/lib/costo";
import { fijarObjetivo, type FilaSeguimiento } from "@/lib/datos";
import { tierDe } from "@/lib/recolector/presupuesto";

const usd = (n: number) => `US$ ${n.toFixed(2)}`;
const usdCorto = (n: number) => `US$ ${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

function haceCuanto(ts: string | null): string {
  if (!ts) return "sin leer";
  const min = (Date.now() - new Date(ts).getTime()) / 60000;
  if (min < 1) return "recién";
  if (min < 60) return `hace ${Math.round(min)} min`;
  if (min < 48 * 60) return `hace ${Math.round(min / 60)} h`;
  return `hace ${Math.round(min / 1440)} d`;
}

function cierre(ts: string | null): string {
  if (!ts) return "";
  const min = (new Date(ts).getTime() - Date.now()) / 60000;
  if (min <= 0) return "cerrada";
  if (min < 60) return `${Math.round(min)} min`;
  if (min < 48 * 60) return `${Math.round(min / 60)} h`;
  return `${Math.round(min / 1440)} d`;
}

export function Tarjeta({ f, alGuardar }: { f: FilaSeguimiento; alGuardar: () => Promise<void> }) {
  const [objetivo, setObjetivo] = useState(String(f.objetivo_puesto ?? ""));
  const [editando, setEditando] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // El desglose se recalcula con los parámetros congelados en la observación,
  // no con los de hoy: la tarjeta explica el número con el que se leyó.
  const d =
    f.precio !== null && f.tarifa_kg !== null
      ? calcularPuesto(
          { precio: f.precio, envioUs: f.envio_us ?? 0, pesoKg: f.peso_kg },
          { tarifaKg: f.tarifa_kg, feeFijo: f.fee_fijo!, tasaImp: f.tasa_imp! }
        )
      : null;

  const meta = f.objetivo_puesto;
  const delta = d && meta !== null ? d.puesto - meta : null;
  const cumple = delta !== null && delta <= 0;
  const tier = tierDe(f.distancia, f.termina_en);
  const esSubasta = f.tipo_venta === "subasta";
  // Qué tan cerca está del objetivo. Lleno = ya cumple.
  const avance = d && meta ? Math.min(100, (meta / d.puesto) * 100) : 0;

  async function guardar() {
    if (!f.watch_id) return;
    const n = Number(objetivo.replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) return setError("Poné un número");
    setGuardando(true);
    try {
      await fijarObjetivo(f.watch_id, n);
      await alGuardar();
      setError(null);
      setEditando(false);
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <li className="group rounded-tarjeta border border-borde bg-panel p-3.5 transition hover:border-tenue/25 sm:p-4">
      <div className="flex gap-3 sm:gap-4">
        <Foto src={f.imagen} alt={f.nombre} className="h-14 w-14 p-1 sm:h-[72px] sm:w-[72px]" />

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              {/* Dos líneas antes que cortar: el nombre es la identidad de la
                  fila, y truncado a ocho letras no identifica nada. */}
              <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug">{f.nombre}</h3>
              <p className="mt-0.5 truncate text-xs text-tenue">
                {f.peso_kg} kg
                {f.tienda_nombre ? ` · ${f.tienda_nombre}` : " · sin listing"}
                {f.condicion && f.condicion !== "nuevo" ? ` · ${f.condicion.replace("_", " ")}` : ""}
              </p>
            </div>

            <div className="shrink-0 text-right">
              <div className={`numero text-lg font-bold leading-none sm:text-2xl ${cumple ? "text-verde" : ""}`}>
                {d ? usd(d.puesto) : "—"}
              </div>
              {delta !== null && (
                <div className={`numero mt-1 text-[11px] sm:text-xs ${cumple ? "text-verde" : "text-tenue"}`}>
                  {cumple ? "−" : "+"}
                  {usd(Math.abs(delta))}
                </div>
              )}
            </div>
          </div>

          {(esSubasta || f.stock === false || (d && tier === "caliente") || f.armado === false || !d) && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {esSubasta && (
                <Chip tono="ambar" titulo="En una subasta el precio de ahora no es lo que vas a pagar">
                  <Icono nombre="reloj" className="h-3 w-3" />
                  puja · cierra en {cierre(f.termina_en)}
                </Chip>
              )}
              {f.stock === false && <Chip tono="rojo">agotado</Chip>}
              {d && tier === "caliente" && <Chip tono="ambar">caliente</Chip>}
              {f.armado === false && <Chip titulo="Ya te avisé: no vuelve a avisar hasta que baje otro 5%">ya avisé</Chip>}
              {!d && <Chip>esperando primera lectura</Chip>}
            </div>
          )}

          {d && meta !== null && (
            <div className="mt-2.5 flex items-center gap-2">
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-borde-suave">
                <div
                  className={`barra h-full rounded-full ${cumple ? "bg-verde" : "bg-tenue/45"}`}
                  style={{ width: `${avance}%` }}
                />
              </div>
              <span className={`numero shrink-0 text-[11px] ${cumple ? "text-verde" : "text-apagado"}`}>
                {cumple ? "cumple" : `+${((delta! / meta) * 100).toFixed(0)}%`}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Un solo renglón de pie: objetivo a la izquierda, el resto a la derecha. */}
      <div className="mt-3 flex items-center justify-between gap-3 border-t border-borde-suave pt-2.5 text-xs">
        {editando ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-tenue">objetivo</span>
            <input
              autoFocus
              value={objetivo}
              onChange={(e) => setObjetivo(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && guardar()}
              inputMode="decimal"
              className="numero w-24 rounded-lg border border-borde bg-fondo px-2 py-1 text-sm outline-none focus:border-verde/50"
            />
            <Boton variante="fuerte" className="px-2.5 py-1 text-xs" disabled={guardando} onClick={guardar}>
              guardar
            </Boton>
            <Boton variante="fantasma" className="px-1.5 py-1 text-xs" onClick={() => setEditando(false)}>
              cancelar
            </Boton>
            {error && <span className="text-rojo">{error}</span>}
          </div>
        ) : (
          <button onClick={() => setEditando(true)} className="text-tenue transition hover:text-tinta">
            objetivo <span className="numero text-tinta">{meta !== null ? usdCorto(meta) : "sin fijar"}</span>
            <span className="ml-1 text-apagado opacity-0 transition group-hover:opacity-100">editar</span>
          </button>
        )}

        <div className="flex shrink-0 items-center gap-3 text-apagado">
          <span className="hidden sm:inline">{haceCuanto(f.leido_en)}</span>
          {d && (
            <button
              onClick={() => setAbierto(!abierto)}
              className="inline-flex items-center gap-1 transition hover:text-tinta"
              aria-expanded={abierto}
            >
              desglose
              <Icono nombre="flecha" className={`h-3 w-3 transition ${abierto ? "rotate-90" : "-rotate-90"}`} />
            </button>
          )}
          {f.url && (
            <a
              href={f.url}
              target="_blank"
              rel="noreferrer"
              className="transition hover:text-tinta"
              title={`Ver en ${f.tienda_nombre}`}
            >
              <Icono nombre="afuera" className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </div>

      {d && abierto && (
        <div className="mt-2.5 rounded-xl border border-borde-suave bg-fondo p-3 sm:max-w-sm">
          <DesgloseTabla d={d} />
        </div>
      )}
    </li>
  );
}
