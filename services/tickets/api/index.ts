import { handle } from 'hono/vercel';
import { serviceFromEnv } from '../src/config';

// Entrada do serviço de chamados na Vercel (projeto separado do app).
// Todas as rotas são reescritas para esta função em vercel.json.
const app = serviceFromEnv();

export const GET = handle(app);
export const POST = handle(app);
