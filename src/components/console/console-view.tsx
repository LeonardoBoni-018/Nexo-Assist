'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, Bot, CheckCheck, CircleCheck, Hand, Headset, LoaderCircle, LogOut, MessagesSquare, Search, Sparkles, Undo2, X } from 'lucide-react';
import { addBusinessMinutes, formatAgo, formatLocalDate, formatLocalDateTime } from '@/domain/sla';
import { OPEN_STATUSES, PRIORITY_LABEL, STATUS_LABEL } from '@/domain/types';
import type { ConversationView, MessageView, TicketSummary, UiBlock } from '@/shared/chat';
import type { ConsoleItem } from '@/server/console';
import { Avatar, NexoMark } from '../brand';
import { useLogout } from '../sidebar';
import { useRouter } from 'next/navigation';
import { DecisionPanel, StatusLine } from '../chat/decision-panel';
import { RichText } from '../chat/messages';
import { STATUS_DOT } from '../chat/blocks';

type Filter = 'all' | 'needsHuman' | 'withAgent' | 'mine';
interface ListData {
  me: { name: string; email: string; supportLevel: string | null };
  items: ConsoleItem[];
  counts: Record<'all' | 'needsHuman' | 'withAgent' | 'mine', number>;
}
interface Detail {
  conversation: ConversationView;
  focusTicketId: string | null;
  user: { name: string; email: string; department: string; device: string | null };
  tickets: TicketSummary[] | null;
  ticketsError: string | null;
}

class SessionExpired extends Error {}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'content-type': 'application/json' } });
  if (res.status === 401) throw new SessionExpired();
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? 'Algo deu errado.');
  return data;
}

const TAG_TONE: Record<ConsoleItem['tag']['tone'], { dot: string; text: string }> = {
  danger: { dot: 'bg-danger', text: 'text-danger-text' },
  warning: { dot: 'bg-warning', text: 'text-warning-text' },
  success: { dot: 'bg-success', text: 'text-success-text' },
  primary: { dot: 'bg-primary', text: 'text-primary-text' },
  muted: { dot: 'bg-ink-3/40', text: 'text-ink-3' },
};

function timeLabel(iso: string, now: Date) {
  const diff = now.getTime() - new Date(iso).getTime();
  if (diff < 60_000) return 'agora';
  if (diff < 86_400_000) return formatLocalDateTime(iso, now).slice(-5);
  return diff < 2 * 86_400_000 ? 'ontem' : formatLocalDate(iso);
}

