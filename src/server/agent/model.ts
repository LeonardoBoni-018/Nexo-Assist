import { createAnthropic } from '@ai-sdk/anthropic';
import { env } from '../env';

/** Preço por milhão de tokens (US$): entrada, saída e leitura de cache. */
const PRICING: Record<string, { input: number; output: number; cacheRead: number }> = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01 },
};

export function estimateCostUsd(model: string, u: { inputTokens: number; outputTokens: number; cachedInputTokens: number }): number | null {
  const p = PRICING[model];
  if (!p) return null;
  const uncached = Math.max(0, u.inputTokens - u.cachedInputTokens);
  return (uncached * p.input + u.cachedInputTokens * p.cacheRead + u.outputTokens * p.output) / 1_000_000;
}

export function createModel() {
  const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return anthropic(env.model);
}

/**
 * Opções do provedor. Esforço baixo: atendimento é conversa com ferramentas,
 * não raciocínio longo. Cache automático do prefixo (instruções + ferramentas
 * + histórico) reduz custo e latência a partir da segunda mensagem.
 */
export function providerOptions() {
  const supportsFallback = env.model === 'claude-opus-5-5' || env.model === 'claude-sonnet-5-5';
  return {
    anthropic: {
      effort: env.effort,
      cacheControl: { type: 'ephemeral' as const },
      ...(supportsFallback ? { fallbacks: 'default' as const } : {}),
    },
  };
}
