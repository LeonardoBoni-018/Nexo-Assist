import { Hono, type Context } from 'hono';
import { timingSafeEqual } from 'node:crypto';
import { slaStatus } from '../../../src/domain/sla';
import type { Ticket } from '../../../src/domain/types';
import { commentBody, createTicketBody, escalateBody, reopenBody, statusBody, type Actor, type ApiError } from './contract';
import type { TicketStore } from './store';
import { canReopen } from '../../../src/domain/similarity';

export interface ServiceOptions {
  /** Pode ser uma promessa: em serverless o banco abre na primeira requisição. */
  store: TicketStore | Promise<TicketStore>;
  serviceKey: string;
  /** Probabilidade (0–1) de responder 503, simulando o sistema legado. */
  failureRate: number;
  /** Latência artificial máxima, em ms. */
  maxLatencyMs: number;
  now?: () => Date;
}

type Env = { Variables: { actor: Actor } };

const fail = (c: Context, status: 400 | 401 | 404 | 409 | 503, code: ApiError['error']['code'], message: string) =>
  c.json<ApiError>({ error: { code, message } }, status);

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function createTicketService(opts: ServiceOptions) {
  const storeReady = Promise.resolve(opts.store);
  const now = opts.now ?? (() => new Date());
  const app = new Hono<Env>();

  /** Chamado acompanhado do estado do prazo, calculado no momento da leitura. */
  const view = (t: Ticket) => ({ ...t, sla: slaStatus(t, now()) });

  app.get('/health', (c) => c.json({ ok: true }));

  // Sistema legado: às vezes lento, às vezes fora do ar por alguns segundos.
  app.use('*', async (c, next) => {
    if (opts.maxLatencyMs > 0) await new Promise((r) => setTimeout(r, Math.random() * opts.maxLatencyMs));
    if (Math.random() < opts.failureRate) return fail(c, 503, 'unavailable', 'Sistema de chamados indisponível no momento.');
    await next();
  });

  app.use('*', async (c, next) => {
    const key = c.req.header('x-service-key') ?? '';
    const email = c.req.header('x-actor-email');
    const role = c.req.header('x-actor-role');
    if (!safeEqual(key, opts.serviceKey) || !email || (role !== 'employee' && role !== 'analyst')) {
      return fail(c, 401, 'unauthorized', 'Credenciais do serviço ausentes ou inválidas.');
    }
    c.set('actor', { email: email.toLowerCase(), role, name: decodeURIComponent(c.req.header('x-actor-name') ?? email) });
    await next();
  });

  /**
   * Privacidade (Anexo A): um funcionário só enxerga os próprios chamados.
   * Chamado de outra pessoa responde 404 — não confirma nem que ele existe.
   */
  const load = async (c: Context<Env>): Promise<Ticket | null> => {
    const t = await (await storeReady).get(c.req.param('id') ?? '');
    const actor = c.get('actor');
    if (!t) return null;
    if (actor.role === 'employee' && t.requesterEmail !== actor.email) return null;
    return t;
  };

  /** Executa uma escrita uma única vez por idempotency-key. */
  const once = async (c: Context<Env>, run: () => Response | Promise<Response>) => {
    const key = c.req.header('idempotency-key');
    if (key) {
      const scoped = `${c.get('actor').email}:${key}`;
      const store = await storeReady;
      const previous = (await store.recall(scoped)) as { status: number; body: unknown } | null;
      if (previous) return c.json(previous.body as object, previous.status as 200);
      const res = await run();
      if (res.status < 300) await store.remember(scoped, { status: res.status, body: await res.clone().json() });
      return res;
    }
    return run();
  };

  app.get('/tickets', async (c) => {
    const actor = c.get('actor');
    const requester = (c.req.query('requester') ?? actor.email).toLowerCase();
    if (actor.role === 'employee' && requester !== actor.email) return fail(c, 404, 'not_found', 'Nenhum chamado encontrado.');
    return c.json({ tickets: (await (await storeReady).listByRequester(requester)).map(view) });
  });

  app.get('/tickets/:id', async (c) => {
    const t = await load(c);
    return t ? c.json({ ticket: view(t) }) : fail(c, 404, 'not_found', 'Chamado não encontrado.');
  });

  app.post('/tickets', async (c) => {
    const parsed = createTicketBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return fail(c, 400, 'invalid', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    return once(c, async () => c.json({ ticket: view(await (await storeReady).create(parsed.data, c.get('actor'), now())) }, 201));
  });

  app.post('/tickets/:id/comments', async (c) => {
    const t = await load(c);
    if (!t) return fail(c, 404, 'not_found', 'Chamado não encontrado.');
    const parsed = commentBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return fail(c, 400, 'invalid', 'Comentário inválido.');
    const actor = c.get('actor');
    return once(c, async () =>
      c.json({
        ticket: view(
          await (await storeReady).addEvent(
            t,
            { author: actor.role === 'analyst' ? 'suporte' : 'funcionario', authorName: actor.name, kind: 'comentario', text: parsed.data.text },
            now(),
          ),
        ),
      }),
    );
  });

  app.post('/tickets/:id/reopen', async (c) => {
    const t = await load(c);
    if (!t) return fail(c, 404, 'not_found', 'Chamado não encontrado.');
    if (!canReopen(t, now())) return fail(c, 409, 'conflict', 'Só é possível reabrir chamados resolvidos há até 7 dias.');
    const parsed = reopenBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return fail(c, 400, 'invalid', 'Motivo inválido.');
    const actor = c.get('actor');
    return once(c, async () =>
      c.json({
        ticket: view(
          await (await storeReady).addEvent(t, { author: 'funcionario', authorName: actor.name, kind: 'reaberto', text: parsed.data.reason }, now(), {
            status: 'aberto',
            resolvedAt: null,
            // reabertura reinicia o prazo de primeira resposta
            slaAnchorAt: now().toISOString(),
          }),
        ),
      }),
    );
  });

  app.post('/tickets/:id/escalate', async (c) => {
    const t = await load(c);
    if (!t) return fail(c, 404, 'not_found', 'Chamado não encontrado.');
    const parsed = escalateBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return fail(c, 400, 'invalid', 'Resumo inválido.');
    return once(c, async () =>
      c.json({
        ticket: view(
          await (await storeReady).addEvent(
            t,
            { author: 'sistema', authorName: 'Nexo Assist', kind: 'transferido', text: `Transferido para Suporte ${parsed.data.level}: ${parsed.data.summary}` },
            now(),
            { status: 'aguardando_analista' },
          ),
        ),
      }),
    );
  });

  app.post('/tickets/:id/status', async (c) => {
    const actor = c.get('actor');
    if (actor.role !== 'analyst') return fail(c, 401, 'unauthorized', 'Apenas analistas alteram o status.');
    const t = await load(c);
    if (!t) return fail(c, 404, 'not_found', 'Chamado não encontrado.');
    const parsed = statusBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return fail(c, 400, 'invalid', 'Status inválido.');
    return c.json({ ticket: view(await (await storeReady).setStatus(t, parsed.data.status, actor, parsed.data.note, now())) });
  });

  app.get('/kb/search', async (c) => c.json({ articles: await (await storeReady).searchKb(c.req.query('q') ?? '') }));

  app.onError((err, c) => {
    console.error('[tickets] erro inesperado', err);
    return fail(c, 503, 'unavailable', 'Erro interno no sistema de chamados.');
  });

  return app;
}
