import { createTicketService } from './app';
import { TicketStore } from './store';

/** Monta o serviço a partir das variáveis de ambiente (usado no servidor local e na Vercel). */
export function serviceFromEnv() {
  const serviceKey = process.env.TICKETS_SERVICE_KEY;
  if (!serviceKey) throw new Error('Defina TICKETS_SERVICE_KEY (veja .env.example)');
  return createTicketService({
    store: TicketStore.open(process.env.TICKETS_DATABASE_URL, process.env.TICKETS_DB_PATH ?? 'data/tickets'),
    serviceKey,
    failureRate: Number(process.env.TICKETS_FAILURE_RATE ?? 0.1),
    maxLatencyMs: Number(process.env.TICKETS_MAX_LATENCY_MS ?? 300),
  });
}
