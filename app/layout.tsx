import type { Metadata, Viewport } from "next";
import "./globals.css";

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const metadata: Metadata = {
  title: "Precio puesto",
  description: "Lo que cuesta de verdad, puesto en Asunción.",
  manifest: `${base}/manifest.json`,
};

export const viewport: Viewport = { themeColor: "#0e0f11" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
