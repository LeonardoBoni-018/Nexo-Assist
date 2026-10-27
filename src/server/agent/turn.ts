import { Agent } from '@mastra/core/agent';
import type { LanguageModelV4 } from '@ai-sdk/provider';
import type { MessageView, StreamEvent, TurnTrace } from '@/shared/chat';
import type { Person } from '../../../seed/people';
import { applyHandoff, historyForModel } from '../conversation';
import type { AppStore, ConversationRow } from '../store';
import type { CallInfo, TicketsClient } from '../tickets-client';
import { estimateCostUsd } from './model';
import { INSTRUCTIONS, turnContext } from './prompt';
import { TurnRecorder } from './recorder';
import { createNexoTools, MOTIVOS } from './tools';

type AgentModel = ConstructorParameters<typeof Agent>[0]['model'];

export interface TurnDeps {
  store: AppStore;
  /** Modelo do AI SDK (Anthropic em produção; roteirizado nos testes). */
  model: LanguageModelV4;
  modelName: string;
  providerOptions?: Record<string, Record<string, unknown>>;
  tickets: (onCall: (info: CallInfo) => void) => TicketsClient;
  messageLimit: number;
  minConfidence: number;
  now?: () => Date;
}

export interface TurnInput {
  person: Person;
  conversation: ConversationRow;
  text: string;
  emit: (e: StreamEvent) => void;
  signal?: AbortSignal;
}

const MAX_STEPS = 6;

/**
 * Um turno do agent: salva a mensagem do funcionário, roda o modelo com as
 * ferramentas, transmite texto e etapas em tempo real, aplica as
 * salvaguardas do servidor e grava a resposta com o rastro completo.
 */
export async function runTurn(deps: TurnDeps, input: TurnInput): Promise<MessageView> {
  const { store } = deps;
  const now = deps.now ?? (() => new Date());
  const { person, conversation, emit } = input;
  const started = Date.now();

  const userMessage = store.addMessage(conversation.id, { role: 'user', authorName: person.name, content: input.text });
  emit({ type: 'user_message', message: userMessage });

  const recorder = new TurnRecorder(emit);
  const tools = createNexoTools({ conversationId: conversation.id, store, recorder, tickets: deps.tickets, now });
  const agent = new Agent({
    id: 'nexo-assist',
    name: 'Nexo Assist',
    instructions: INSTRUCTIONS,
    // O Mastra embute uma cópia própria dos tipos do AI SDK; em runtime o contrato (v4) é o mesmo.
    model: deps.model as unknown as AgentModel,
    tools,
  });

  const drafts = store.listDrafts(conversation.id);
  const fresh = store.getConversation(conversation.id) ?? conversation;
  const history = historyForModel(store.listMessages(conversation.id), drafts);
  const last = history[history.length - 1];
  if (last?.role === 'user') {
    last.content += `\n\n${turnContext(person, {
      now: now(),
      messagesUsed: fresh.userMessageCount,
      messageLimit: deps.messageLimit,
      pendingDrafts: Object.values(drafts).filter((d) => d.status === 'pending'),
      focusTicketId: fresh.focusTicketId,
    })}`;
  }

  let text = '';
  let currentTextId: string | null = null;
  let error: string | null = null;
  let usage: TurnTrace['usage'] = null;

  try {
    const stream = await agent.stream(history, {
      maxSteps: MAX_STEPS,
      modelSettings: { maxOutputTokens: 1500 },
      ...(deps.providerOptions ? { providerOptions: deps.providerOptions as never } : {}),
      ...(input.signal ? { abortSignal: input.signal } : {}),
    });
    for await (const chunk of stream.fullStream) {
      if (chunk.type === 'text-delta') {
        // Texto de etapas diferentes (antes/depois de ferramentas) vira parágrafos.
        const delta = currentTextId && currentTextId !== chunk.payload.id && text ? `\n\n${chunk.payload.text}` : chunk.payload.text;
        currentTextId = chunk.payload.id;
        text += delta;
        emit({ type: 'text', delta });
      } else if (chunk.type === 'error') {
        error = describeError(chunk.payload.error);
      }
    }
    const u = await stream.usage;
    usage = {
      inputTokens: u?.inputTokens ?? 0,
      outputTokens: u?.outputTokens ?? 0,
      cachedInputTokens: u?.cachedInputTokens ?? 0,
    };
  } catch (e) {
    error = describeError(e);
  }

  // ---------- salvaguardas do servidor ----------
  if (error) {
    recorder.guards.push(`Falha ao chamar o modelo: ${error}`);
    if (!text) {
      text = 'Tive um problema para processar sua mensagem agora. Pode tentar de novo em instantes? Se preferir, peça para falar com um analista.';
      emit({ type: 'text', delta: text });
    }
  } else if (!recorder.decision) {
    recorder.guards.push('O modelo não registrou a decisão deste turno.');
  }

  const decision = recorder.decision;
  if (!error && decision && decision.confidence < deps.minConfidence && !recorder.handoff) {
    recorder.handoff = {
      level: 'N1',
      reason: MOTIVOS.sem_seguranca,
      summary: `O agent não teve segurança para decidir (confiança ${Math.round(decision.confidence * 100)}%). Entendimento: ${decision.intent}. Motivo: ${decision.rationale}`,
      ticketId: fresh.focusTicketId,
      lowConfidence: decision.confidence,
    };
    recorder.guards.push(`Confiança ${Math.round(decision.confidence * 100)}% abaixo do mínimo (${Math.round(deps.minConfidence * 100)}%): conversa transferida para um analista.`);
    recorder.addUi({ type: 'handoff', level: 'N1', reason: MOTIVOS.sem_seguranca });
    const note = `${text ? '\n\n' : ''}Não tenho segurança para resolver isso sozinho, então chamei um analista para continuar com você.`;
    text += note;
    emit({ type: 'text', delta: note });
  } else if (recorder.handoff && decision) {
    recorder.handoff.lowConfidence = decision.confidence < deps.minConfidence ? decision.confidence : null;
  }

  if (!text.trim()) {
    text = recorder.ui.some((b) => b.type === 'draft') ? 'Confira o rascunho abaixo.' : 'Pode me contar um pouco mais?';
    recorder.guards.push('Resposta sem texto: mensagem padrão adicionada.');
    emit({ type: 'text', delta: text });
  }

  const trace: TurnTrace = {
    steps: recorder.steps,
    decision,
    guards: recorder.guards,
    model: deps.modelName,
    latencyMs: Date.now() - started,
    usage,
    costUsd: usage ? estimateCostUsd(deps.modelName, usage) : null,
    error,
  };
  const message = store.addMessage(conversation.id, { role: 'assistant', authorName: 'Nexo Assist', content: text.trim(), ui: recorder.ui, trace });
  if (recorder.handoff) applyHandoff(store, conversation.id, recorder.handoff, now());

  const after = store.getConversation(conversation.id)!;
  emit({ type: 'done', message, conversation: { status: after.status, userMessageCount: after.userMessageCount, handoff: after.handoff } });
  return message;
}

function describeError(e: unknown): string {
  if (e instanceof Error) return e.message.slice(0, 300);
  if (typeof e === 'string') return e.slice(0, 300);
  return 'erro desconhecido';
}
