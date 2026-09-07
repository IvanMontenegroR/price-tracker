"use client";

import { useState } from "react";
import { Boton, Campo, Hoja } from "./ui";
import { agregarSeguimiento, type Tienda } from "@/lib/datos";

const numero = (v: string) => Number(v.replace(",", "."));

export function Agregar({
  abierta,
  cerrar,
  tiendas,
  alAgregar,
}: {
  abierta: boolean;
  cerrar: () => void;
  tiendas: Tienda[];
  alAgregar: () => Promise<void>;
}) {
  const [nombre, setNombre] = useState("");
  const [peso, setPeso] = useState("");
  const [objetivo, setObjetivo] = useState("");
  const [url, setUrl] = useState("");
  const [tienda, setTienda] = useState("");
  const [condicion, setCondicion] = useState("nuevo");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const preferida = tienda || tiendas.find((t) => t.slug === "ebay")?.slug || tiendas[0]?.slug || "";

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    const kg = numero(peso);
    const meta = numero(objetivo);
    if (!nombre.trim()) return setError("Falta el nombre.");
    if (!Number.isFinite(kg) || kg <= 0) return setError("El peso tiene que ser un número mayor a cero.");
    if (!Number.isFinite(meta) || meta <= 0) return setError("Sin objetivo no hay regla que pueda disparar.");

    setGuardando(true);
    try {
      await agregarSeguimiento({
        nombre: nombre.trim(),
        pesoKg: kg,
        objetivo: meta,
        tiendaSlug: preferida,
        url: url.trim(),
        condicion,
      });
      await alAgregar();
      setNombre("");
      setPeso("");
      setObjetivo("");
      setUrl("");
      setError(null);
      cerrar();
    } catch (err) {
      setError(String((err as Error).message));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Hoja abierta={abierta} cerrar={cerrar} titulo="Seguir algo nuevo">
      <form onSubmit={guardar} className="space-y-4">
        <Campo
          etiqueta="Producto"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="iPhone 17 Pro 256GB"
          autoFocus
        />

        <div className="grid grid-cols-2 gap-3">
          <Campo
            etiqueta="Peso con caja (kg)"
            value={peso}
            onChange={(e) => setPeso(e.target.value)}
            inputMode="decimal"
            placeholder="0.45"
            className="numero"
            ayuda="Lo único que no se lee de la tienda"
          />
          <Campo
            etiqueta="Objetivo puesto (US$)"
            value={objetivo}
            onChange={(e) => setObjetivo(e.target.value)}
            inputMode="decimal"
            placeholder="1150"
            className="numero"
            ayuda="Ya con flete e impuesto"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-tenue">Tienda</span>
            <select
              value={preferida}
              onChange={(e) => setTienda(e.target.value)}
              className="w-full rounded-xl border border-borde bg-fondo px-3 py-2.5 text-sm outline-none focus:border-verde/50"
            >
              {tiendas.map((t) => (
                <option key={t.slug} value={t.slug}>
                  {t.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-tenue">Condición</span>
            <select
              value={condicion}
              onChange={(e) => setCondicion(e.target.value)}
              className="w-full rounded-xl border border-borde bg-fondo px-3 py-2.5 text-sm outline-none focus:border-verde/50"
            >
              <option value="nuevo">nuevo</option>
              <option value="usado">usado</option>
              <option value="open_box">open box</option>
              <option value="reacondicionado">reacondicionado</option>
            </select>
          </label>
        </div>

        <Campo
          etiqueta="URL de la publicación"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.ebay.com/itm/145678901234"
          ayuda="De ahí salen el precio y la foto. Podés cargarla después."
        />

        {error && <p className="rounded-xl border border-rojo/30 bg-rojo/10 px-3 py-2 text-sm text-rojo">{error}</p>}

        <div className="flex gap-2 pt-1">
          <Boton variante="fuerte" className="flex-1" disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar"}
          </Boton>
          <Boton type="button" variante="suave" onClick={cerrar}>
            Cancelar
          </Boton>
        </div>
      </form>
    </Hoja>
  );
}
