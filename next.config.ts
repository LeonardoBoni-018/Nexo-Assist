import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Rodam só no servidor; o PGlite carrega arquivos WASM do próprio pacote.
  serverExternalPackages: ['@mastra/core', '@electric-sql/pglite'],
  poweredByHeader: false,
  agentRules: false,
  devIndicators: false,
};

export default nextConfig;
