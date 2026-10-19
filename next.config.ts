import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: {
    // O middleware precisa preservar o corpo completo antes de encaminhar uploads às rotas.
    // O padrão do Next.js é 10 MB, menor que os álbuns e vídeos permitidos pelo Juntaê.
    middlewareClientMaxBodySize: 32 * 1024 * 1024,
  },
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;
