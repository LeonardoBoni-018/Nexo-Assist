import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
import type { LanguageModelV4StreamPart } from '@ai-sdk/provider';

/**
 * Modelo "roteirizado" para testes: cada chamada ao modelo devolve a próxima
 * etapa do roteiro (texto e/ou chamadas de ferramenta). Permite testar o
 * fluxo completo do agent — ferramentas, rastro, salvaguardas, persistência —
 * sem rede e de forma determinística.
 */
export type ScriptAction = { text: string } | { tool: string; args: Record<string, unknown> };

let counter = 0;

export function scriptedModel(steps: ScriptAction[][]) {
  let i = 0;
  const calls: unknown[] = [];
  const model = new MockLanguageModelV4({
    provider: 'test',
    modelId: 'scripted',
    doStream: async (options) => {
      calls.push(options);
      const actions = steps[Math.min(i, steps.length - 1)] ?? [];
      i++;
      const parts: LanguageModelV4StreamPart[] = [{ type: 'stream-start', warnings: [] }];
      let hasTool = false;
      for (const a of actions) {
        if ('text' in a) {
          const id = `t${++counter}`;
          parts.push({ type: 'text-start', id }, { type: 'text-delta', id, delta: a.text }, { type: 'text-end', id });
        } else {
          hasTool = true;
          parts.push({ type: 'tool-call', toolCallId: `call_${++counter}`, toolName: a.tool, input: JSON.stringify(a.args) });
        }
      }
      parts.push({
        type: 'finish',
        finishReason: { unified: hasTool ? 'tool-calls' : 'stop', raw: undefined },
        usage: {
          inputTokens: { total: 1000, noCache: 200, cacheRead: 800, cacheWrite: 0 },
          outputTokens: { total: 50, text: 50, reasoning: 0 },
        },
      });
      return { stream: convertArrayToReadableStream(parts) };
    },
  });
  return { model, calls: () => calls.length };
}
