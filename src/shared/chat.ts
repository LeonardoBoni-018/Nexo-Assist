// Tipos trocados entre servidor e interface (chat e console do analista).

import type { Affected, Category, Priority, TicketStatus, TicketType } from '@/domain/types';

export type ConversationStatus =
  | 'agent' // o Nexo Assist está atendendo
  | 'waiting_human' // transferida, aguardando um analista
  | 'human' // um analista assumiu; o agent está pausado
  | 'closed'; // encerrada

export type MessageRole = 'user' | 'assistant' | 'analyst' | 'system';

/** Resumo de chamado usado nos cards. */
export interface TicketSummary {
  id: string;
  type: TicketType;
  title: string;
  description: string;
  category: Category;
  subcategory: string | null;
  priority: Priority;
  status: TicketStatus;
  affected: Affected;
  createdAt: string;
  updatedAt: string;
  dueAt: string | null;
  overdue: boolean;
  slaLabel: string;
}

export interface DraftView {
  id: string; // D-381
  kind: 'create' | 'update' | 'reopen';
  status: 'pending' | 'confirmed' | 'cancelled' | 'failed';
  /** Chamado alvo (update/reopen) ou resultante (create confirmado). */
  ticketId: string | null;
  type: TicketType;
  title: string;
  description: string;
  category: Category;
  subcategory: string | null;
  priority: Priority;
  priorityRule: string;
  affected: Affected;
  dueAt: string;
  /** Texto do comentário (update) ou motivo (reopen). */
  note: string | null;
}

/** Blocos de interface que acompanham uma resposta do agent. */
export type UiBlock =
  | { type: 'options'; question: string; options: string[] }
  | { type: 'ticket_selector'; prompt: string; tickets: TicketSummary[] }
  | { type: 'ticket'; ticket: TicketSummary }
  | { type: 'draft'; draftId: string }
  | { type: 'articles'; articles: Array<{ id: string; title: string }> }
  | { type: 'handoff'; level: 'N1' | 'N2'; reason: string };

// ---------- transparência ----------

export interface TraceStep {
  id: string;
  tool: string;
  /** Rótulo humano, ex.: "consultou seus chamados". */
  label: string;
  status: 'running' | 'ok' | 'error';
  input: unknown;
  /** Resumo do que a ferramenta devolveu, legível. */
  output: string | null;
  durationMs: number | null;
  /** Tentativas no sistema de chamados (>1 indica instabilidade). */
  attempts: number | null;
  /** Aparece na linha de status acima da resposta (ações "de bastidor" ficam só no detalhe). */
  visible: boolean;
}

export interface Decision {
  intent: string;
  action: string;
  /** 0–1 */
  confidence: number;
  rationale: string;
  rules: string[];
}

export interface TurnTrace {
  steps: TraceStep[];
  decision: Decision | null;
  /** Salvaguardas aplicadas pelo servidor (não pelo modelo). */
  guards: string[];
  model: string;
  latencyMs: number;
  usage: { inputTokens: number; outputTokens: number; cachedInputTokens: number } | null;
  costUsd: number | null;
  error: string | null;
}

export interface MessageView {
  id: string;
  role: MessageRole;
  authorName: string;
  content: string;
  ui: UiBlock[];
  trace: TurnTrace | null;
  createdAt: string;
}

export interface ConversationView {
  id: string;
  status: ConversationStatus;
  userMessageCount: number;
  messageLimit: number;
  assignedAnalyst: string | null;
  handoff: { level: 'N1' | 'N2'; reason: string; summary: string; at: string; lowConfidence: number | null } | null;
  messages: MessageView[];
  drafts: Record<string, DraftView>;
}

/** Eventos enviados por SSE durante um turno do agent. */
export type StreamEvent =
  | { type: 'user_message'; message: MessageView }
  | { type: 'step'; step: TraceStep }
  | { type: 'text'; delta: string }
  | { type: 'ui'; block: UiBlock; draft?: DraftView }
  | { type: 'done'; message: MessageView; conversation: Pick<ConversationView, 'status' | 'userMessageCount' | 'handoff'> }
  | { type: 'error'; message: string };
