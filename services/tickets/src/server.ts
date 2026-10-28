import { serve } from '@hono/node-server';
import { serviceFromEnv } from './config';

// Local: PGlite em data/tickets (sem instalar Postgres). Com TICKETS_DATABASE_URL, usa esse Postgres.
const app = serviceFromEnv();
const port = Number(process.env.TICKETS_PORT ?? 4001);

serve({ fetch: app.fetch, port, hostname: process.env.TICKETS_HOST ?? '127.0.0.1' }, (info) => {
  console.log(`[tickets] serviço de chamados em http://${info.address}:${info.port}`);
});
