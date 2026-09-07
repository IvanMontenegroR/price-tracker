"use client";

import { useState, useTransition } from "react";
import { agregarSeguimiento } from "@/app/acciones";

const campo =
  "w-full rounded-md border border-[color:var(--color-borde)] bg-[color:var(--color-panel)] px-2.5 py-1.5 text-sm";

export function Agregar({ tiendas }: { tiendas: { slug: string; nombre: string }[] }) {
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        className="mt-6 w-full rounded-md border border-dashed border-[color:var(--color-borde)] py-2.5 text-sm text-[color:var(--color-tenue)] hover:text-[color:var(--color-tinta)]"
      >
        + Seguir algo nuevo
      </button>
    );
  }

  return (
    <form
      action={(datos) =>
        empezar(async () => {
          const r = await agregarSeguimiento(datos);
          if (r?.error) setError(r.error);
          else {
            setError(null);
            setAbierto(false);
          }
        })
      }
      className="mt-6 space-y-3 rounded-lg border border-[color:var(--color-borde)] bg-[color:var(--color-panel)] p-4"
    >
      <div className="grid grid-cols-2 gap-3">
        <label className="col-span-2 block">
          <span className="text-xs text-[color:var(--color-tenue)]">Producto</span>
          <input name="nombre" required placeholder="iPhone 17 Pro 256GB" className={campo} />
        </label>
        <label className="block">
          <span className="text-xs text-[color:var(--color-tenue)]">Peso en kg (con caja)</span>
          <input name="peso_kg" required inputMode="decimal" placeholder="0.4" className={campo} />
        </label>
        <label className="block">
          <span className="text-xs text-[color:var(--color-tenue)]">Objetivo puesto (US$)</span>
          <input name="objetivo" required inputMode="decimal" placeholder="1100" className={campo} />
        </label>
        <label className="block">
          <span className="text-xs text-[color:var(--color-tenue)]">Tienda</span>
          <select name="tienda" className={campo} defaultValue={tiendas[0]?.slug}>
            {tiendas.map((t) => (
              <option key={t.slug} value={t.slug}>
                {t.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-[color:var(--color-tenue)]">Condición</span>
          <select name="condicion" className={campo} defaultValue="nuevo">
            <option value="nuevo">nuevo</option>
            <option value="open_box">open box</option>
            <option value="reacondicionado">reacondicionado</option>
          </select>
        </label>
        <label className="col-span-2 block">
          <span className="text-xs text-[color:var(--color-tenue)]">URL del producto en esa tienda</span>
          <input name="url" placeholder="https://www.bestbuy.com/site/…/6418599.p" className={campo} />
        </label>
      </div>
      <p className="text-xs text-[color:var(--color-tenue)]">
        El peso es lo único que no se puede leer de la tienda, y sin él no hay precio puesto.
      </p>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button
          disabled={pendiente}
          className="rounded-md bg-[color:var(--color-verde)] px-3 py-1.5 text-sm font-medium text-black disabled:opacity-50"
        >
          Guardar
        </button>
        <button type="button" onClick={() => setAbierto(false)} className="px-3 py-1.5 text-sm text-[color:var(--color-tenue)]">
          Cancelar
        </button>
      </div>
    </form>
  );
}
