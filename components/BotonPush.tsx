"use client";

import { useEffect, useState } from "react";

const base64ABuffer = (base64: string): ArrayBuffer => {
  const relleno = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + relleno).replace(/-/g, "+").replace(/_/g, "/");
  const crudo = atob(b64);
  const bytes = new Uint8Array(crudo.length);
  for (let i = 0; i < crudo.length; i++) bytes[i] = crudo.charCodeAt(i);
  return bytes.buffer;
};

/**
 * El push es el canal rápido, no el confiable: en iOS solo existe si la app
 * está instalada en la pantalla de inicio. Por eso el botón dice qué pasa y
 * el mail sale igual.
 */
export function BotonPush({ clavePublica }: { clavePublica: string | null }) {
  const [estado, setEstado] = useState<string>("");
  const [suscrito, setSuscrito] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setEstado("este navegador no soporta push");
      return;
    }
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((s) => setSuscrito(!!s))
      .catch(() => {});
  }, []);

  async function activar() {
    if (!clavePublica) return setEstado("faltan las claves VAPID en el servidor");
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const permiso = await Notification.requestPermission();
      if (permiso !== "granted") return setEstado("permiso denegado");

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64ABuffer(clavePublica),
      });
      const res = await fetch("/api/push/suscribir", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sub),
      });
      if (!res.ok) return setEstado(`no se pudo guardar: ${await res.text()}`);
      setSuscrito(true);
      setEstado("push activo en este dispositivo");
    } catch (e) {
      setEstado(String((e as Error).message));
    }
  }

  return (
    <div className="text-xs text-[color:var(--color-tenue)]">
      {suscrito ? (
        <span>Push activo en este dispositivo. El mail sale igual.</span>
      ) : (
        <button onClick={activar} className="underline underline-offset-2 hover:text-[color:var(--color-tinta)]">
          Activar push en este dispositivo
        </button>
      )}
      {estado && <span className="ml-2">· {estado}</span>}
    </div>
  );
}
