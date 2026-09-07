import type { NextConfig } from "next";

// GitHub Pages sirve el sitio desde /<repo>/, no desde la raíz.
// PAGES=1 lo activa en el workflow; en local queda en la raíz.
const enPages = process.env.PAGES === "1";
const repo = "/price-tracker";

const config: NextConfig = {
  // Sitio estático: no hay servidor propio. El recolector y el envío de
  // avisos viven en una edge function de Supabase, que es el único lugar
  // donde puede estar la service_role. Nada de eso toca al navegador.
  output: "export",
  basePath: enPages ? repo : "",
  assetPrefix: enPages ? repo : "",
  images: { unoptimized: true },
  devIndicators: false,
};

export default config;
