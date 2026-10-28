import { randomUUID } from 'node:crypto';
import { formatLocalDateTime } from '@/domain/sla';
import { CATEGORIES, PRIORITY_LABEL, type Category } from '@/domain/types';
import type { DraftView, MessageView, TraceStep, TurnTrace } from '@/shared/chat';
import type { Person } from '../../seed/people';
import { HttpError } from './http-error';
import type { AppStore } from './store';
import { TicketServiceError, type CallInfo, type TicketsClient } from './tickets-client';
import { toSummary } from './ticket-view';

/**
 * Confirmação de rascunho: executada pelo servidor, sem passar pelo modelo.
 * É isso que garante a regra "só cria ou atualiza depois da confirmação" —
 * o agent não tem nenhuma ferramenta que grave no sistema de chamados.
 */

async function loadOwnDraft(store: AppStore, person: Person, draftId: string) {
  const found = await store.getDraft(draftId);
  const conversation = found && await store.getConversation(found.conversationId);
  if (!found || !conversation || conversation.userEmail !== person.email) throw new HttpError(404, 'Rascunho não encontrado.');
  if (found.draft.status !== 'pending') throw new HttpError(409, 'Este rascunho já foi confirmado ou cancelado.');
  if (conversation.status === 'closed') throw new HttpError(409, 'Esta conversa foi encerrada.');
  return { draft: found.draft, conversation };
}

function deterministicTrace(step: TraceStep, intent: string, rationale: string): TurnTrace {
  return {
    steps: [step],
    decision: { intent, action: 'acao_confirmada', confidence: 1, rationale, rules: ['Só cria ou atualiza após confirmação do funcionário'] },
    guards: [],
    model: 'nenhum (ação executada pelo servidor)',
    latencyMs: step.durationMs ?? 0,
    usage: null,
    costUsd: null,
    error: null,
  };
}

export async function confirmDraft(
  store: AppStore,
  person: Person,
  draftId: string,
  tickets: (onCall: (i: CallInfo) => void) => TicketsClient,
  now = new Date(),
): Promise<{ draft: DraftView; messages: MessageView[] }> {
  const { draft, conversation } = await loadOwnDraft(store, person, draftId);
  let attempts = 0;
  const client = tickets((i) => (attempts = i.attempts));
  const started = Date.now();
  // A chave de idempotência é o próprio rascunho: clicar duas vezes ou
  // retentar após uma queda do sistema nunca cria dois chamados.
  const key = `draft:${draft.id}`;
  let ticket;
  try {
    ticket =
      draft.kind === 'create'
        ? await client.createTicket(
            {
              type: draft.type,
              title: draft.title,
              description: draft.description,
              category: draft.category,
              subcategory: draft.subcategory,
              priority: draft.priority,
              affected: draft.affected,
            },
            key,
          )
        : draft.kind === 'update'
          ? await client.addComment(draft.ticketId!, draft.note!, key)
          : await client.reopen(draft.ticketId!, draft.note!, key);
  } catch (e) {
    if (e instanceof TicketServiceError && e.code === 'unavailable') {
      throw new HttpError(503, 'O sistema de chamados está instável agora. Seu rascunho continua salvo — tente confirmar de novo em alguns segundos.');
    }
    throw new HttpError(422, e instanceof Error ? e.message : 'Não foi possível gravar o chamado.');
  }

  const confirmed: DraftView = { ...draft, status: 'confirmed', ticketId: ticket.id };
  await store.saveDraft(conversation.id, confirmed);
  await store.updateConversation(conversation.id, { focusTicketId: ticket.id });

  const userMsg = await store.addMessage(conversation.id, { role: 'user', authorName: person.name, content: `Confirmo o rascunho ${draft.id}.` });
  const due = ticket.sla.dueAt ? formatLocalDateTime(ticket.sla.dueAt, now) : null;
  const text =
    draft.kind === 'create'
      ? `Pronto: abri o ${ticket.id} com prioridade ${PRIORITY_LABEL[ticket.priority].toLowerCase()}.${due ? ` Um analista responde até ${due}.` : ''}`
      : draft.kind === 'update'
        ? `Pronto: adicionei a informação ao ${ticket.id}. O analista responsável já consegue ver.`
        : `Pronto: reabri o ${ticket.id}.${due ? ` Um analista responde até ${due}.` : ''}`;
  const label = draft.kind === 'create' ? 'criou o chamado' : draft.kind === 'update' ? `atualizou o ${ticket.id}` : `reabriu o ${ticket.id}`;
  const step: TraceStep = {
    id: randomUUID(),
    tool: draft.kind === 'create' ? 'criar_chamado' : draft.kind === 'update' ? 'comentar_chamado' : 'reabrir_chamado',
    label,
    status: 'ok',
    input: { rascunho: draft.id },
    output: `${ticket.id} gravado no sistema de chamados`,
    durationMs: Date.now() - started,
    attempts,
    visible: true,
  };
  const reply = await store.addMessage(conversation.id, {
    role: 'assistant',
    authorName: 'Nexo Assist',
    content: text,
    ui: [{ type: 'ticket', ticket: toSummary(ticket) }],
    trace: deterministicTrace(step, `Funcionário confirmou o rascunho ${draft.id}.`, 'Gravação feita pelo servidor após o clique em Confirmar; o modelo não grava chamados.'),
  });
  return { draft: confirmed, messages: [userMsg, reply] };
}

