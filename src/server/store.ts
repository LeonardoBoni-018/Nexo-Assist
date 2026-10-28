import { randomUUID } from 'node:crypto';
import { PEOPLE, type Person } from '../../seed/people';
import type { ConversationStatus, ConversationView, DraftView, MessageRole, MessageView, TurnTrace, UiBlock } from '@/shared/chat';
import { connect, type Sql } from '@/db/sql';

/**
 * Banco do app: usuários, conversas, mensagens (com o rastro de decisões do
 * agent) e rascunhos de chamado. Postgres (Neon em produção, PGlite local),
 * para que o estado sobreviva a reinícios e a deploys serverless.
 */

export interface ConversationRow {
  id: string;
  userEmail: string;
  status: ConversationStatus;
  assignedAnalystEmail: string | null;
  assignedAnalystName: string | null;
  handoff: ConversationView['handoff'];
  userMessageCount: number;
  /** Chamado em foco na conversa (ex.: transferência sobre o INC-20311). */
  focusTicketId: string | null;
  unreadForAnalyst: number;
  lastPreview: string;
  createdAt: string;
  updatedAt: string;
}

interface RawConversation {
  id: string;
  user_email: string;
  status: ConversationStatus;
  assigned_analyst_email: string | null;
  assigned_analyst_name: string | null;
  handoff: ConversationView['handoff'];
  user_message_count: number;
  focus_ticket_id: string | null;
  unread_for_analyst: number;
  last_preview: string;
  created_at: string;
  updated_at: string;
}

interface RawMessage {
  id: string;
  role: MessageRole;
  author_name: string;
  content: string;
  ui: UiBlock[];
  trace: TurnTrace | null;
  created_at: string;
}

