import { describe, expect, it } from 'vitest';
import { classifyPriority } from '@/domain/priority';
import { addBusinessMinutes, computeDueAt, slaStatus } from '@/domain/sla';
import { canReopen, findDuplicates } from '@/domain/similarity';
import type { Ticket } from '@/domain/types';

// Horários em Brasília (UTC−3) escritos como ISO com offset, para o teste ler como a regra.
const at = (local: string) => new Date(`${local}-03:00`);

describe('prioridade (Anexo A)', () => {
  it.each([
    [{ type: 'INC', affected: 'empresa', blocksWork: true, deadlineToday: false }, 'critica'],
    [{ type: 'INC', affected: 'equipe', blocksWork: true, deadlineToday: false }, 'critica'],
    [{ type: 'INC', affected: 'individual', blocksWork: true, deadlineToday: false }, 'alta'],
    [{ type: 'INC', affected: 'individual', blocksWork: false, deadlineToday: true }, 'alta'],
    [{ type: 'INC', affected: 'equipe', blocksWork: false, deadlineToday: false }, 'media'],
    [{ type: 'INC', affected: null, blocksWork: false, deadlineToday: false }, 'media'],
    [{ type: 'REQ', affected: 'individual', blocksWork: false, deadlineToday: false }, 'baixa'],
    [{ type: 'REQ', affected: 'individual', blocksWork: false, deadlineToday: true }, 'alta'],
  ] as const)('%o → %s', (signals, expected) => {
    expect(classifyPriority(signals).priority).toBe(expected);
  });

  it('explica a regra aplicada', () => {
    expect(classifyPriority({ type: 'INC', affected: 'individual', blocksWork: false, deadlineToday: true }).rule).toContain('compromisso no mesmo dia');
  });
});

describe('prazos em horário útil (seg–sex, 8h–18h)', () => {
  it('soma dentro do mesmo dia', () => {
    expect(addBusinessMinutes(at('2026-10-27T09:43'), 240)).toEqual(at('2026-10-27T13:43'));
  });

  it('atravessa a noite', () => {
    expect(addBusinessMinutes(at('2026-10-27T16:00'), 240)).toEqual(at('2026-10-28T10:00'));
  });

  it('atravessa o fim de semana', () => {
    expect(addBusinessMinutes(at('2026-10-30T17:00'), 120)).toEqual(at('2026-11-02T09:00')); // sexta → segunda
  });

  it('começa a contar na abertura quando o chamado chega fora do expediente', () => {
    expect(addBusinessMinutes(at('2026-10-31T11:00'), 60)).toEqual(at('2026-11-02T09:00')); // sábado
    expect(addBusinessMinutes(at('2026-10-27T06:30'), 30)).toEqual(at('2026-10-27T08:30'));
  });

  it('crítica conta em horas corridas (plantão 24 h)', () => {
    expect(computeDueAt('critica', at('2026-10-31T23:30'))).toEqual(at('2026-11-01T00:30'));
  });

  it('média: 3 dias úteis', () => {
    expect(computeDueAt('media', at('2026-10-26T10:00'))).toEqual(at('2026-10-29T10:00'));
  });

  it('marca vencido quando passa do prazo desde a última atualização do suporte', () => {
    const ticket = { priority: 'media' as const, status: 'aguardando_analista' as const, slaAnchorAt: at('2026-10-20T10:00').toISOString() };
    expect(slaStatus(ticket, at('2026-10-23T09:59')).overdue).toBe(false);
    expect(slaStatus(ticket, at('2026-10-23T10:01')).overdue).toBe(true);
  });

  it('prazo pausa quando aguarda o funcionário e não corre em chamado resolvido', () => {
    const anchor = at('2026-10-01T10:00').toISOString();
    expect(slaStatus({ priority: 'alta', status: 'aguardando_usuario', slaAnchorAt: anchor }, at('2026-10-27T10:00'))).toMatchObject({ overdue: false, running: false });
    expect(slaStatus({ priority: 'alta', status: 'resolvido', slaAnchorAt: anchor }, at('2026-10-27T10:00'))).toMatchObject({ overdue: false, dueAt: null });
  });
});

describe('duplicidade e reabertura', () => {
  const now = at('2026-10-27T10:00');
  const base: Omit<Ticket, 'id' | 'title' | 'status' | 'category' | 'resolvedAt'> = {
    type: 'INC',
    description: '',
    subcategory: null,
    priority: 'media',
    affected: 'individual',
    requesterEmail: 'ana.souza@nexo.com.br',
    requesterName: 'Ana Souza',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    slaAnchorAt: now.toISOString(),
    events: [],
  };
  const tickets: Ticket[] = [
    { ...base, id: 'INC-1', title: 'Notebook lento após atualização do Windows', category: 'Hardware', status: 'aguardando_analista', resolvedAt: null },
    { ...base, id: 'INC-2', title: 'Senha do SAP bloqueada', category: 'Acesso', status: 'resolvido', resolvedAt: at('2026-10-23T10:00').toISOString() },
    { ...base, id: 'INC-3', title: 'Outlook não sincroniza no celular', category: 'E-mail', status: 'resolvido', resolvedAt: at('2026-09-01T10:00').toISOString() },
  ];

  it('encontra chamado aberto sobre o mesmo problema, com outras palavras', () => {
    const found = findDuplicates({ title: 'Notebook muito lento depois da atualização', description: 'Lentidão desde o update do Windows', category: 'Hardware' }, tickets, now);
    expect(found[0]).toMatchObject({ ticketId: 'INC-1', action: 'atualizar' });
  });

  it('sugere reabrir resolvido há até 7 dias, e ignora os antigos', () => {
    expect(findDuplicates({ title: 'SAP bloqueou minha senha de novo', description: '', category: 'Acesso' }, tickets, now)[0]).toMatchObject({ ticketId: 'INC-2', action: 'reabrir' });
    expect(findDuplicates({ title: 'Outlook do celular não sincroniza', description: '', category: 'E-mail' }, tickets, now)).toEqual([]);
  });

  it('não confunde problemas diferentes', () => {
    expect(findDuplicates({ title: 'VPN não conecta — erro 809', description: 'Windows 11', category: 'Rede e VPN' }, tickets, now)).toEqual([]);
  });

  it('janela de reabertura de 7 dias', () => {
    expect(canReopen(tickets[1]!, now)).toBe(true);
    expect(canReopen(tickets[1]!, at('2026-10-31T10:01'))).toBe(false);
  });
});
