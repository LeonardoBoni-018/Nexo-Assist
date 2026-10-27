import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { KbArticle, Ticket, TicketEvent, TicketStatus } from '../../../src/domain/types';
import { terms } from '../../../src/domain/similarity';
import type { Actor, CreateTicketBody } from './contract';
import { seedTickets, KB_ARTICLES } from './seed';

/**
 * Persistência do "sistema legado" de chamados. Banco próprio, separado do
 * banco do app — os dois só se falam por HTTP.
 */
export class TicketStore {
  private db: DatabaseSync;

  constructor(file: string) {
    if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS tickets (
        id TEXT PRIMARY KEY,
        requester_email TEXT NOT NULL,
        data TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS tickets_requester ON tickets(requester_email);
      CREATE TABLE IF NOT EXISTS counters (type TEXT PRIMARY KEY, next INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS idempotency (key TEXT PRIMARY KEY, response TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS kb (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    `);
    this.seedIfEmpty();
  }

  private seedIfEmpty() {
    const row = this.db.prepare('SELECT COUNT(*) AS n FROM tickets').get() as { n: number };
    if (row.n > 0) return;
    const now = new Date();
    const insert = this.db.prepare('INSERT INTO tickets (id, requester_email, data) VALUES (?, ?, ?)');
    for (const t of seedTickets(now)) insert.run(t.id, t.requesterEmail, JSON.stringify(t));
    this.db.prepare('INSERT OR REPLACE INTO counters (type, next) VALUES (?, ?)').run('INC', 20517);
    this.db.prepare('INSERT OR REPLACE INTO counters (type, next) VALUES (?, ?)').run('REQ', 10470);
    const kb = this.db.prepare('INSERT OR REPLACE INTO kb (id, data) VALUES (?, ?)');
    for (const a of KB_ARTICLES) kb.run(a.id, JSON.stringify(a));
  }

  // ---------- leitura ----------

  get(id: string): Ticket | null {
    const row = this.db.prepare('SELECT data FROM tickets WHERE id = ?').get(id.toUpperCase()) as { data: string } | undefined;
    return row ? (JSON.parse(row.data) as Ticket) : null;
  }

  listByRequester(email: string): Ticket[] {
    const rows = this.db.prepare('SELECT data FROM tickets WHERE requester_email = ?').all(email) as { data: string }[];
    return rows.map((r) => JSON.parse(r.data) as Ticket).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  // ---------- escrita ----------

  private save(t: Ticket) {
    this.db.prepare('UPDATE tickets SET data = ? WHERE id = ?').run(JSON.stringify(t), t.id);
  }

  private nextId(type: 'INC' | 'REQ'): string {
    const row = this.db.prepare('SELECT next FROM counters WHERE type = ?').get(type) as { next: number };
    this.db.prepare('UPDATE counters SET next = next + 1 WHERE type = ?').run(type);
    return `${type}-${row.next}`;
  }

  create(body: CreateTicketBody, actor: Actor, now = new Date()): Ticket {
    const at = now.toISOString();
    const ticket: Ticket = {
      id: this.nextId(body.type),
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
    this.db
      .prepare('INSERT INTO tickets (id, requester_email, data) VALUES (?, ?, ?)')
      .run(ticket.id, ticket.requesterEmail, JSON.stringify(ticket));
    return ticket;
  }

  addEvent(t: Ticket, event: Omit<TicketEvent, 'at'>, now = new Date(), patch: Partial<Ticket> = {}): Ticket {
    const at = now.toISOString();
    const updated: Ticket = { ...t, ...patch, updatedAt: at, events: [...t.events, { ...event, at }] };
    // O prazo recomeça a cada atualização do suporte (Anexo A).
    if (event.author === 'suporte') updated.slaAnchorAt = at;
    this.save(updated);
    return updated;
  }

  setStatus(t: Ticket, status: TicketStatus, actor: Actor, note: string | undefined, now = new Date()): Ticket {
    return this.addEvent(
      t,
      { author: actor.role === 'analyst' ? 'suporte' : 'sistema', authorName: actor.name, kind: 'status', text: note ?? `Status alterado.` },
      now,
      { status, resolvedAt: status === 'resolvido' ? now.toISOString() : t.resolvedAt },
    );
  }

  // ---------- idempotência ----------

  recall(key: string): unknown | null {
    const row = this.db.prepare('SELECT response FROM idempotency WHERE key = ?').get(key) as { response: string } | undefined;
    return row ? JSON.parse(row.response) : null;
  }

  remember(key: string, response: unknown) {
    this.db
      .prepare('INSERT OR REPLACE INTO idempotency (key, response, created_at) VALUES (?, ?, ?)')
      .run(key, JSON.stringify(response), new Date().toISOString());
  }

  // ---------- central de ajuda ----------

  searchKb(query: string, limit = 3): Array<KbArticle & { score: number }> {
    const q = terms(query);
    if (q.size === 0) return [];
    const rows = this.db.prepare('SELECT data FROM kb').all() as { data: string }[];
    return rows
      .map((r) => JSON.parse(r.data) as KbArticle)
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
