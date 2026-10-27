import type { KbArticle, Ticket } from '@/domain/types';
import type { SlaStatus } from '@/domain/sla';
import type { CreateTicketBody } from '../../services/tickets/src/contract';

/**
 * Cliente do serviço de chamados. O sistema é legado e cai por alguns
 * segundos de vez em quando, então toda chamada tem timeout e retentativa
 * com backoff. Escritas usam idempotency-key: retentar nunca duplica.
 */

export type TicketWithSla = Ticket & { sla: SlaStatus };

export class TicketServiceError extends Error {
  constructor(
    readonly code: 'unavailable' | 'not_found' | 'invalid' | 'conflict' | 'unauthorized',
    message: string,
    readonly attempts: number,
  ) {
    super(message);
  }
}

export interface CallInfo {
  attempts: number;
}

export interface ClientActor {
  email: string;
  role: 'employee' | 'analyst';
  name: string;
}

export interface TicketsClientOptions {
  baseUrl: string;
  serviceKey: string;
  actor: ClientActor;
  /** Chamado a cada requisição concluída — usado no rastro do agent. */
  onCall?: (info: CallInfo) => void;
  maxAttempts?: number;
  timeoutMs?: number;
  baseDelayMs?: number;
}

export function createTicketsClient(opts: TicketsClientOptions) {
  const maxAttempts = opts.maxAttempts ?? 4;
  const timeoutMs = opts.timeoutMs ?? 4000;
  const baseDelayMs = opts.baseDelayMs ?? 250;

  async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown, idempotencyKey?: string): Promise<T> {
    let lastError: TicketServiceError | null = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const res = await fetch(`${opts.baseUrl}${path}`, {
          method,
          headers: {
            'content-type': 'application/json',
            'x-service-key': opts.serviceKey,
            'x-actor-email': opts.actor.email,
            'x-actor-role': opts.actor.role,
            'x-actor-name': encodeURIComponent(opts.actor.name),
            ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (res.ok) {
          opts.onCall?.({ attempts: attempt });
          return (await res.json()) as T;
        }
        const payload = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
        const code = (payload?.error?.code ?? 'unavailable') as TicketServiceError['code'];
        const err = new TicketServiceError(code, payload?.error?.message ?? `HTTP ${res.status}`, attempt);
        // Só vale retentar quando o sistema está indisponível.
        if (res.status < 500) {
          opts.onCall?.({ attempts: attempt });
          throw err;
        }
        lastError = err;
      } catch (e) {
        if (e instanceof TicketServiceError && e.code !== 'unavailable') throw e;
        lastError = e instanceof TicketServiceError ? e : new TicketServiceError('unavailable', 'Sistema de chamados não respondeu.', attempt);
      }
      if (attempt < maxAttempts) await new Promise((r) => setTimeout(r, baseDelayMs * 2 ** (attempt - 1)));
    }
    opts.onCall?.({ attempts: maxAttempts });
    throw new TicketServiceError('unavailable', lastError?.message ?? 'Sistema de chamados indisponível.', maxAttempts);
  }

  return {
    listTickets: (requester?: string) =>
      call<{ tickets: TicketWithSla[] }>('GET', `/tickets${requester ? `?requester=${encodeURIComponent(requester)}` : ''}`).then((r) => r.tickets),
    getTicket: (id: string) => call<{ ticket: TicketWithSla }>('GET', `/tickets/${encodeURIComponent(id)}`).then((r) => r.ticket),
    createTicket: (body: CreateTicketBody, idempotencyKey: string) =>
      call<{ ticket: TicketWithSla }>('POST', '/tickets', body, idempotencyKey).then((r) => r.ticket),
    addComment: (id: string, text: string, idempotencyKey: string) =>
      call<{ ticket: TicketWithSla }>('POST', `/tickets/${encodeURIComponent(id)}/comments`, { text }, idempotencyKey).then((r) => r.ticket),
    reopen: (id: string, reason: string, idempotencyKey: string) =>
      call<{ ticket: TicketWithSla }>('POST', `/tickets/${encodeURIComponent(id)}/reopen`, { reason }, idempotencyKey).then((r) => r.ticket),
    escalate: (id: string, summary: string, level: 'N1' | 'N2', idempotencyKey: string) =>
      call<{ ticket: TicketWithSla }>('POST', `/tickets/${encodeURIComponent(id)}/escalate`, { summary, level }, idempotencyKey).then((r) => r.ticket),
    setStatus: (id: string, status: Ticket['status'], note?: string) =>
      call<{ ticket: TicketWithSla }>('POST', `/tickets/${encodeURIComponent(id)}/status`, { status, note }).then((r) => r.ticket),
    searchKb: (q: string) =>
      call<{ articles: Array<KbArticle & { score: number }> }>('GET', `/kb/search?q=${encodeURIComponent(q)}`).then((r) => r.articles),
  };
}

export type TicketsClient = ReturnType<typeof createTicketsClient>;