export function ConsoleView() {
  const [list, setList] = useState<ListData | null>(null);
  const [filter, setFilter] = useState<Filter>('needsHuman');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [now, setNow] = useState(() => new Date());
  const scroller = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const logout = useLogout();
  const selectedRef = useRef<string | null>(null);

  const fail = useCallback(
    (e: unknown, fallback: string) => {
      if (e instanceof SessionExpired) router.replace('/login');
      else setError(e instanceof Error ? e.message : fallback);
    },
    [router],
  );

  const loadList = useCallback(
    () =>
      api<ListData>('/api/console/conversations').then(
        (data) => {
          setList(data);
          setSelected((s) => s ?? data.items.find((i) => i.needsHuman)?.id ?? data.items[0]?.id ?? null);
        },
        (e: unknown) => fail(e, 'Falha ao carregar conversas.'),
      ),
    [fail],
  );

  // Ignora respostas que chegam depois de o analista trocar de conversa.
  const loadDetail = useCallback(
    (id: string) =>
      api<Detail>(`/api/console/conversations/${id}`).then(
        (d) => {
          if (selectedRef.current === id) setDetail(d);
        },
        (e: unknown) => fail(e, 'Falha ao carregar a conversa.'),
      ),
    [fail],
  );

  useEffect(() => {
    const tick = () => {
      void loadList();
      setNow(new Date());
    };
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 3000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [loadList]);

  useEffect(() => {
    selectedRef.current = selected;
    if (!selected) return;
    const first = setTimeout(() => void loadDetail(selected), 0);
    const t = setInterval(() => void loadDetail(selected), 3000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [selected, loadDetail]);

  function select(id: string) {
    if (id === selected) return;
    setDetail(null);
    setText('');
    setSelected(id);
  }

  const msgCount = detail?.conversation.messages.length ?? 0;
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [msgCount, selected]);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (list?.items ?? []).filter((i) => {
      if (filter === 'needsHuman' && !i.needsHuman) return false;
      if (filter === 'withAgent' && i.status !== 'agent') return false;
      if (filter === 'mine' && !(i.assignedToMe && i.status === 'human')) return false;
      if (!q) return true;
      return i.userName.toLowerCase().includes(q) || i.lastPreview.toLowerCase().includes(q) || i.tag.label.toLowerCase().includes(q);
    });
  }, [list, filter, query]);

  async function act(action: 'takeover' | 'return' | 'close' | 'message') {
    if (!selected || acting) return;
    setActing(action);
    setError(null);
    try {
      await api(`/api/console/conversations/${selected}/${action}`, { method: 'POST', body: action === 'message' ? JSON.stringify({ text }) : '{}' });
      if (action === 'message') setText('');
      await Promise.all([loadDetail(selected), loadList()]);
    } catch (e) {
      fail(e, 'Não foi possível concluir.');
    } finally {
      setActing(null);
    }
  }

  const conv = detail?.conversation;
  const item = list?.items.find((i) => i.id === selected);
  const mineNow = conv?.status === 'human' && item?.assignedToMe;
  const firstName = detail?.user.name.split(' ')[0] ?? '';

  return (
    <div className="flex h-screen overflow-hidden bg-paper">
      {/* trilho */}
      <nav className="flex w-16 shrink-0 flex-col items-center gap-4 border-r border-rule py-4">
        <NexoMark size={22} />
        <span className="relative mt-3 flex size-10 items-center justify-center rounded-xl bg-desk">
          <MessagesSquare size={18} className="text-ink-2" />
          {list?.counts.needsHuman ? (
            <span className="absolute -top-1 -right-1 flex size-[18px] items-center justify-center rounded-full bg-cta text-[10.5px] font-bold text-white">{list.counts.needsHuman}</span>
          ) : null}
        </span>
        <span className="flex-1" />
        {list ? <Avatar name={list.me.name} size={32} online /> : null}
        <button onClick={logout} className="rounded-lg p-2 text-ink-3 hover:bg-desk" aria-label="Sair">
          <LogOut size={16} />
        </button>
      </nav>

      {/* lista de conversas */}
      <section className="flex w-[330px] shrink-0 flex-col border-r border-rule">
        <div className="flex flex-col gap-3 px-4 pt-4 pb-3">
          <div className="flex items-center justify-between">
            <h1 className="text-[19px] font-bold">Conversas</h1>
            <span className="flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-[12px] font-semibold text-success-text">
              <span className="size-1.5 rounded-full bg-success" /> Disponível
            </span>
          </div>
          <label className="flex items-center gap-2 rounded-lg bg-desk px-3 py-2">
            <Search size={15} className="text-ink-3" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Pesquisar conversa ou chamado" className="w-full bg-transparent text-[13.5px] outline-none placeholder:text-ink-3" />
          </label>
          <div className="flex gap-0.5">
            {(
              [
                ['all', 'Todas', null],
                ['needsHuman', 'Para você', list?.counts.needsHuman],
                ['withAgent', 'Com o agent', list?.counts.withAgent],
                ['mine', 'Minhas', list?.counts.mine],
              ] as const
            ).map(([key, label, count]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`rounded-full px-2 py-1 text-[12.5px] font-medium whitespace-nowrap ${filter === key ? 'bg-primary-soft text-primary-text' : 'text-ink-2 hover:bg-desk'}`}
              >
                {label} {count ? <span className="ml-0.5">{count}</span> : null}
              </button>
            ))}
          </div>
        </div>
        <ul className="scrollbar-thin flex-1 overflow-y-auto px-2 pb-3">
          {!list ? (
            <li className="flex justify-center py-10 text-ink-3">
              <LoaderCircle className="animate-spin" />
            </li>
          ) : items.length === 0 ? (
            <li className="px-3 py-10 text-center text-[13px] text-ink-3">Nenhuma conversa neste filtro.</li>
          ) : (
            items.map((i) => (
              <li key={i.id}>
                <button onClick={() => select(i.id)} className={`flex w-full gap-3 rounded-xl px-3 py-3 text-left ${selected === i.id ? 'bg-desk' : 'hover:bg-desk/60'}`}>
                  <Avatar name={i.userName} size={40} />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[14.5px] font-semibold">{i.userName}</span>
                      <span className={`shrink-0 text-[12px] ${i.unread ? 'font-semibold text-primary-text' : 'text-ink-3'}`}>{timeLabel(i.updatedAt, now)}</span>
                    </span>
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-[13px] text-ink-3">{i.lastPreview}</span>
                      {i.unread ? <span className="flex size-[18px] shrink-0 items-center justify-center rounded-full bg-cta text-[10.5px] font-bold text-white">{i.unread}</span> : null}
                    </span>
                    <span className={`flex items-center gap-1.5 text-[11.5px] font-medium ${TAG_TONE[i.tag.tone].text}`}>
                      <span className={`size-1.5 rounded-full ${TAG_TONE[i.tag.tone].dot}`} />
                      {i.tag.label}
                    </span>
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      </section>

      {/* conversa */}
      <section className="flex min-w-0 flex-1 flex-col bg-desk">
        {!conv || !detail ? (
          <div className="flex flex-1 items-center justify-center text-[13.5px] text-ink-3">{selected ? <LoaderCircle className="animate-spin" /> : 'Selecione uma conversa.'}</div>
        ) : (
          <>
            <header className="flex items-center gap-3 border-b border-rule bg-paper px-5 py-3">
              <Avatar name={detail.user.name} size={38} />
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold">{detail.user.name}</p>
                <p className="truncate text-[12.5px] text-ink-3">
                  {detail.user.department}
                  {detail.user.device ? ` · ${detail.user.device}` : ''}
                  {detail.focusTicketId ? ` · ${detail.focusTicketId}` : ''}
                </p>
              </div>
              {mineNow ? (
                <>
                  <button onClick={() => act('return')} disabled={!!acting} className="flex items-center gap-1.5 rounded-lg border border-rule px-3 py-1.5 text-[13px] font-medium hover:bg-desk">
                    <Undo2 size={14} /> Devolver ao agent
                  </button>
                  <button onClick={() => act('close')} disabled={!!acting} className="flex items-center gap-1.5 rounded-lg bg-danger-soft px-3 py-1.5 text-[13px] font-semibold text-danger-text hover:bg-danger/15">
                    <CircleCheck size={14} /> Encerrar atendimento
                  </button>
                </>
              ) : (
                <ModeBadge status={conv.status} analyst={conv.assignedAnalyst} />
              )}
            </header>

            <div ref={scroller} className="scrollbar-thin flex-1 overflow-y-auto">
              <div className="mx-auto flex max-w-[820px] flex-col gap-3 px-6 py-6">
                {conv.handoff ? <HandoffSummary handoff={conv.handoff} /> : null}
                {conv.messages.map((m) => (
                  <ConsoleMessage key={m.id} m={m} now={now} drafts={conv.drafts} />
                ))}
              </div>
            </div>

            <footer className="border-t border-rule bg-paper px-5 py-3">
              {error ? (
                <p className="mb-2 flex items-center justify-between rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger-text">
                  {error}
                  <button onClick={() => setError(null)} aria-label="Fechar">
                    <X size={14} />
                  </button>
                </p>
              ) : null}
              {conv.status === 'closed' ? (
                <p className="py-2 text-center text-[13px] text-ink-3">Atendimento encerrado.</p>
              ) : mineNow ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (text.trim()) void act('message');
                  }}
                  className="flex items-end gap-2 rounded-xl border border-rule px-3 py-2 focus-within:border-cta/50"
                >
                  <textarea
                    rows={1}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        if (text.trim()) void act('message');
                      }
                    }}
                    placeholder={`Responder para ${firstName}…`}
                    className="max-h-32 flex-1 resize-none bg-transparent py-1 text-[14px] outline-none"
                  />
                  <button type="submit" disabled={!text.trim() || !!acting} className="flex size-8 items-center justify-center rounded-full bg-cta text-white disabled:opacity-50" aria-label="Enviar">
                    {acting === 'message' ? <LoaderCircle size={15} className="animate-spin" /> : <ArrowUp size={16} />}
                  </button>
                </form>
              ) : conv.status === 'human' ? (
                <p className="py-2 text-center text-[13px] text-ink-3">{conv.assignedAnalyst} está atendendo esta conversa.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <span className={`flex size-9 items-center justify-center rounded-full ${conv.status === 'waiting_human' ? 'bg-warning-soft' : 'bg-primary-soft'}`}>
                      {conv.status === 'waiting_human' ? <Hand size={17} className="text-warning-text" /> : <Bot size={17} className="text-primary-text" />}
                    </span>
                    <div className="flex-1">
                      <p className="text-[14px] font-semibold">{conv.status === 'waiting_human' ? `${firstName} espera um atendente` : 'O Nexo Assist está atendendo'}</p>
                      <p className="text-[12.5px] text-ink-3">
                        {conv.status === 'waiting_human' && conv.handoff
                          ? `Agent pausado · responder até ${formatLocalDateTime(addBusinessMinutes(new Date(conv.handoff.at), 120).toISOString(), now)}`
                          : 'Você pode assumir a qualquer momento; o agent fica pausado.'}
                      </p>
                    </div>
                    {conv.status === 'waiting_human' ? (
                      <button onClick={() => act('return')} disabled={!!acting} className="flex items-center gap-1.5 rounded-lg border border-rule px-3 py-2 text-[13px] font-medium hover:bg-desk">
                        <Bot size={14} /> Devolver ao agent
                      </button>
                    ) : null}
                    <button onClick={() => act('takeover')} disabled={!!acting} className="flex items-center gap-1.5 rounded-lg bg-cta px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-cta-hover">
                      {acting === 'takeover' ? <LoaderCircle size={14} className="animate-spin" /> : <Headset size={14} />} Assumir atendimento
                    </button>
                  </div>
                  <p className="rounded-lg bg-desk px-3 py-2 text-[13px] text-ink-3">Assuma o atendimento para responder</p>
                </div>
              )}
            </footer>
          </>
        )}
      </section>

      {/* chamados do funcionário */}
      {detail ? <TicketPanel detail={detail} now={now} /> : <aside className="hidden w-[300px] shrink-0 border-l border-rule xl:block" />}
    </div>
  );
}

