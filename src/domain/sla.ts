import { OPEN_STATUSES, type Priority, type Ticket } from './types';

/**
 * Prazos do Anexo A. "Crítica" conta em horas corridas (há plantão 24 h);
 * as demais contam no horário do service desk: seg–sex, 8h–18h (Brasília).
 * Um dia útil = 10 horas úteis.
 */
const OPEN_HOUR = 8;
const CLOSE_HOUR = 18;
const BUSINESS_DAY_MIN = (CLOSE_HOUR - OPEN_HOUR) * 60;
/** Brasília não tem horário de verão desde 2019: UTC−3 fixo. */
const TZ_OFFSET_MIN = -3 * 60;

export const SLA: Record<Priority, { minutes: number; businessTime: boolean; label: string }> = {
  critica: { minutes: 60, businessTime: false, label: '1 hora' },
  alta: { minutes: 4 * 60, businessTime: true, label: '4 horas úteis' },
  media: { minutes: 3 * BUSINESS_DAY_MIN, businessTime: true, label: '3 dias úteis' },
  baixa: { minutes: 5 * BUSINESS_DAY_MIN, businessTime: true, label: '5 dias úteis' },
};

const MIN = 60_000;

/** Date "deslocada" para o fuso local; use apenas os getters UTC dela. */
const toLocal = (d: Date) => new Date(d.getTime() + TZ_OFFSET_MIN * MIN);
const fromLocal = (d: Date) => new Date(d.getTime() - TZ_OFFSET_MIN * MIN);

function isBusinessDay(local: Date): boolean {
  const day = local.getUTCDay();
  return day !== 0 && day !== 6;
}

/** Próximo instante (local) dentro do expediente, a partir de `local`. */
function nextBusinessInstant(local: Date): Date {
  const d = new Date(local);
  for (let guard = 0; guard < 14; guard++) {
    const minutes = d.getUTCHours() * 60 + d.getUTCMinutes();
    if (isBusinessDay(d) && minutes < CLOSE_HOUR * 60) {
      if (minutes < OPEN_HOUR * 60) d.setUTCHours(OPEN_HOUR, 0, 0, 0);
      return d;
    }
    d.setUTCDate(d.getUTCDate() + 1);
    d.setUTCHours(OPEN_HOUR, 0, 0, 0);
  }
  return d;
}

export function addBusinessMinutes(start: Date, minutes: number): Date {
  let local = nextBusinessInstant(toLocal(start));
  let remaining = minutes;
  while (remaining > 0) {
    const close = new Date(local);
    close.setUTCHours(CLOSE_HOUR, 0, 0, 0);
    const available = (close.getTime() - local.getTime()) / MIN;
    if (remaining <= available) {
      local = new Date(local.getTime() + remaining * MIN);
      remaining = 0;
    } else {
      remaining -= available;
      local = nextBusinessInstant(close);
    }
  }
  return fromLocal(local);
}

export function computeDueAt(priority: Priority, anchor: Date): Date {
  const rule = SLA[priority];
  return rule.businessTime
    ? addBusinessMinutes(anchor, rule.minutes)
    : new Date(anchor.getTime() + rule.minutes * MIN);
}

export interface SlaStatus {
  dueAt: string | null;
  overdue: boolean;
  /** Prazo pausado (aguardando o funcionário) ou encerrado. */
  running: boolean;
  slaLabel: string;
}

export function slaStatus(ticket: Pick<Ticket, 'priority' | 'status' | 'slaAnchorAt'>, now: Date): SlaStatus {
  const slaLabel = SLA[ticket.priority].label;
  const running = OPEN_STATUSES.includes(ticket.status) && ticket.status !== 'aguardando_usuario';
  if (!running) return { dueAt: null, overdue: false, running, slaLabel };
  const due = computeDueAt(ticket.priority, new Date(ticket.slaAnchorAt));
  return { dueAt: due.toISOString(), overdue: now.getTime() > due.getTime(), running, slaLabel };
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const pad = (n: number) => String(n).padStart(2, '0');

/** "13:43" no mesmo dia; "23 out, 10:00" em outro dia. Sempre no fuso de Brasília. */
export function formatLocalDateTime(iso: string, now: Date): string {
  const d = toLocal(new Date(iso));
  const n = toLocal(now);
  const time = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  const sameDay =
    d.getUTCFullYear() === n.getUTCFullYear() && d.getUTCMonth() === n.getUTCMonth() && d.getUTCDate() === n.getUTCDate();
  return sameDay ? time : `${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]}, ${time}`;
}

export function formatLocalDate(iso: string): string {
  const d = toLocal(new Date(iso));
  return `${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]}`;
}

/** "há 5 dias", "há 3 h", "agora". */
export function formatAgo(iso: string, now: Date): string {
  const diffMin = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / MIN));
  if (diffMin < 1) return 'agora';
  if (diffMin < 60) return `há ${diffMin} min`;
  const h = Math.round(diffMin / 60);
  if (h < 24) return `há ${h} h`;
  const days = Math.round(h / 24);
  return days === 1 ? 'há 1 dia' : `há ${days} dias`;
}

/** Hora local (Brasília) — usada pelo agent para saber se está no expediente. */
export function localClock(now: Date): { weekday: number; hour: number; iso: string; inBusinessHours: boolean } {
  const l = toLocal(now);
  const hour = l.getUTCHours();
  const inBusinessHours = isBusinessDay(l) && hour >= OPEN_HOUR && hour < CLOSE_HOUR;
  const iso = `${l.getUTCFullYear()}-${pad(l.getUTCMonth() + 1)}-${pad(l.getUTCDate())}T${pad(hour)}:${pad(l.getUTCMinutes())}-03:00`;
  return { weekday: l.getUTCDay(), hour, iso, inBusinessHours };
}
