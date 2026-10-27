import { serve } from '@hono/node-server';
import { createTicketService } from './app';
import { TicketStore } from './store';

const port = Number(process.env.TICKETS_PORT ?? 4001);
const serviceKey = process.env.TICKETS_SERVICE_KEY;
if (!serviceKey) {
  console.error('[tickets] defina TICKETS_SERVICE_KEY (veja .env.example)');
  process.exit(1);
}

const store = new TicketStore(process.env.TICKETS_DB_PATH ?? 'data/tickets.db');
const app = createTicketService({
  store,
  serviceKey,
  failureRate: Number(process.env.TICKETS_FAILURE_RATE ?? 0.1),
  maxLatencyMs: Number(process.env.TICKETS_MAX_LATENCY_MS ?? 300),
});

serve({ fetch: app.fetch, port, hostname: process.env.TICKETS_HOST ?? '127.0.0.1' }, (info) => {
  console.log(`[tickets] serviço de chamados em http://${info.address}:${info.port}`);
});
