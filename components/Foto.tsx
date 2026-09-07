"use client";

import { useState } from "react";
import { Icono } from "./ui";

/**
 * La foto de la publicación, con su respaldo.
 *
 * Viene de la tienda, así que puede faltar, tardar o dar 404 —eBay rota las
 * URLs de imagen—. Una tarjeta rota se ve peor que una sin foto, así que el
 * respaldo es parte del componente y no una excepción.
 */
export function Foto({ src, alt, className = "" }: { src: string | null; alt: string; className?: string }) {
  const [falla, setFalla] = useState(false);

  if (!src || falla) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center rounded-xl border border-borde-suave bg-panel-alto text-apagado ${className}`}
        aria-hidden
      >
        <Icono nombre="caja" className="h-6 w-6" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFalla(true)}
      className={`shrink-0 rounded-xl border border-borde-suave bg-panel-alto object-contain ${className}`}
    />
  );
}
