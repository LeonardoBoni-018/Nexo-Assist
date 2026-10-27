import { OPEN_STATUSES, type Category, type Ticket } from './types';

/**
 * Detecção de duplicidade: compara o rascunho com os chamados do próprio
 * funcionário. É deliberadamente simples (sobreposição de termos + mesma
 * categoria) — o objetivo é sinalizar candidatos ao agent e ao funcionário,
 * não decidir sozinho.
 */

const STOPWORDS = new Set(
  'a o as os um uma uns umas de do da dos das no na nos nas em para por com sem que se nao não meu minha meus minhas eu me esta está estou ao aos e ou mais muito pelo pela apos após desde ontem hoje quando'.split(
    ' ',
  ),
);

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ');
}

export function terms(text: string): Set<string> {
  return new Set(
    normalize(text)
      .split(/\s+/)
      .filter((t) => t.length > 2 && !STOPWORDS.has(t))
      // radical simples: "conecta"/"conectar"/"conexao" → "cone"
      .map((t) => (t.length > 5 ? t.slice(0, 5) : t)),
  );
}

export function similarity(a: string, b: string): number {
  const ta = terms(a);
  const tb = terms(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  // sobreposição relativa ao menor conjunto: títulos curtos não são punidos
  return shared / Math.min(ta.size, tb.size);
}

export interface DuplicateCandidate {
  ticketId: string;
  title: string;
  status: Ticket['status'];
  score: number;
  /** "aberto" → atualizar; "reabrivel" → resolvido há até 7 dias. */
  action: 'atualizar' | 'reabrir';
}

export const REOPEN_WINDOW_DAYS = 7;
const DUPLICATE_THRESHOLD = 0.5;

export function canReopen(ticket: Pick<Ticket, 'status' | 'resolvedAt'>, now: Date): boolean {
  if (ticket.status !== 'resolvido' || !ticket.resolvedAt) return false;
  const ageDays = (now.getTime() - new Date(ticket.resolvedAt).getTime()) / 86_400_000;
  return ageDays <= REOPEN_WINDOW_DAYS;
}

export function findDuplicates(
  draft: { title: string; description: string; category: Category },
  tickets: Ticket[],
  now: Date,
): DuplicateCandidate[] {
  const draftText = `${draft.title} ${draft.description}`;
  return tickets
    .map((t) => {
      const open = OPEN_STATUSES.includes(t.status);
      const reopenable = canReopen(t, now);
      if (!open && !reopenable) return null;
      let score = Math.max(similarity(draft.title, t.title), similarity(draftText, `${t.title} ${t.description}`) * 0.9);
      if (t.category === draft.category) score = Math.min(1, score + 0.15);
      else score *= 0.6;
      return {
        ticketId: t.id,
        title: t.title,
        status: t.status,
        score: Math.round(score * 100) / 100,
        action: open ? 'atualizar' : 'reabrir',
      } satisfies DuplicateCandidate;
    })
    .filter((c): c is DuplicateCandidate => c !== null && c.score >= DUPLICATE_THRESHOLD)
    .sort((a, b) => b.score - a.score);
}
