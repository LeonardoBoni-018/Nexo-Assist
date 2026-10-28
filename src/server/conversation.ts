import { formatLocalDateTime } from '@/domain/sla';
import type { ConversationView, DraftView, MessageView } from '@/shared/chat';
import type { HandoffRequest } from './agent/recorder';
import type { AppStore, ConversationRow } from './store';

export async function conversationView(store: AppStore, c: ConversationRow, messageLimit: number): Promise<ConversationView> {
  const [messages, drafts] = await Promise.all([store.listMessages(c.id), store.listDrafts(c.id)]);
  return {
    id: c.id,
    status: c.status,
    userMessageCount: c.userMessageCount,
    messageLimit,
    assignedAnalyst: c.assignedAnalystName,
    handoff: c.handoff,
    messages,
    drafts,
  };
}

/** Marca a conversa como aguardando atendente; o agent para de responder. */
export async function applyHandoff(store: AppStore, conversationId: string, h: HandoffRequest, now = new Date()): Promise<MessageView> {
  await store.updateConversation(conversationId, {
    status: 'waiting_human',
    handoff: { level: h.level, reason: h.reason, summary: h.summary, at: now.toISOString(), lowConfidence: h.lowConfidence },
    unreadForAnalyst: 1,
    ...(h.ticketId ? { focusTicketId: h.ticketId } : {}),
  });
  return store.addMessage(conversationId, {
    role: 'system',
    authorName: 'Sistema',
    content: `Transferida para Suporte ${h.level} · ${formatLocalDateTime(now.toISOString(), now)}`,
  });
}

/**
 * Converte o histórico salvo em mensagens para o modelo. Cards viram notas
 * curtas entre colchetes (o modelo precisa saber o que o funcionário viu,
 * não o JSON inteiro), e o estado atual dos rascunhos é refletido.
 */
export function historyForModel(messages: MessageView[], drafts: Record<string, DraftView>, maxMessages = 16) {
  type ModelMessage = { role: 'user'; content: string } | { role: 'assistant'; content: string };
  const out: ModelMessage[] = [];
  for (const m of messages.slice(-maxMessages)) {
    if (m.role === 'user') {
      out.push({ role: 'user', content: m.content });
      continue;
    }
    const notes = m.ui.map((b) => {
      switch (b.type) {
        case 'options':
          return `[mostrei a pergunta "${b.question}" com opções: ${b.options.join(' | ')}]`;
        case 'ticket_selector':
          return `[mostrei seletor de chamados: ${b.tickets.map((t) => t.id).join(', ')}]`;
        case 'ticket':
          return `[mostrei o card do ${b.ticket.id} (${b.ticket.status}${b.ticket.overdue ? ', vencido' : ''})]`;
        case 'draft': {
          const d = drafts[b.draftId];
          const state = !d ? 'desconhecido' : d.status === 'confirmed' ? `confirmado → ${d.ticketId}` : d.status === 'cancelled' ? 'cancelado pelo funcionário' : d.status === 'failed' ? 'falhou ao gravar' : 'aguardando confirmação';
          return `[rascunho ${b.draftId}: "${d?.title ?? ''}" — ${state}]`;
        }
        case 'articles':
          return `[citei artigos: ${b.articles.map((a) => a.id).join(', ')}]`;
        case 'handoff':
          return `[transferi para Suporte ${b.level}]`;
      }
    });
    const prefix = m.role === 'analyst' ? `[Analista ${m.authorName}]: ` : m.role === 'system' ? '[Sistema]: ' : '';
    out.push({ role: 'assistant', content: [prefix + m.content, ...notes].filter(Boolean).join('\n') });
  }
  // Mensagens consecutivas do mesmo papel são unidas; a primeira precisa ser do usuário.
  const merged: typeof out = [];
  for (const m of out) {
    const last = merged[merged.length - 1];
    if (last && last.role === m.role) last.content += `\n\n${m.content}`;
    else merged.push({ ...m });
  }
  while (merged[0]?.role === 'assistant') merged.shift();
  return merged;
}
