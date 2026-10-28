import { formatLocalDateTime } from '@/domain/sla';
import type { ConversationStatus, MessageView } from '@/shared/chat';
import type { Person } from '../../seed/people';
import { HttpError } from './http-error';
import type { AppStore, ConversationRow } from './store';
import type { TicketsClient } from './tickets-client';

/**
 * Regras do console do analista: assumir (pausa o agent), devolver ao
 * agent, encerrar e responder. Toda transição deixa uma mensagem de sistema
 * no histórico, visível para o funcionário e para o próximo analista.
 */

export interface ConsoleItem {
  id: string;
  userName: string;
  userEmail: string;
  userDepartment: string;
  status: ConversationStatus;
  lastPreview: string;
  updatedAt: string;
  unread: number;
  assignedAnalyst: string | null;
  assignedToMe: boolean;
  /** Etiqueta curta da lista (ex.: "Transferida · INC-20311"). */
  tag: { tone: 'danger' | 'warning' | 'success' | 'muted' | 'primary'; label: string };
  needsHuman: boolean;
}

function tagFor(c: ConversationRow, me: Person): ConsoleItem['tag'] {
  if (c.status === 'waiting_human') {
    if (c.handoff?.lowConfidence != null) return { tone: 'warning', label: `Agent pediu ajuda · confiança ${Math.round(c.handoff.lowConfidence * 100)}%` };
    return { tone: 'danger', label: `Transferida${c.focusTicketId ? ` · ${c.focusTicketId}` : c.handoff ? ` · ${c.handoff.reason}` : ''}` };
  }
  if (c.status === 'human') {
    return c.assignedAnalystEmail === me.email ? { tone: 'success', label: 'Você está atendendo' } : { tone: 'primary', label: `Com ${c.assignedAnalystName}` };
  }
  if (c.status === 'closed') return { tone: 'muted', label: 'Encerrada' };
  return { tone: 'muted', label: 'Agent atendendo' };
}

export async function listForConsole(store: AppStore, me: Person): Promise<ConsoleItem[]> {
  return (await store.listConversations()).map((c) => ({
    id: c.id,
    userName: c.userName,
    userEmail: c.userEmail,
    userDepartment: c.userDepartment,
    status: c.status,
    lastPreview: c.lastPreview,
    updatedAt: c.updatedAt,
    unread: c.unreadForAnalyst,
    assignedAnalyst: c.assignedAnalystName,
    assignedToMe: c.assignedAnalystEmail === me.email,
    tag: tagFor(c, me),
    needsHuman: c.status === 'waiting_human',
  }));
}

async function load(store: AppStore, id: string): Promise<ConversationRow> {
  const c = await store.getConversation(id);
  if (!c) throw new HttpError(404, 'Conversa não encontrada.');
  return c;
}

const stamp = (now: Date) => formatLocalDateTime(now.toISOString(), now);

export async function takeOver(store: AppStore, me: Person, id: string, tickets: TicketsClient, now = new Date()): Promise<MessageView> {
  const c = await load(store, id);
  if (c.status === 'closed') throw new HttpError(409, 'Conversa encerrada.');
  if (c.status === 'human' && c.assignedAnalystEmail !== me.email) throw new HttpError(409, `${c.assignedAnalystName} já está atendendo esta conversa.`);
  await store.updateConversation(id, { status: 'human', assignedAnalystEmail: me.email, assignedAnalystName: me.name, unreadForAnalyst: 0 });
  if (c.focusTicketId) {
    // Melhor esforço: o atendimento segue mesmo se o legado estiver fora.
    await tickets.setStatus(c.focusTicketId, 'em_andamento', `Assumido por ${me.name}`).catch(() => undefined);
  }
  return await store.addMessage(id, { role: 'system', authorName: 'Sistema', content: `${me.name} assumiu · agent pausado · ${stamp(now)}` });
}

export async function returnToAgent(store: AppStore, me: Person, id: string, now = new Date()): Promise<MessageView> {
  const c = await load(store, id);
  if (c.status === 'closed') throw new HttpError(409, 'Conversa encerrada.');
  if (c.status === 'human' && c.assignedAnalystEmail !== me.email) throw new HttpError(409, 'Só quem está atendendo pode devolver a conversa.');
  await store.updateConversation(id, { status: 'agent', assignedAnalystEmail: null, assignedAnalystName: null, handoff: null, unreadForAnalyst: 0 });
  return await store.addMessage(id, { role: 'system', authorName: 'Sistema', content: `${me.name} devolveu a conversa ao Nexo Assist · ${stamp(now)}` });
}

export async function closeConversation(store: AppStore, me: Person, id: string, now = new Date()): Promise<MessageView> {
  const c = await load(store, id);
  if (c.status === 'closed') throw new HttpError(409, 'Conversa já encerrada.');
  if (c.status === 'human' && c.assignedAnalystEmail !== me.email) throw new HttpError(409, 'Só quem está atendendo pode encerrar a conversa.');
  await store.updateConversation(id, { status: 'closed', unreadForAnalyst: 0 });
  return await store.addMessage(id, { role: 'system', authorName: 'Sistema', content: `Atendimento encerrado por ${me.name} · ${stamp(now)}` });
}

export async function analystMessage(store: AppStore, me: Person, id: string, text: string): Promise<MessageView> {
  const c = await load(store, id);
  if (c.status !== 'human' || c.assignedAnalystEmail !== me.email) throw new HttpError(409, 'Assuma o atendimento para responder.');
  const content = text.trim();
  if (!content || content.length > 2000) throw new HttpError(400, 'Mensagem vazia ou longa demais.');
  return await store.addMessage(id, { role: 'analyst', authorName: me.name, content });
}

export async function markRead(store: AppStore, id: string) {
  await store.updateConversation(id, { unreadForAnalyst: 0 });
}