function ModeBadge({ status, analyst }: { status: ConversationView['status']; analyst: string | null }) {
  const m = {
    waiting_human: { cls: 'bg-warning-soft text-warning-text', icon: <Hand size={13} />, label: 'Aguardando atendente' },
    agent: { cls: 'bg-primary-soft text-primary-text', icon: <Bot size={13} />, label: 'Agent atendendo' },
    human: { cls: 'bg-success-soft text-success-text', icon: <Headset size={13} />, label: `Com ${analyst}` },
    closed: { cls: 'bg-desk text-ink-3', icon: <CircleCheck size={13} />, label: 'Encerrada' },
  }[status];
  return <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-semibold ${m.cls}`}>{m.icon}{m.label}</span>;
}

function HandoffSummary({ handoff }: { handoff: NonNullable<ConversationView['handoff']> }) {
  return (
    <div className="rounded-xl border border-warning/30 bg-paper p-4 text-[13.5px]">
      <p className="mb-1.5 flex items-center gap-2 text-[12.5px] font-semibold text-warning-text">
        <Sparkles size={14} /> Resumo do agent para o Suporte {handoff.level} · {handoff.reason}
        {handoff.lowConfidence != null ? ` · confiança ${Math.round(handoff.lowConfidence * 100)}%` : ''}
      </p>
      <p className="text-ink-2">{handoff.summary}</p>
    </div>
  );
}

function blockChip(b: UiBlock, drafts: ConversationView['drafts']): string | null {
  switch (b.type) {
    case 'draft': {
      const d = drafts[b.draftId];
      if (!d) return `Rascunho ${b.draftId}`;
      const st = d.status === 'confirmed' ? `confirmado → ${d.ticketId}` : d.status === 'cancelled' ? 'cancelado' : 'aguardando confirmação';
      return `Rascunho ${d.id} · ${d.title} · ${PRIORITY_LABEL[d.priority]} · ${st}`;
    }
    case 'ticket':
      return `Card ${b.ticket.id} · ${STATUS_LABEL[b.ticket.status]}${b.ticket.overdue ? ' · vencido' : ''}`;
    case 'ticket_selector':
      return `Seletor: ${b.tickets.map((t) => t.id).join(', ')}`;
    case 'options':
      return `${b.question} ${b.options.join(' · ')}`;
    case 'articles':
      return `Artigos: ${b.articles.map((a) => a.title).join(', ')}`;
    case 'handoff':
      return null;
  }
}

function ConsoleMessage({ m, now, drafts }: { m: MessageView; now: Date; drafts: ConversationView['drafts'] }) {
  const [open, setOpen] = useState(false);
  const time = formatLocalDateTime(m.createdAt, now);
  if (m.role === 'system') {
    return (
      <div className="flex items-center gap-3 py-1 text-[12px] text-ink-3">
        <span className="h-px flex-1 bg-rule" />
        {m.content}
        <span className="h-px flex-1 bg-rule" />
      </div>
    );
  }
  if (m.role === 'user') {
    return (
      <div className="flex">
        <div className="max-w-[70%] rounded-[4px_12px_12px_12px] border border-rule bg-paper px-3.5 py-2 text-[14px]">
          <span className="whitespace-pre-wrap">{m.content}</span>
          <span className="ml-2 align-bottom text-[11px] text-ink-3">{time}</span>
        </div>
      </div>
    );
  }
  const isAgent = m.role === 'assistant';
  const chips = m.ui.map((b) => blockChip(b, drafts)).filter((c): c is string => Boolean(c));
  return (
    <div className="flex flex-col items-end gap-1">
      <p className="flex items-center gap-1.5 text-[12px] font-semibold">
        {m.authorName}
        <span className={`rounded px-1.5 py-px text-[10.5px] ${isAgent ? 'bg-primary-soft text-primary-text' : 'bg-success-soft text-success-text'}`}>{isAgent ? 'IA' : 'Analista'}</span>
      </p>
      <div className={`max-w-[70%] rounded-[12px_4px_12px_12px] px-3.5 py-2.5 text-[14px] ${isAgent ? 'bg-agent-bubble' : 'bg-human-bubble'}`}>
        <RichText text={m.content} />
        {chips.length ? (
          <ul className="mt-2 flex flex-col gap-1">
            {chips.map((c) => (
              <li key={c} className="rounded-md bg-paper/70 px-2 py-1 text-[12px] text-ink-2">
                {c}
              </li>
            ))}
          </ul>
        ) : null}
        <p className="mt-1 flex items-center justify-end gap-1 text-[11px] text-ink-3">
          {time} <CheckCheck size={13} className="text-primary" />
        </p>
      </div>
      {isAgent && m.trace ? (
        <div className="flex max-w-[70%] flex-col items-end gap-2">
          <StatusLine steps={m.trace.steps} trace={m.trace} open={open} onToggle={() => setOpen((o) => !o)} who="" />
          {open ? <DecisionPanel trace={m.trace} /> : null}
        </div>
      ) : null}
    </div>
  );
}

function TicketPanel({ detail, now }: { detail: Detail; now: Date }) {
  const first = detail.user.name.split(' ')[0];
  const tickets = detail.tickets ?? [];
  const open = tickets.filter((t) => OPEN_STATUSES.includes(t.status));
  const focus = tickets.find((t) => t.id === detail.focusTicketId) ?? null;
  const others = tickets.filter((t) => t.id !== focus?.id);
  return (
    <aside className="hidden w-[300px] shrink-0 flex-col border-l border-rule xl:flex">
      <div className="border-b border-rule px-5 py-4">
        <p className="text-[15px] font-semibold">Chamados de {first}</p>
        <p className="text-[12.5px] text-ink-3">{detail.tickets ? `${open.length} abertos · ${tickets.length - open.length} encerrados` : '—'}</p>
      </div>
      <div className="scrollbar-thin flex flex-1 flex-col gap-5 overflow-y-auto px-4 py-4">
        {detail.ticketsError ? <p className="rounded-lg bg-warning-soft px-3 py-2 text-[12.5px] text-warning-text">{detail.ticketsError}</p> : null}
        {focus ? (
          <div>
            <p className="mb-2 text-[12px] font-medium text-ink-3">Desta conversa</p>
            <div className="rounded-xl border border-rule p-3.5">
              <p className="flex items-center justify-between text-[12px] text-ink-3">
                {focus.id}
                <span className="flex items-center gap-1.5">
                  <span className={`size-1.5 rounded-full ${focus.overdue ? 'bg-danger' : STATUS_DOT[focus.status]}`} />
                  {STATUS_LABEL[focus.status]}
                </span>
              </p>
              <p className="mt-1 text-[14px] font-semibold">{focus.title}</p>
              <p className="text-[12.5px] text-ink-3">
                {focus.category} · prioridade {PRIORITY_LABEL[focus.priority].toLowerCase()}
              </p>
              <p className={`mt-2 border-t border-rule pt-2 text-[12px] ${focus.overdue ? 'text-danger-text' : 'text-ink-3'}`}>
                {focus.overdue ? `Prazo vencido · atualizado ${formatAgo(focus.updatedAt, now)}` : focus.dueAt ? `Responder até ${formatLocalDateTime(focus.dueAt, now)}` : `Atualizado ${formatAgo(focus.updatedAt, now)}`}
              </p>
            </div>
          </div>
        ) : null}
        <div>
          <p className="mb-1 text-[12px] font-medium text-ink-3">{focus ? 'Outros chamados' : 'Chamados'}</p>
          <ul className="flex flex-col">
            {others.map((t) => (
              <li key={t.id} className="flex gap-2.5 border-b border-rule py-2.5 last:border-b-0">
                <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${t.overdue ? 'bg-danger' : STATUS_DOT[t.status]}`} />
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px] font-medium">{t.title}</span>
                  <span className="text-[12px] text-ink-3">
                    {t.id} · {STATUS_LABEL[t.status]}
                    {t.overdue ? ' · vencido' : ''}
                  </span>
                </span>
              </li>
            ))}
            {detail.tickets && others.length === 0 ? <li className="py-2 text-[12.5px] text-ink-3">Nenhum outro chamado.</li> : null}
          </ul>
        </div>
      </div>
    </aside>
  );
}
