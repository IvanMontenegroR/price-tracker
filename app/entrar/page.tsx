"use client";

import { useState } from "react";
import { clienteNavegador } from "@/lib/supabase/navegador";

export default function Entrar() {
  const [email, setEmail] = useState("");
  const [estado, setEstado] = useState<"quieto" | "enviando" | "listo" | "error">("quieto");
  const [detalle, setDetalle] = useState("");

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEstado("enviando");
    const sb = clienteNavegador();
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    });
    if (error) {
      setEstado("error");
      setDetalle(error.message);
      return;
    }
    setEstado("listo");
  }

  return (
    <main className="mx-auto max-w-sm pt-16">
      <h1 className="text-xl font-semibold">Precio puesto</h1>
      <p className="mt-1 text-sm text-[color:var(--color-tenue)]">
        Lo que cuesta de verdad, puesto en Asunción.
      </p>
      {estado === "listo" ? (
        <p className="mt-8 text-sm">Te mandé el enlace por mail. Abrilo desde este dispositivo.</p>
      ) : (
        <form onSubmit={enviar} className="mt-8 flex gap-2">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@mail.com"
            className="flex-1 rounded-md border border-[color:var(--color-borde)] bg-[color:var(--color-panel)] px-3 py-2 text-sm"
          />
          <button
            disabled={estado === "enviando"}
            className="rounded-md bg-[color:var(--color-verde)] px-3 py-2 text-sm font-medium text-black disabled:opacity-50"
          >
            Entrar
          </button>
        </form>
      )}
      {estado === "error" && <p className="mt-3 text-sm text-red-400">{detalle}</p>}
    </main>
  );
}
