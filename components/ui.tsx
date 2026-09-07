"use client";

import type { ReactNode } from "react";

/** Piezas chicas, para que las pantallas no repitan clases. */

export function Chip({
  children,
  tono = "neutro",
  titulo,
}: {
  children: ReactNode;
  tono?: "neutro" | "verde" | "ambar" | "rojo";
  titulo?: string;
}) {
  const tonos = {
    neutro: "bg-panel-alto text-tenue border-borde",
    verde: "bg-verde/10 text-verde border-verde/20",
    ambar: "bg-ambar/10 text-ambar border-ambar/20",
    rojo: "bg-rojo/10 text-rojo border-rojo/20",
  };
  return (
    <span
      title={titulo}
      className={`compacto inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] leading-5 font-medium ${tonos[tono]}`}
    >
      {children}
    </span>
  );
}

export function Boton({
  children,
  variante = "suave",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variante?: "fuerte" | "suave" | "fantasma" }) {
  const variantes = {
    fuerte: "bg-verde text-black hover:brightness-110 font-semibold",
    suave: "bg-panel-alto text-tinta border border-borde hover:border-tenue/40",
    fantasma: "text-tenue hover:text-tinta",
  };
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-3.5 py-2 text-sm transition disabled:opacity-40 ${variantes[variante]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Campo({
  etiqueta,
  ayuda,
  className = "",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { etiqueta: string; ayuda?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-tenue">{etiqueta}</span>
      <input
        {...props}
        className={`w-full rounded-xl border border-borde bg-fondo px-3 py-2.5 text-sm text-tinta outline-none transition placeholder:text-apagado focus:border-verde/50 ${className}`}
      />
      {ayuda && <span className="mt-1 block text-[11px] text-apagado">{ayuda}</span>}
    </label>
  );
}

/**
 * En celular sube desde abajo como hoja; en escritorio es un diálogo centrado.
 * Es el mismo componente: cambia dónde se ancla, no qué hace.
 */
export function Hoja({
  abierta,
  cerrar,
  titulo,
  children,
}: {
  abierta: boolean;
  cerrar: () => void;
  titulo: string;
  children: ReactNode;
}) {
  if (!abierta) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={cerrar} />
      <div className="relative max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl border border-borde bg-panel p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:max-w-lg sm:rounded-3xl sm:pb-5">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-borde sm:hidden" />
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">{titulo}</h2>
          <button onClick={cerrar} className="compacto rounded-lg p-1.5 text-tenue hover:text-tinta" aria-label="Cerrar">
            <Icono nombre="cerrar" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Esqueleto({ className = "" }: { className?: string }) {
  return <div className={`esqueleto rounded-lg bg-borde ${className}`} />;
}

const CAMINOS: Record<string, ReactNode> = {
  cerrar: <path d="M18 6 6 18M6 6l12 12" />,
  mas: <path d="M12 5v14M5 12h14" />,
  ajustes: (
    <>
      <path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h8M16 18h4" />
      <circle cx="16" cy="6" r="2" />
      <circle cx="8" cy="12" r="2" />
      <circle cx="14" cy="18" r="2" />
    </>
  ),
  salir: <path d="M15 17l5-5-5-5M20 12H9M11 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h5" />,
  campana: <path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8M13.7 21a2 2 0 0 1-3.4 0" />,
  reloj: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  caja: (
    <>
      <path d="m21 8-9-5-9 5 9 5 9-5Z" />
      <path d="M3 8v8l9 5 9-5V8" />
      <path d="M12 13v8" />
    </>
  ),
  flecha: <path d="M15 18l-6-6 6-6" />,
  afuera: <path d="M14 3h7v7M21 3l-9 9M10 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" />,
};

export function Icono({ nombre, className = "h-4 w-4" }: { nombre: keyof typeof CAMINOS | string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {CAMINOS[nombre]}
    </svg>
  );
}
