import { getRequestListener } from '@hono/node-server';
import { serviceFromEnv } from './config';

// Entrada do serviço de chamados na Vercel (projeto separado do app).
// Empacotada em um único arquivo por build-vercel.mjs.
const app = serviceFromEnv();

export default getRequestListener(app.fetch);
