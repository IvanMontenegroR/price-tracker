"use client";

import { useState, useTransition } from "react";

type Accion = (datos: FormData) => Promise<{ error?: string; ok?: boolean }>;

/**
 * Envuelve una server action que devuelve un resultado y muestra el error al
 * lado del formulario. Sin esto el error se pierde: <form action> exige que la
 * acción no devuelva nada, y un objetivo que no se guardó en silencio es
 * exactamente la clase de falla que arruina la herramienta.
 */
export function FormaAccion({
  accion,
  children,
  className,
}: {
  accion: Accion;
  children: React.ReactNode;
  className?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [, empezar] = useTransition();

  return (
    <div>
      <form
        className={className}
        action={(datos) =>
          empezar(async () => {
            const r = await accion(datos);
            setError(r?.error ?? null);
          })
        }
      >
        {children}
      </form>
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}