export async function cancelDraft(store: AppStore, person: Person, draftId: string): Promise<{ draft: DraftView; messages: MessageView[] }> {
  const { draft, conversation } = await loadOwnDraft(store, person, draftId);
  const cancelled: DraftView = { ...draft, status: 'cancelled' };
  await store.saveDraft(conversation.id, cancelled);
  const userMsg = await store.addMessage(conversation.id, { role: 'user', authorName: person.name, content: `Cancelo o rascunho ${draft.id}.` });
  const reply = await store.addMessage(conversation.id, {
    role: 'assistant',
    authorName: 'Nexo Assist',
    content: 'Tudo bem, descartei o rascunho. Se quiser, me conte o que ajustar ou como posso ajudar.',
  });
  return { draft: cancelled, messages: [userMsg, reply] };
}

export interface DraftEdit {
  title?: string;
  description?: string;
  category?: string;
  note?: string;
}

/** Edição direta no card. Prioridade e afetados não são editáveis aqui: vêm da regra. */
export async function editDraft(store: AppStore, person: Person, draftId: string, edit: DraftEdit): Promise<DraftView> {
  const { draft, conversation } = await loadOwnDraft(store, person, draftId);
  const title = edit.title?.trim();
  const description = edit.description?.trim();
  const note = edit.note?.trim();
  if (title !== undefined && (title.length < 5 || title.length > 120)) throw new HttpError(400, 'O título precisa ter entre 5 e 120 caracteres.');
  if (description !== undefined && (description.length < 10 || description.length > 2000)) throw new HttpError(400, 'A descrição precisa ter entre 10 e 2000 caracteres.');
  if (note !== undefined && (note.length < 5 || note.length > 1000)) throw new HttpError(400, 'O complemento precisa ter entre 5 e 1000 caracteres.');
  if (edit.category !== undefined && !CATEGORIES.includes(edit.category as Category)) throw new HttpError(400, 'Categoria inválida.');
  const updated: DraftView = {
    ...draft,
    ...(title !== undefined && draft.kind === 'create' ? { title } : {}),
    ...(description !== undefined && draft.kind === 'create' ? { description } : {}),
    ...(edit.category !== undefined && draft.kind === 'create' ? { category: edit.category as Category } : {}),
    ...(note !== undefined && draft.kind !== 'create' ? { note } : {}),
  };
  await store.saveDraft(conversation.id, updated);
  return updated;
}
