import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TicketServiceError } from '@/server/tickets-client';
import { SERVICE_KEY, startHarness } from './helpers/harness';

const ANA = 'ana.souza@nexo.com.br';
const BRUNO = 'bruno.tavares@nexo.com.br';

describe('serviço de chamados', () => {
  let h: Awaited<ReturnType<typeof startHarness>>;
  beforeAll(async () => {
    h = await startHarness();
  });
  afterAll(async () => h.close());

  it('exige a chave do serviço', async () => {
    const res = await fetch(`${h.baseUrl}/tickets`, { headers: { 'x-service-key': 'errada', 'x-actor-email': ANA, 'x-actor-role': 'employee' } });
    expect(res.status).toBe(401);
    const ok = await fetch(`${h.baseUrl}/tickets`, { headers: { 'x-service-key': SERVICE_KEY, 'x-actor-email': ANA, 'x-actor-role': 'employee' } });
    expect(ok.status).toBe(200);
  });

  it('funcionário só vê os próprios chamados (o de outra pessoa responde 404)', async () => {
    const ana = h.ticketsAs(ANA)();
    const mine = await ana.listTickets();
    expect(mine.every((t) => t.requesterEmail === ANA)).toBe(true);
    await expect(ana.getTicket('INC-20402')).rejects.toMatchObject({ code: 'not_found' });
    await expect(ana.listTickets(BRUNO)).rejects.toMatchObject({ code: 'not_found' });
    await expect(ana.addComment('INC-20402', 'tentando comentar', 'k1')).rejects.toBeInstanceOf(TicketServiceError);
  });

  it('analista vê os chamados de qualquer funcionário', async () => {
    const rafael = h.ticketsAs('rafael.lima@nexo.com.br', 'analyst')();
    expect((await rafael.listTickets(BRUNO)).map((t) => t.id)).toContain('INC-20402');
  });

  it('INC-20311 do seed está vencido; INC-20298 está no prazo', async () => {
    const ana = h.ticketsAs(ANA)();
    expect((await ana.getTicket('INC-20311')).sla.overdue).toBe(true);
    expect((await ana.getTicket('INC-20298')).sla.overdue).toBe(false);
  });

  it('idempotência: a mesma chave cria um único chamado', async () => {
    const ana = h.ticketsAs(ANA)();
    const body = { type: 'INC' as const, title: 'Teclado sem funcionar', description: 'O teclado do notebook parou de funcionar.', category: 'Hardware' as const, subcategory: null, priority: 'alta' as const, affected: 'individual' as const };
    const a = await ana.createTicket(body, 'draft:D-1');
    const b = await ana.createTicket(body, 'draft:D-1');
    expect(b.id).toBe(a.id);
    const c = await ana.createTicket(body, 'draft:D-2');
    expect(c.id).not.toBe(a.id);
  });

  it('retenta quando o legado cai e desiste com erro claro', async () => {
    h.service.failureRate = 1;
    try {
      let attempts = 0;
      await expect(h.ticketsAs(ANA)((i) => (attempts = i.attempts)).listTickets()).rejects.toMatchObject({ code: 'unavailable' });
      expect(attempts).toBe(4);
    } finally {
      h.service.failureRate = 0;
    }
  });

  it('reabre resolvido há até 7 dias; recusa os antigos', async () => {
    const ana = h.ticketsAs(ANA)();
    expect((await ana.reopen('INC-20150', 'A senha bloqueou de novo hoje.', 'r1')).status).toBe('aberto');
    await expect(ana.reopen('INC-19877', 'Voltou a acontecer.', 'r2')).rejects.toMatchObject({ code: 'conflict' });
  });

  it('central de ajuda encontra o artigo do erro 809', async () => {
    const articles = await h.ticketsAs(ANA)().searchKb('vpn não conecta erro 809');
    expect(articles[0]?.id).toBe('KB-001');
  });
});
