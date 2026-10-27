import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { analystMessage, closeConversation, returnToAgent, takeOver } from '@/server/console';
import { historyForModel } from '@/server/conversation';
import { cancelDraft, confirmDraft } from '@/server/drafts';
import { createSessionToken, verifySessionToken } from '@/server/session-token';
import type { DraftView } from '@/shared/chat';
import { startHarness } from './helpers/harness';

const ANA = 'ana.souza@nexo.com.br';

describe('rascunhos, console do analista e histórico', () => {
  let h: Awaited<ReturnType<typeof startHarness>>;
  beforeAll(async () => {
    h = await startHarness();
  });
  afterAll(async () => h.close());

  function pendingDraft(conversationId: string): DraftView {
    const draft: DraftView = {
      id: h.store.nextDraftId(),
      kind: 'create',
      status: 'pending',
      ticketId: null,
      type: 'INC',
      title: 'Mouse sem funcionar',
      description: 'O mouse sem fio parou de funcionar mesmo com pilha nova.',
      category: 'Hardware',
      subcategory: null,
      priority: 'media',
      priorityRule: 'Média: atrapalha, mas há alternativa.',
      affected: 'individual',
      dueAt: new Date().toISOString(),
      note: null,
    };
    h.store.saveDraft(conversationId, draft);
    return draft;
  }

  it('confirmar cria o chamado uma vez; segunda confirmação é recusada', async () => {
    const ana = h.store.findUser(ANA)!;
    const conv = h.store.createConversation(ANA);
    const draft = pendingDraft(conv.id);
    const { draft: done, messages } = await confirmDraft(h.store, ana, draft.id, h.ticketsAs(ANA));
    expect(done.status).toBe('confirmed');
    expect(messages[1]!.ui[0]).toMatchObject({ type: 'ticket' });
    expect(messages[1]!.trace!.model).toContain('servidor');
    await expect(confirmDraft(h.store, ana, draft.id, h.ticketsAs(ANA))).rejects.toMatchObject({ status: 409 });
  });

  it('com o legado fora do ar, o rascunho continua pendente para nova tentativa', async () => {
    const ana = h.store.findUser(ANA)!;
    const conv = h.store.createConversation(ANA);
    const draft = pendingDraft(conv.id);
    h.service.failureRate = 1;
    try {
      await expect(confirmDraft(h.store, ana, draft.id, h.ticketsAs(ANA))).rejects.toMatchObject({ status: 503 });
    } finally {
      h.service.failureRate = 0;
    }
    expect(h.store.getDraft(draft.id)!.draft.status).toBe('pending');
    expect((await confirmDraft(h.store, ana, draft.id, h.ticketsAs(ANA))).draft.status).toBe('confirmed');
  });

  it('ninguém confirma rascunho de outra pessoa', async () => {
    const conv = h.store.createConversation(ANA);
    const draft = pendingDraft(conv.id);
    const bruno = h.store.findUser('bruno.tavares@nexo.com.br')!;
    await expect(confirmDraft(h.store, bruno, draft.id, h.ticketsAs(bruno.email))).rejects.toMatchObject({ status: 404 });
    expect(cancelDraft(h.store, h.store.findUser(ANA)!, draft.id).draft.status).toBe('cancelled');
  });

  it('assumir pausa o agent; só quem assumiu responde, devolve ou encerra', async () => {
    const rafael = h.store.findUser('rafael.lima@nexo.com.br')!;
    const juliana = h.store.findUser('juliana.costa@nexo.com.br')!;
    const conv = h.store.createConversation(ANA);
    h.store.addMessage(conv.id, { role: 'user', authorName: 'Ana Souza', content: 'Quero falar com alguém' });

    expect(() => analystMessage(h.store, rafael, conv.id, 'oi')).toThrow('Assuma o atendimento');
    await takeOver(h.store, rafael, conv.id, h.ticketsAs(rafael.email, 'analyst')());
    expect(h.store.getConversation(conv.id)!.status).toBe('human');
    await expect(takeOver(h.store, juliana, conv.id, h.ticketsAs(juliana.email, 'analyst')())).rejects.toMatchObject({ status: 409 });
    expect(analystMessage(h.store, rafael, conv.id, 'Oi, Ana!').role).toBe('analyst');
    expect(() => returnToAgent(h.store, juliana, conv.id)).toThrow();

    returnToAgent(h.store, rafael, conv.id);
    expect(h.store.getConversation(conv.id)).toMatchObject({ status: 'agent', assignedAnalystEmail: null, handoff: null });
    closeConversation(h.store, rafael, conv.id);
    expect(h.store.getConversation(conv.id)!.status).toBe('closed');
  });

  it('histórico para o modelo resume cards e reflete o estado atual do rascunho', async () => {
    const conv = h.store.createConversation(ANA);
    const draft = pendingDraft(conv.id);
    h.store.addMessage(conv.id, { role: 'assistant', authorName: 'Nexo Assist', content: 'Olá!' }); // antes do usuário: descartada
    h.store.addMessage(conv.id, { role: 'user', authorName: 'Ana', content: 'Meu mouse parou' });
    h.store.addMessage(conv.id, { role: 'assistant', authorName: 'Nexo Assist', content: 'Confira:', ui: [{ type: 'draft', draftId: draft.id }] });
    h.store.addMessage(conv.id, { role: 'system', authorName: 'Sistema', content: 'Transferida para Suporte N1' });
    h.store.saveDraft(conv.id, { ...draft, status: 'confirmed', ticketId: 'INC-99999' });

    const history = historyForModel(h.store.listMessages(conv.id), h.store.listDrafts(conv.id));
    expect(history.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(history[1]!.content).toContain(`[rascunho ${draft.id}: "Mouse sem funcionar" — confirmado → INC-99999]`);
    expect(history[1]!.content).toContain('[Sistema]: Transferida para Suporte N1');
  });
});

describe('sessão', () => {
  it('aceita token válido e recusa adulterado ou expirado', () => {
    const { token } = createSessionToken('ana.souza@nexo.com.br', false, 'segredo', 0);
    expect(verifySessionToken(token, 'segredo', 1000)).toBe('ana.souza@nexo.com.br');
    expect(verifySessionToken(token, 'outro-segredo', 1000)).toBeNull();
    const forged = token.replace(/^[^.]+/, Buffer.from('bruno.tavares@nexo.com.br').toString('base64url'));
    expect(verifySessionToken(forged, 'segredo', 1000)).toBeNull();
    expect(verifySessionToken(token, 'segredo', 13 * 3600 * 1000)).toBeNull();
  });
});
