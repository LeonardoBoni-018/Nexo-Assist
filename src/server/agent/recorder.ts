import { randomUUID } from 'node:crypto';
import type { Decision, DraftView, StreamEvent, TraceStep, UiBlock } from '@/shared/chat';
import { TicketServiceError, type CallInfo } from '../tickets-client';

export interface HandoffRequest {
  level: 'N1' | 'N2';
  reason: string;
  summary: string;
  ticketId: string | null;
  lowConfidence: number | null;
}

/**
 * Registra tudo o que acontece num turno: cada ferramenta executada (com
 * duração, tentativas e resumo do resultado), os cards gerados, a decisão
 * declarada pelo modelo e as salvaguardas aplicadas pelo servidor. É a base
 * da transparência — o mesmo registro vai para a tela e para o banco.
 */
export class TurnRecorder {
  readonly steps: TraceStep[] = [];
  readonly ui: UiBlock[] = [];
  readonly guards: string[] = [];
  decision: Decision | null = null;
  handoff: HandoffRequest | null = null;

  constructor(private readonly emit: (e: StreamEvent) => void = () => {}) {}

  /**
   * Executa uma ação rastreada. Falhas do sistema de chamados viram um
   * resultado `{ erro }` para o modelo (ele precisa saber para avisar o
   * funcionário) e a etapa fica marcada como erro.
   */
  async run(
    tool: string,
    label: string,
    input: unknown,
    fn: (track: (info: CallInfo) => void) => Promise<{ result: Record<string, unknown>; summary: string }>,
    visible = true,
  ): Promise<Record<string, unknown>> {
    const step: TraceStep = { id: randomUUID(), tool, label, status: 'running', input, output: null, durationMs: null, attempts: null, visible };
    this.steps.push(step);
    this.emit({ type: 'step', step: { ...step } });
    const started = Date.now();
    const track = (info: CallInfo) => {
      step.attempts = Math.max(step.attempts ?? 0, info.attempts);
    };
    try {
      const { result, summary } = await fn(track);
      Object.assign(step, { status: 'ok', output: summary, durationMs: Date.now() - started });
      return result;
    } catch (e) {
      const message =
        e instanceof TicketServiceError
          ? e.code === 'unavailable'
            ? `Sistema de chamados indisponível após ${e.attempts} tentativas.`
            : e.message
          : e instanceof Error
            ? e.message
            : 'Erro inesperado.';
      if (e instanceof TicketServiceError) step.attempts = e.attempts;
      Object.assign(step, { status: 'error', output: message, durationMs: Date.now() - started });
      return { erro: message };
    } finally {
      this.emit({ type: 'step', step: { ...step } });
    }
  }

  /** Etapa determinística instantânea (ex.: "classificou a prioridade"). */
  note(tool: string, label: string, input: unknown, output: string, visible = true) {
    const step: TraceStep = { id: randomUUID(), tool, label, status: 'ok', input, output, durationMs: 0, attempts: null, visible };
    this.steps.push(step);
    this.emit({ type: 'step', step });
  }

  addUi(block: UiBlock, draft?: DraftView) {
    this.ui.push(block);
    this.emit(draft ? { type: 'ui', block, draft } : { type: 'ui', block });
  }
}
