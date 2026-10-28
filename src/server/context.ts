import { env } from './env';
import { AppStore } from './store';
import { createTicketsClient, type CallInfo } from './tickets-client';
import type { Person } from '../../seed/people';

// Um único AppStore por processo (sobrevive ao hot reload do Next em dev).
// Em serverless, cada instância abre a conexão uma vez e a reaproveita.
const globalForStore = globalThis as unknown as { __nexoStore?: Promise<AppStore> };

export function getStore(): Promise<AppStore> {
  globalForStore.__nexoStore ??= AppStore.open(env.databaseUrl, env.appDbPath).catch((e: unknown) => {
    globalForStore.__nexoStore = undefined; // permite tentar de novo na próxima requisição
    throw e;
  });
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
