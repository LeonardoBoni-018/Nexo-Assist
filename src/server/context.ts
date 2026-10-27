import { env } from './env';
import { AppStore } from './store';
import { createTicketsClient, type CallInfo } from './tickets-client';
import type { Person } from '../../seed/people';

// Um único AppStore por processo (sobrevive ao hot reload do Next em dev).
const globalForStore = globalThis as unknown as { __nexoStore?: AppStore };

export function getStore(): AppStore {
  globalForStore.__nexoStore ??= new AppStore(env.appDbPath);
  return globalForStore.__nexoStore;
}

/** Cliente do serviço de chamados agindo em nome de quem está logado. */
export function ticketsFor(person: Person, onCall?: (info: CallInfo) => void) {
  return createTicketsClient({
    baseUrl: env.ticketsUrl,
    serviceKey: env.ticketsServiceKey,
    actor: { email: person.email, role: person.role, name: person.name },
    ...(onCall ? { onCall } : {}),
  });
}
