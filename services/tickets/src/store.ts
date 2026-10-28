import type { KbArticle, Ticket, TicketEvent, TicketStatus } from '../../../src/domain/types';
import { terms } from '../../../src/domain/similarity';
import { connect, type Sql } from '../../../src/db/sql';
import type { Actor, CreateTicketBody } from './contract';
import { seedTickets, KB_ARTICLES } from './seed';

/**
 * Persistência do "sistema legado" de chamados. Banco próprio, separado do
 * banco do app — os dois só se falam por HTTP. Os chamados ficam em jsonb:
 * o serviço é um sistema de registro simples, não precisa de colunas por campo.
 */
export class TicketStore {
  private constructor(private readonly db: Sql) {}

  static async open(url: string | undefined, localDir: string): Promise<TicketStore> {
    const store = new TicketStore(await connect(url, localDir));
    await store.init();
    return store;
  }

  private async init() {
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS tickets (
        id TEXT PRIMARY KEY,
        requester_email TEXT NOT NULL,
        data JSONB NOT NULL
      );
      CREATE INDEX IF NOT EXISTS tickets_requester ON tickets(requester_email);
      CREATE TABLE IF NOT EXISTS counters (type TEXT PRIMARY KEY, next INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS idempotency (key TEXT PRIMARY KEY, response JSONB NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS kb (id TEXT PRIMARY KEY, data JSONB NOT NULL)
    `);
    const [row] = await this.db.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM tickets');
    if (row && row.n > 0) return;
    for (const t of seedTickets(new Date())) {
      await this.db.query('INSERT INTO tickets (id, requester_email, data) VALUES ($1, $2, $3::jsonb) ON CONFLICT DO NOTHING', [t.id, t.requesterEmail, JSON.stringify(t)]);
    }
    await this.db.query("INSERT INTO counters (type, next) VALUES ('INC', 20517), ('REQ', 10470) ON CONFLICT DO NOTHING");
    for (const a of KB_ARTICLES) {
      await this.db.query('INSERT INTO kb (id, data) VALUES ($1, $2::jsonb) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data', [a.id, JSON.stringify(a)]);
    }
  }

  // ---------- leitura ----------

  async get(id: string): Promise<Ticket | null> {
    const [row] = await this.db.query<{ data: Ticket }>('SELECT data FROM tickets WHERE id = $1', [id.toUpperCase()]);
    return row?.data ?? null;
  }

  async listByRequester(email: string): Promise<Ticket[]> {
    const rows = await this.db.query<{ data: Ticket }>('SELECT data FROM tickets WHERE requester_email = $1', [email]);
    return rows.map((r) => r.data).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  // ---------- escrita ----------

  private async save(t: Ticket) {
    await this.db.query('UPDATE tickets SET data = $1::jsonb WHERE id = $2', [JSON.stringify(t), t.id]);
  }

  /** Incremento atômico: dois chamados simultâneos nunca recebem o mesmo número. */
  private async nextId(type: 'INC' | 'REQ'): Promise<string> {
    const [row] = await this.db.query<{ n: number }>('UPDATE counters SET next = next + 1 WHERE type = $1 RETURNING next - 1 AS n', [type]);
    return `${type}-${row!.n}`;
  }

  async create(body: CreateTicketBody, actor: Actor, now = new Date()): Promise<Ticket> {
    const at = now.toISOString();
    const ticket: Ticket = {
      id: await this.nextId(body.type),
      type: body.type,
      title: body.title,
      description: body.description,
      category: body.category,
      subcategory: body.subcategory,
      priority: body.priority,
      status: 'aberto',
      affected: body.affected,
      requesterEmail: actor.email,
      requesterName: actor.name,
      createdAt: at,
      updatedAt: at,
      slaAnchorAt: at,
      resolvedAt: null,
      events: [{ at, author: 'sistema', authorName: 'Nexo Assist', kind: 'criado', text: 'Chamado aberto pelo Nexo Assist.' }],
    };
    await this.db.query('INSERT INTO tickets (id, requester_email, data) VALUES ($1, $2, $3::jsonb)', [ticket.id, ticket.requesterEmail, JSON.stringify(ticket)]);
    return ticket;
  }

  async addEvent(t: Ticket, event: Omit<TicketEvent, 'at'>, now = new Date(), patch: Partial<Ticket> = {}): Promise<Ticket> {
    const at = now.toISOString();
    const updated: Ticket = { ...t, ...patch, updatedAt: at, events: [...t.events, { ...event, at }] };
    // O prazo recomeça a cada atualização do suporte (Anexo A).
    if (event.author === 'suporte') updated.slaAnchorAt = at;
    await this.save(updated);
    return updated;
  }

  setStatus(t: Ticket, status: TicketStatus, actor: Actor, note: string | undefined, now = new Date()): Promise<Ticket> {
    return this.addEvent(
      t,
      { author: actor.role === 'analyst' ? 'suporte' : 'sistema', authorName: actor.name, kind: 'status', text: note ?? `Status alterado.` },
      now,
      { status, resolvedAt: status === 'resolvido' ? now.toISOString() : t.resolvedAt },
    );
  }

  // ---------- idempotência ----------

  async recall(key: string): Promise<unknown | null> {
    const [row] = await this.db.query<{ response: unknown }>('SELECT response FROM idempotency WHERE key = $1', [key]);
    return row?.response ?? null;
  }

  async remember(key: string, response: unknown) {
    await this.db.query(
      'INSERT INTO idempotency (key, response, created_at) VALUES ($1, $2::jsonb, $3) ON CONFLICT (key) DO UPDATE SET response = EXCLUDED.response',
      [key, JSON.stringify(response), new Date().toISOString()],
    );
  }

  // ---------- central de ajuda ----------

  async searchKb(query: string, limit = 3): Promise<Array<KbArticle & { score: number }>> {
    const q = terms(query);
    if (q.size === 0) return [];
    const rows = await this.db.query<{ data: KbArticle }>('SELECT data FROM kb');
    return rows
      .map((r) => r.data)
      .map((a) => {
        const title = terms(a.title);
        const body = terms(`${a.body} ${a.tags.join(' ')}`);
        let score = 0;
        for (const t of q) {
          if (title.has(t)) score += 2;
          else if (body.has(t)) score += 1;
        }
        return { ...a, score: Math.round((score / (q.size * 2)) * 100) / 100 };
      })
      .filter((a) => a.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}
