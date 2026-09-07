"use client";

import { useState } from "react";
import { Boton, Campo } from "@/components/ui";
import { clienteNavegador } from "@/lib/supabase/navegador";

export default function Entrar() {
  const [email, setEmail] = useState("");
  const [estado, setEstado] = useState<"quieto" | "enviando" | "listo" | "error">("quieto");
  const [detalle, setDetalle] = useState("");

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEstado("enviando");
    const sb = clienteNavegador();
    // El sitio es estático: no hay ruta que canjee el código. El enlace
    // vuelve a la portada y el cliente lo canjea al cargar.
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}${base}/` },
    });
    if (error) {
      setEstado("error");
      setDetalle(error.message);
      return;
    }
    setEstado("listo");
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-16">
      <div className="mb-8">
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-verde/10">
          <svg viewBox="0 0 64 64" className="h-7 w-7">
            <path
              d="M14 44 L26 30 L36 38 L50 20"
              fill="none"
              stroke="currentColor"
              className="text-verde"
              strokeWidth="6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="50" cy="20" r="4" className="fill-verde" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Precio puesto</h1>
        <p className="mt-2 text-sm leading-relaxed text-tenue">
          Lo que cuesta de verdad un artículo puesto en Asunción: etiqueta, envío, flete, fee e impuesto.
          La única cifra con la que se decide.
        </p>
      </div>

      {estado === "listo" ? (
        <div className="rounded-tarjeta border border-verde/20 bg-verde/5 p-4">
          <p className="text-sm">Te mandé el enlace por mail.</p>
          <p className="mt-1 text-xs text-tenue">Abrilo desde este mismo dispositivo.</p>
        </div>
      ) : (
        <form onSubmit={enviar} className="space-y-3">
          <Campo
            etiqueta="Tu mail"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="vos@mail.com"
          />
          <Boton variante="fuerte" className="w-full" disabled={estado === "enviando"}>
            {estado === "enviando" ? "Enviando…" : "Entrar"}
          </Boton>
        </form>
      )}

      {estado === "error" && (
        <p className="mt-3 rounded-xl border border-rojo/30 bg-rojo/10 px-3 py-2 text-sm text-rojo">{detalle}</p>
      )}
    </main>
  );
}
