import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { PEOPLE, type Person } from '../../seed/people';
import type { ConversationStatus, ConversationView, DraftView, MessageRole, MessageView, TurnTrace, UiBlock } from '@/shared/chat';

/**
 * Banco do app: usuários, conversas, mensagens (com o rastro de decisões do
 * agent) e rascunhos de chamado. Tudo em SQLite (node:sqlite) para que o
 * estado sobreviva a um reinício.
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
  handoff: string | null;
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
  ui: string;
  trace: string | null;
  created_at: string;
}

const toConversation = (r: RawConversation): ConversationRow => ({
  id: r.id,
  userEmail: r.user_email,
  status: r.status,
  assignedAnalystEmail: r.assigned_analyst_email,
  assignedAnalystName: r.assigned_analyst_name,
  handoff: r.handoff ? JSON.parse(r.handoff) : null,
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
  ui: JSON.parse(r.ui) as UiBlock[],
  trace: r.trace ? (JSON.parse(r.trace) as TurnTrace) : null,
  createdAt: r.created_at,
});

export class AppStore {
  readonly db: DatabaseSync;

  constructor(file: string) {
    if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS users (
        email TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL,
        department TEXT NOT NULL, device TEXT, support_level TEXT
      );
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        user_email TEXT NOT NULL REFERENCES users(email),
        status TEXT NOT NULL,
        assigned_analyst_email TEXT, assigned_analyst_name TEXT,
        handoff TEXT,
        user_message_count INTEGER NOT NULL DEFAULT 0,
        focus_ticket_id TEXT,
        unread_for_analyst INTEGER NOT NULL DEFAULT 0,
        last_preview TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS conversations_user ON conversations(user_email, updated_at);
      CREATE TABLE IF NOT EXISTS messages (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        conversation_id TEXT NOT NULL REFERENCES conversations(id),
        role TEXT NOT NULL, author_name TEXT NOT NULL,
        content TEXT NOT NULL, ui TEXT NOT NULL DEFAULT '[]', trace TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS messages_conversation ON messages(conversation_id, seq);
      CREATE TABLE IF NOT EXISTS drafts (
        id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, data TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS counters (name TEXT PRIMARY KEY, next INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS daily_usage (user_email TEXT, day TEXT, turns INTEGER NOT NULL, PRIMARY KEY (user_email, day));
    `);
    const insert = this.db.prepare(
      'INSERT OR IGNORE INTO users (email, name, role, department, device, support_level) VALUES (?, ?, ?, ?, ?, ?)',
    );
    for (const p of PEOPLE) insert.run(p.email, p.name, p.role, p.department, p.device, p.supportLevel ?? null);
    this.db.prepare('INSERT OR IGNORE INTO counters (name, next) VALUES (?, ?)').run('draft', 381);
  }

  // ---------- usuários ----------

  findUser(email: string): Person | null {
    const r = this.db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase()) as
      | { email: string; name: string; role: Person['role']; department: string; device: string | null; support_level: 'N1' | 'N2' | null }
      | undefined;
    if (!r) return null;
    return { email: r.email, name: r.name, role: r.role, department: r.department, device: r.device, ...(r.support_level ? { supportLevel: r.support_level } : {}) };
  }

  // ---------- conversas ----------

  getConversation(id: string): ConversationRow | null {
    const r = this.db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as RawConversation | undefined;
    return r ? toConversation(r) : null;
  }

  /** Última conversa não encerrada do funcionário ("voltar e continuar de onde parei"). */
  getOpenConversation(userEmail: string): ConversationRow | null {
    const r = this.db
      .prepare("SELECT * FROM conversations WHERE user_email = ? AND status != 'closed' ORDER BY updated_at DESC LIMIT 1")
      .get(userEmail) as RawConversation | undefined;
    return r ? toConversation(r) : null;
  }

  getLatestConversation(userEmail: string): ConversationRow | null {
    const r = this.db
      .prepare('SELECT * FROM conversations WHERE user_email = ? ORDER BY updated_at DESC LIMIT 1')
      .get(userEmail) as RawConversation | undefined;
    return r ? toConversation(r) : null;
  }

  createConversation(userEmail: string): ConversationRow {
    const id = randomUUID();
    const at = new Date().toISOString();
    this.db
      .prepare("INSERT INTO conversations (id, user_email, status, created_at, updated_at) VALUES (?, ?, 'agent', ?, ?)")
      .run(id, userEmail, at, at);
    return this.getConversation(id)!;
  }

  listConversations(): Array<ConversationRow & { userName: string; userDepartment: string }> {
    const rows = this.db
      .prepare(
        `SELECT c.*, u.name AS user_name, u.department AS user_department FROM conversations c
         JOIN users u ON u.email = c.user_email
         WHERE c.user_message_count > 0 ORDER BY c.updated_at DESC LIMIT 200`,
      )
      .all() as unknown as Array<RawConversation & { user_name: string; user_department: string }>;
    return rows.map((r) => ({ ...toConversation(r), userName: r.user_name, userDepartment: r.user_department }));
  }

  updateConversation(
    id: string,
    patch: Partial<Pick<ConversationRow, 'status' | 'assignedAnalystEmail' | 'assignedAnalystName' | 'handoff' | 'focusTicketId' | 'unreadForAnalyst'>>,
  ) {
    const cols: Record<string, unknown> = {};
    if (patch.status !== undefined) cols.status = patch.status;
    if (patch.assignedAnalystEmail !== undefined) cols.assigned_analyst_email = patch.assignedAnalystEmail;
    if (patch.assignedAnalystName !== undefined) cols.assigned_analyst_name = patch.assignedAnalystName;
    if (patch.handoff !== undefined) cols.handoff = patch.handoff ? JSON.stringify(patch.handoff) : null;
    if (patch.focusTicketId !== undefined) cols.focus_ticket_id = patch.focusTicketId;
    if (patch.unreadForAnalyst !== undefined) cols.unread_for_analyst = patch.unreadForAnalyst;
    const keys = Object.keys(cols);
    if (keys.length === 0) return;
    // Marcar como lida não deve reordenar a lista do console.
    const touch = keys.some((k) => k !== 'unread_for_analyst');
    this.db
      .prepare(`UPDATE conversations SET ${keys.map((k) => `${k} = ?`).join(', ')}${touch ? ', updated_at = ?' : ''} WHERE id = ?`)
      .run(...(Object.values(cols) as Array<string | number | null>), ...(touch ? [new Date().toISOString()] : []), id);
  }

  // ---------- mensagens ----------

  addMessage(
    conversationId: string,
    m: { role: MessageRole; authorName: string; content: string; ui?: UiBlock[]; trace?: TurnTrace | null },
  ): MessageView {
    const id = randomUUID();
    const at = new Date().toISOString();
    this.db
      .prepare('INSERT INTO messages (id, conversation_id, role, author_name, content, ui, trace, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, conversationId, m.role, m.authorName, m.content, JSON.stringify(m.ui ?? []), m.trace ? JSON.stringify(m.trace) : null, at);
    // Mensagens de sistema não viram prévia na lista do console.
    const preview = m.role === 'system' ? null : m.role === 'assistant' ? `Nexo: ${m.content}` : m.content;
    this.db
      .prepare(
        `UPDATE conversations SET updated_at = ?, last_preview = COALESCE(?, last_preview),
           user_message_count = user_message_count + ?,
           unread_for_analyst = unread_for_analyst + ?
         WHERE id = ?`,
      )
      .run(at, preview?.slice(0, 140) ?? null, m.role === 'user' ? 1 : 0, m.role === 'user' && this.getConversation(conversationId)?.status !== 'agent' ? 1 : 0, conversationId);
    return { id, role: m.role, authorName: m.authorName, content: m.content, ui: m.ui ?? [], trace: m.trace ?? null, createdAt: at };
  }

  listMessages(conversationId: string): MessageView[] {
    const rows = this.db
      .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY seq ASC')
      .all(conversationId) as unknown as RawMessage[];
    return rows.map(toMessage);
  }

  // ---------- rascunhos ----------

  nextDraftId(): string {
    const r = this.db.prepare("SELECT next FROM counters WHERE name = 'draft'").get() as { next: number };
    this.db.prepare("UPDATE counters SET next = next + 1 WHERE name = 'draft'").run();
    return `D-${r.next}`;
  }

  saveDraft(conversationId: string, draft: DraftView) {
    this.db.prepare('INSERT OR REPLACE INTO drafts (id, conversation_id, data) VALUES (?, ?, ?)').run(draft.id, conversationId, JSON.stringify(draft));
  }

  getDraft(id: string): { conversationId: string; draft: DraftView } | null {
    const r = this.db.prepare('SELECT * FROM drafts WHERE id = ?').get(id) as { conversation_id: string; data: string } | undefined;
    return r ? { conversationId: r.conversation_id, draft: JSON.parse(r.data) as DraftView } : null;
  }

  listDrafts(conversationId: string): Record<string, DraftView> {
    const rows = this.db.prepare('SELECT data FROM drafts WHERE conversation_id = ?').all(conversationId) as { data: string }[];
    return Object.fromEntries(rows.map((r) => JSON.parse(r.data) as DraftView).map((d) => [d.id, d]));
  }

  // ---------- custo ----------

  /** Conta um turno do agent; devolve o total do dia. */
  countTurn(userEmail: string, now = new Date()): number {
    const day = now.toISOString().slice(0, 10);
    this.db
      .prepare('INSERT INTO daily_usage (user_email, day, turns) VALUES (?, ?, 1) ON CONFLICT(user_email, day) DO UPDATE SET turns = turns + 1')
      .run(userEmail, day);
    return (this.db.prepare('SELECT turns FROM daily_usage WHERE user_email = ? AND day = ?').get(userEmail, day) as { turns: number }).turns;
  }
}