const toConversation = (r: RawConversation): ConversationRow => ({
  id: r.id,
  userEmail: r.user_email,
  status: r.status,
  assignedAnalystEmail: r.assigned_analyst_email,
  assignedAnalystName: r.assigned_analyst_name,
  handoff: r.handoff ?? null,
  userMessageCount: r.user_message_count,
  focusTicketId: r.focus_ticket_id,
  unreadForAnalyst: r.unread_for_analyst,
  lastPreview: r.last_preview,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const toMessage = (r: RawMessage): MessageView => ({
  id: r.id,
  role: r.role,
  authorName: r.author_name,
  content: r.content,
  ui: r.ui ?? [],
  trace: r.trace ?? null,
  createdAt: r.created_at,
});

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    email TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL,
    department TEXT NOT NULL, device TEXT, support_level TEXT
  );
  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    user_email TEXT NOT NULL REFERENCES users(email),
    status TEXT NOT NULL,
    assigned_analyst_email TEXT, assigned_analyst_name TEXT,
    handoff JSONB,
    user_message_count INTEGER NOT NULL DEFAULT 0,
    focus_ticket_id TEXT,
    unread_for_analyst INTEGER NOT NULL DEFAULT 0,
    last_preview TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS conversations_user ON conversations(user_email, updated_at);
  CREATE TABLE IF NOT EXISTS messages (
    seq BIGSERIAL PRIMARY KEY,
    id TEXT NOT NULL UNIQUE,
    conversation_id TEXT NOT NULL REFERENCES conversations(id),
    role TEXT NOT NULL, author_name TEXT NOT NULL,
    content TEXT NOT NULL, ui JSONB NOT NULL DEFAULT '[]', trace JSONB,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS messages_conversation ON messages(conversation_id, seq);
  CREATE TABLE IF NOT EXISTS drafts (
    id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, data JSONB NOT NULL
  );
  CREATE TABLE IF NOT EXISTS counters (name TEXT PRIMARY KEY, next INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS daily_usage (user_email TEXT, day TEXT, turns INTEGER NOT NULL, PRIMARY KEY (user_email, day))
`;

export class AppStore {
  private constructor(private readonly db: Sql) {}

  /** `url`: Postgres (Neon). Sem ela, PGlite em `localDir` (ou ":memory:" nos testes). */
  static async open(url: string | undefined, localDir: string): Promise<AppStore> {
    const store = new AppStore(await connect(url, localDir));
    await store.db.exec(SCHEMA);
    for (const p of PEOPLE) {
      await store.db.query(
        'INSERT INTO users (email, name, role, department, device, support_level) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING',
        [p.email, p.name, p.role, p.department, p.device, p.supportLevel ?? null],
      );
    }
    await store.db.query("INSERT INTO counters (name, next) VALUES ('draft', 381) ON CONFLICT DO NOTHING");
    return store;
  }

  private async one<T>(text: string, params: unknown[] = []): Promise<T | null> {
    const [row] = await this.db.query<T>(text, params);
    return row ?? null;
  }

  // ---------- usuários ----------

  async findUser(email: string): Promise<Person | null> {
    const r = await this.one<{ email: string; name: string; role: Person['role']; department: string; device: string | null; support_level: 'N1' | 'N2' | null }>(
      'SELECT * FROM users WHERE email = $1',
      [email.trim().toLowerCase()],
    );
    if (!r) return null;
    return { email: r.email, name: r.name, role: r.role, department: r.department, device: r.device, ...(r.support_level ? { supportLevel: r.support_level } : {}) };
  }

  // ---------- conversas ----------

  async getConversation(id: string): Promise<ConversationRow | null> {
    const r = await this.one<RawConversation>('SELECT * FROM conversations WHERE id = $1', [id]);
    return r ? toConversation(r) : null;
  }

  /** Última conversa não encerrada do funcionário ("voltar e continuar de onde parei"). */
  async getOpenConversation(userEmail: string): Promise<ConversationRow | null> {
    const r = await this.one<RawConversation>(
      "SELECT * FROM conversations WHERE user_email = $1 AND status <> 'closed' ORDER BY updated_at DESC LIMIT 1",
      [userEmail],
    );
    return r ? toConversation(r) : null;
  }

  async getLatestConversation(userEmail: string): Promise<ConversationRow | null> {
    const r = await this.one<RawConversation>('SELECT * FROM conversations WHERE user_email = $1 ORDER BY updated_at DESC LIMIT 1', [userEmail]);
    return r ? toConversation(r) : null;
  }

  async createConversation(userEmail: string): Promise<ConversationRow> {
    const at = new Date().toISOString();
    const r = await this.one<RawConversation>(
      "INSERT INTO conversations (id, user_email, status, created_at, updated_at) VALUES ($1, $2, 'agent', $3, $3) RETURNING *",
      [randomUUID(), userEmail, at],
    );
    return toConversation(r!);
  }

  async listConversations(): Promise<Array<ConversationRow & { userName: string; userDepartment: string }>> {
    const rows = await this.db.query<RawConversation & { user_name: string; user_department: string }>(
      `SELECT c.*, u.name AS user_name, u.department AS user_department FROM conversations c
       JOIN users u ON u.email = c.user_email
       WHERE c.user_message_count > 0 ORDER BY c.updated_at DESC LIMIT 200`,
    );
    return rows.map((r) => ({ ...toConversation(r), userName: r.user_name, userDepartment: r.user_department }));
  }

  async updateConversation(
    id: string,
    patch: Partial<Pick<ConversationRow, 'status' | 'assignedAnalystEmail' | 'assignedAnalystName' | 'handoff' | 'focusTicketId' | 'unreadForAnalyst'>>,
  ) {
    const cols: Array<[string, unknown]> = [];
    if (patch.status !== undefined) cols.push(['status', patch.status]);
    if (patch.assignedAnalystEmail !== undefined) cols.push(['assigned_analyst_email', patch.assignedAnalystEmail]);
    if (patch.assignedAnalystName !== undefined) cols.push(['assigned_analyst_name', patch.assignedAnalystName]);
    if (patch.handoff !== undefined) cols.push(['handoff', patch.handoff ? JSON.stringify(patch.handoff) : null]);
    if (patch.focusTicketId !== undefined) cols.push(['focus_ticket_id', patch.focusTicketId]);
    if (patch.unreadForAnalyst !== undefined) cols.push(['unread_for_analyst', patch.unreadForAnalyst]);
    if (cols.length === 0) return;
    // Marcar como lida não deve reordenar a lista do console.
    const touch = cols.some(([k]) => k !== 'unread_for_analyst');
    const sets = cols.map(([k], i) => `${k} = $${i + 1}${k === 'handoff' ? '::jsonb' : ''}`);
    const params = cols.map(([, v]) => v);
    if (touch) {
      params.push(new Date().toISOString());
      sets.push(`updated_at = $${params.length}`);
    }
    params.push(id);
    await this.db.query(`UPDATE conversations SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
  }

  // ---------- mensagens ----------

  async addMessage(
    conversationId: string,
    m: { role: MessageRole; authorName: string; content: string; ui?: UiBlock[]; trace?: TurnTrace | null },
  ): Promise<MessageView> {
    const id = randomUUID();
    const at = new Date().toISOString();
    await this.db.query(
      'INSERT INTO messages (id, conversation_id, role, author_name, content, ui, trace, created_at) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8)',
      [id, conversationId, m.role, m.authorName, m.content, JSON.stringify(m.ui ?? []), m.trace ? JSON.stringify(m.trace) : null, at],
    );
    // Mensagens de sistema não viram prévia na lista do console.
    const plain = m.content.replace(/\*\*/g, '');
    const preview = m.role === 'system' ? null : m.role === 'assistant' ? `Nexo: ${plain}` : plain;
    const isUser = m.role === 'user' ? 1 : 0;
    await this.db.query(
      `UPDATE conversations SET updated_at = $1, last_preview = COALESCE($2, last_preview),
         user_message_count = user_message_count + $3,
         unread_for_analyst = unread_for_analyst + CASE WHEN $3 = 1 AND status <> 'agent' THEN 1 ELSE 0 END
       WHERE id = $4`,
      [at, preview?.slice(0, 140) ?? null, isUser, conversationId],
    );
    return { id, role: m.role, authorName: m.authorName, content: m.content, ui: m.ui ?? [], trace: m.trace ?? null, createdAt: at };
  }

  async listMessages(conversationId: string): Promise<MessageView[]> {
    const rows = await this.db.query<RawMessage>('SELECT * FROM messages WHERE conversation_id = $1 ORDER BY seq ASC', [conversationId]);
    return rows.map(toMessage);
  }

  // ---------- rascunhos ----------

  async nextDraftId(): Promise<string> {
    const r = await this.one<{ n: number }>("UPDATE counters SET next = next + 1 WHERE name = 'draft' RETURNING next - 1 AS n");
    return `D-${r!.n}`;
  }

  async saveDraft(conversationId: string, draft: DraftView) {
    await this.db.query(
      'INSERT INTO drafts (id, conversation_id, data) VALUES ($1, $2, $3::jsonb) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data',
      [draft.id, conversationId, JSON.stringify(draft)],
    );
  }

  async getDraft(id: string): Promise<{ conversationId: string; draft: DraftView } | null> {
    const r = await this.one<{ conversation_id: string; data: DraftView }>('SELECT * FROM drafts WHERE id = $1', [id]);
    return r ? { conversationId: r.conversation_id, draft: r.data } : null;
  }

  async listDrafts(conversationId: string): Promise<Record<string, DraftView>> {
    const rows = await this.db.query<{ data: DraftView }>('SELECT data FROM drafts WHERE conversation_id = $1', [conversationId]);
    return Object.fromEntries(rows.map((r) => [r.data.id, r.data]));
  }

  // ---------- custo ----------

  /** Conta um turno do agent; devolve o total do dia. */
  async countTurn(userEmail: string, now = new Date()): Promise<number> {
    const r = await this.one<{ turns: number }>(
      `INSERT INTO daily_usage (user_email, day, turns) VALUES ($1, $2, 1)
       ON CONFLICT (user_email, day) DO UPDATE SET turns = daily_usage.turns + 1 RETURNING turns`,
      [userEmail, now.toISOString().slice(0, 10)],
    );
    return r!.turns;
  }
}
