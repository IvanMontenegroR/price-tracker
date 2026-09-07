import type { NextConfig } from "next";

const config: NextConfig = {
  // El tracker necesita servidor: cron, service role y envío de avisos.
  // Nada de output: "export" acá.
  experimental: { typedRoutes: true },
};

export default config;
