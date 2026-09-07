"use client";

import { useState } from "react";
import { Foto } from "./Foto";
import { Boton, Chip, Hoja, Icono } from "./ui";
import { aceptarCandidato, rechazarCandidato, type CandidatoPendiente } from "@/lib/datos";

const usd = (n: number) => `US$ ${n.toFixed(2)}`;

/**
 * Lo que el descubrimiento encontró pero no se animó a adoptar solo.
 *
 * Existe porque la alternativa es peor de las dos maneras: adoptar todo llena
 * el tracker de fundas y accesorios, y preguntar por todo me devuelve el
 * trabajo que el descubrimiento vino a sacarme. Acá cae solo lo del medio, y
 * se resuelve con un toque.
 */
export function Candidatos({
  candidatos,
  abierta,
  cerrar,
  alResolver,
}: {
  candidatos: CandidatoPendiente[];
  abierta: boolean;
  cerrar: () => void;
  alResolver: () => Promise<void>;
}) {
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function resolver(c: CandidatoPendiente, acepta: boolean) {
    setOcupado(c.id);
    try {
      if (acepta) await aceptarCandidato(c);
      else await rechazarCandidato(c.id);
      await alResolver();
      setError(null);
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setOcupado(null);
    }
  }

  return (
    <Hoja abierta={abierta} cerrar={cerrar} titulo={`Por revisar (${candidatos.length})`}>
      <p className="mb-4 text-xs leading-relaxed text-tenue">
        Encontré esto buscando tus productos, pero no estoy seguro de que sean. Lo que aceptes se
        empieza a vigilar; lo que descartes no vuelve a aparecer.
      </p>

      {error && <p className="mb-3 rounded-xl border border-rojo/30 bg-rojo/10 px-3 py-2 text-sm text-rojo">{error}</p>}

      <ul className="space-y-3">
        {candidatos.map((c) => (
          <li key={c.id} className="rounded-xl border border-borde bg-fondo p-3">
            <div className="flex gap-3">
              <Foto src={c.imagen_url} alt={c.titulo} className="h-14 w-14 p-1" />
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm font-medium leading-snug">{c.titulo}</p>
                <p className="mt-0.5 text-xs text-tenue">
                  para <span className="text-tinta">{c.producto?.nombre}</span>
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {c.puesto_estimado !== null && (
                    <Chip tono="neutro" titulo="Estimado con el peso del producto y tus parámetros">
                      {usd(c.puesto_estimado)} puesto
                    </Chip>
                  )}
                  {c.condicion && c.condicion !== "nuevo" && <Chip>{c.condicion.replace("_", " ")}</Chip>}
                  {c.tipo_venta === "subasta" && <Chip tono="ambar">subasta</Chip>}
                </div>
                {c.motivos.length > 0 && (
                  <p className="mt-1.5 text-[11px] text-apagado">{c.motivos.join(" · ")}</p>
                )}
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <Boton
                variante="fuerte"
                className="flex-1 py-1.5 text-xs"
                disabled={ocupado === c.id}
                onClick={() => resolver(c, true)}
              >
                Es este
              </Boton>
              <Boton
                variante="suave"
                className="flex-1 py-1.5 text-xs"
                disabled={ocupado === c.id}
                onClick={() => resolver(c, false)}
              >
                No es
              </Boton>
              <a
                href={c.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl border border-borde p-2 text-tenue transition hover:text-tinta"
                title="Ver la publicación"
              >
                <Icono nombre="afuera" className="h-4 w-4" />
              </a>
            </div>
          </li>
        ))}
      </ul>

      {candidatos.length === 0 && (
        <p className="py-8 text-center text-sm text-tenue">Nada por revisar.</p>
      )}
    </Hoja>
  );
}
