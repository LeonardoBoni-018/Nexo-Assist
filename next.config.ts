import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Mastra e o driver nativo de SQLite do Node rodam só no servidor.
  serverExternalPackages: ['@mastra/core'],
  poweredByHeader: false,
};

export default nextConfig;
