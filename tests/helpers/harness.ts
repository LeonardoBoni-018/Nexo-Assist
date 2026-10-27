import { serve, type ServerType } from '@hono/node-server';
import type { AddressInfo } from 'node:net';
import { createTicketService } from '../../services/tickets/src/app';
import { TicketStore } from '../../services/tickets/src/store';
import { AppStore } from '@/server/store';
import { createTicketsClient } from '@/server/tickets-client';
import { runTurn } from '@/server/agent/turn';
import type { StreamEvent } from '@/shared/chat';
import { scriptedModel, type ScriptAction } from './scripted-model';

export const SERVICE_KEY = 'test-key';

/** Sobe o serviço de chamados (porta aleatória) e um banco do app em memória. */
export async function startHarness(opts: { failureRate?: number } = {}) {
  const ticketStore = new TicketStore(':memory:');
  const service = { failureRate: opts.failureRate ?? 0 };
  const app = createTicketService({
    store: ticketStore,
    serviceKey: SERVICE_KEY,
    get failureRate() {
      return service.failureRate;
    },
    maxLatencyMs: 0,
  });
  const server: ServerType = await new Promise((resolve) => {
    const s = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' }, () => resolve(s));
  });
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;
  const store = new AppStore(':memory:');

  const ticketsAs = (email: string, role: 'employee' | 'analyst' = 'employee') => {
    const person = store.findUser(email)!;
    return (onCall?: (i: { attempts: number }) => void) =>
      createTicketsClient({
        baseUrl,
        serviceKey: SERVICE_KEY,
        actor: { email: person.email, role, name: person.name },
        baseDelayMs: 1,
        ...(onCall ? { onCall } : {}),
      });
  };

  /** Roda um turno com um modelo roteirizado e devolve mensagem + eventos SSE. */
  async function turn(email: string, conversationId: string, text: string, script: ScriptAction[][]) {
    const person = store.findUser(email)!;
    const { model } = scriptedModel(script);
    const events: StreamEvent[] = [];
    const message = await runTurn(
      { store, model, modelName: 'claude-opus-5-5', tickets: ticketsAs(email), messageLimit: 30, minConfidence: 0.4 },
      { person, conversation: store.getConversation(conversationId)!, text, emit: (e) => events.push(e) },
    );
    return { message, events };
  }

  return {
    store,
    ticketStore,
    service,
    baseUrl,
    ticketsAs,
    turn,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}
