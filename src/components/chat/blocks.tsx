'use client';

import { useEffect, useState } from 'react';
import { BookOpen, Headset, LoaderCircle } from 'lucide-react';
import { formatAgo, formatLocalDate, formatLocalDateTime } from '@/domain/sla';
import { AFFECTED_LABEL, CATEGORIES, PRIORITY_LABEL, STATUS_LABEL, type Priority, type TicketStatus } from '@/domain/types';
import type { DraftView, TicketSummary, UiBlock } from '@/shared/chat';

export const STATUS_DOT: Record<TicketStatus, string> = {
  aberto: 'bg-primary',
  em_andamento: 'bg-primary',
  aguardando_analista: 'bg-warning',
  aguardando_usuario: 'bg-violet',
  aprovado: 'bg-success',
  resolvido: 'bg-success',
  fechado: 'bg-ink-3/40',
};

export const PRIORITY_DOT: Record<Priority, string> = {
  critica: 'bg-danger',
  alta: 'bg-warning',
  media: 'bg-ink/40',
  baixa: 'bg-ink/20',
};

const Dot = ({ className }: { className: string }) => <span className={`inline-block size-1.5 shrink-0 rounded-full ${className}`} />;

function Field({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-[12.5px] text-ink-3">{k}</span>
      <span className="text-[14.5px] font-medium">{children}</span>
    </div>
  );
}

export function OptionsBlock({ question, options, onPick, disabled }: { question: string; options: string[]; onPick?: (o: string) => void; disabled: boolean }) {
  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-[14.5px] font-semibold">{question}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((o, i) => (
          <button
            key={o}
            disabled={disabled}
            onClick={() => onPick?.(o)}
            className="group flex items-center gap-2 rounded-lg border border-rule bg-paper px-2.5 py-1.5 text-[13.5px] font-medium hover:border-cta/40 hover:bg-primary-soft hover:text-primary-text disabled:cursor-default disabled:opacity-60 disabled:hover:border-rule disabled:hover:bg-paper disabled:hover:text-ink"
          >
            {!disabled ? <kbd className="flex size-4 items-center justify-center rounded-md bg-desk font-ui text-[11px] text-ink-3 group-hover:bg-cta group-hover:text-white">{i + 1}</kbd> : null}
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

export function TicketSelector({ tickets, onPick, disabled }: { tickets: TicketSummary[]; onPick?: (t: TicketSummary) => void; disabled: boolean }) {
  const [hover, setHover] = useState<string | null>(tickets[0]?.id ?? null);
  return (
    <div className="w-full max-w-[640px] overflow-hidden rounded-2xl border border-rule bg-paper" role="radiogroup">
      {tickets.map((t) => (
        <button
          key={t.id}
          role="radio"
          aria-checked={false}
          disabled={disabled}
          onMouseEnter={() => setHover(t.id)}
          onClick={() => onPick?.(t)}
          className={`flex w-full items-center gap-3 border-b border-rule px-4 py-3 text-left last:border-b-0 disabled:cursor-default ${hover === t.id && !disabled ? 'bg-cta/[.04]' : ''}`}
        >
          <span className={`size-4 shrink-0 rounded-full border ${hover === t.id && !disabled ? 'border-[5px] border-cta' : 'border-rule'}`} />
          <span className="w-[76px] shrink-0 text-[12.5px] font-medium text-ink-3">{t.id}</span>
          <span className="min-w-0 flex-1 truncate text-[14.5px] font-medium">{t.title}</span>
          <span className="flex shrink-0 items-center gap-1.5 text-[12.5px] text-ink-3">
            <Dot className={t.overdue ? 'bg-danger' : STATUS_DOT[t.status]} />
            {STATUS_LABEL[t.status]}
            {t.overdue ? <span className="text-danger-text">· vencido</span> : null}
          </span>
          <span className="w-11 shrink-0 text-right text-[12.5px] text-ink-3">{formatLocalDate(t.createdAt)}</span>
        </button>
      ))}
    </div>
  );
}

export function TicketCard({ ticket: t, now }: { ticket: TicketSummary; now: Date }) {
  return (
    <div className="w-full max-w-[640px] overflow-hidden rounded-2xl border border-rule bg-paper">
      <div className="flex flex-col gap-1.5 px-5 pt-4 pb-3">
        <div className="flex items-center gap-2 text-[12.5px] text-ink-3">
          <span className="font-medium">Chamado</span>
          <span className="size-[3px] rounded-full bg-rule" />
          <span>{t.id}</span>
          <span className="flex-1" />
          <span className={`flex items-center gap-1.5 font-medium ${t.status === 'aguardando_analista' ? 'text-warning-text' : t.status === 'resolvido' || t.status === 'aprovado' ? 'text-success-text' : 'text-primary-text'}`}>
            <Dot className={STATUS_DOT[t.status]} />
            {STATUS_LABEL[t.status]}
          </span>
        </div>
        <p className="text-[18px] font-semibold">{t.title}</p>
        <p className="text-[13.5px] text-ink-2">{t.description}</p>
      </div>
      <div className="mx-5 grid grid-cols-2 gap-4 border-t border-rule py-4 sm:grid-cols-4">
        <Field k="Categoria">{t.subcategory ? `${t.category} › ${t.subcategory}` : t.category}</Field>
        <Field k="Prioridade">
          <span className="flex items-center gap-1.5">
            <Dot className={PRIORITY_DOT[t.priority]} />
            {PRIORITY_LABEL[t.priority]}
          </span>
        </Field>
        {/* referência fixa no passado: sempre mostra data e hora */}
        <Field k="Aberto em">{formatLocalDateTime(t.createdAt, new Date(0))}</Field>
        <Field k="Última atualização">
          <span className={t.overdue ? 'text-warning-text' : ''}>{formatAgo(t.updatedAt, now)}</span>
          {t.overdue ? <span className="text-[13.5px] font-normal text-ink-3"> · prazo vencido</span> : t.dueAt ? <span className="block text-[12.5px] font-normal text-ink-3">resposta até {formatLocalDateTime(t.dueAt, now)}</span> : null}
        </Field>
      </div>
    </div>
  );
}

export function DraftCard({
  draft,
  now,
  active,
  onConfirm,
  onCancel,
  onEdit,
}: {
  draft: DraftView;
  now: Date;
  active: boolean;
  onConfirm: () => Promise<void>;
  onCancel: () => Promise<void>;
  onEdit: (f: Partial<Pick<DraftView, 'title' | 'description' | 'category' | 'note'>>) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [working, setWorking] = useState<'confirm' | 'cancel' | 'save' | null>(null);
  const [form, setForm] = useState({ title: draft.title, description: draft.description, category: draft.category, note: draft.note ?? '' });
  const [formError, setFormError] = useState<string | null>(null);
  const pending = draft.status === 'pending';

  // ⌘↵ / Ctrl+↵ confirma o rascunho ativo.
  useEffect(() => {
    if (!pending || !active || editing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        void run('confirm');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  async function run(kind: 'confirm' | 'cancel') {
    if (working) return;
    setWorking(kind);
    try {
      await (kind === 'confirm' ? onConfirm() : onCancel());
    } finally {
      setWorking(null);
    }
  }

  async function save() {
    setWorking('save');
    setFormError(null);
    try {
      await onEdit(draft.kind === 'create' ? { title: form.title, description: form.description, category: form.category } : { note: form.note });
      setEditing(false);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Não foi possível salvar.');
    } finally {
      setWorking(null);
    }
  }

  const kindLabel = draft.kind === 'create' ? 'Novo chamado' : draft.kind === 'update' ? `Complemento · ${draft.ticketId}` : `Reabertura · ${draft.ticketId}`;
  const state =
    draft.status === 'pending'
      ? { dot: 'bg-warning', text: 'text-warning-text', label: 'Aguardando confirmação' }
      : draft.status === 'confirmed'
        ? { dot: 'bg-success', text: 'text-success-text', label: draft.kind === 'create' ? `Criado · ${draft.ticketId}` : 'Enviado' }
        : { dot: 'bg-ink-3/40', text: 'text-ink-3', label: 'Cancelado' };
  const inputCls = 'w-full rounded-lg border border-rule bg-paper px-3 py-2 text-[14px] outline-none focus:border-cta focus:ring-3 focus:ring-cta/15';

  return (
    <div className={`w-full max-w-[640px] overflow-hidden rounded-2xl border bg-paper ${pending ? 'border-rule shadow-[0_1px_3px_rgba(27,36,49,.06)]' : 'border-rule/70 opacity-90'}`}>
      <div className="flex flex-col gap-1.5 px-5 pt-4 pb-3">
        <div className="flex items-center gap-2 text-[12.5px] text-ink-3">
          <span className="font-medium">{kindLabel}</span>
          <span className="size-[3px] rounded-full bg-rule" />
          <span>Rascunho {draft.id}</span>
          <span className="flex-1" />
          <span className={`flex items-center gap-1.5 font-medium ${state.text}`}>
            <Dot className={state.dot} />
            {state.label}
          </span>
        </div>
        {editing && draft.kind === 'create' ? (
          <div className="mt-1 flex flex-col gap-2">
            <input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} aria-label="Título" />
            <textarea className={`${inputCls} min-h-20`} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} aria-label="Descrição" />
            <select className={inputCls} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as DraftView['category'] })} aria-label="Categoria">
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
        ) : (
          <>
            <p className="text-[18px] font-semibold">{draft.title}</p>
            {draft.kind === 'create' ? <p className="text-[13.5px] text-ink-2">{draft.description}</p> : null}
          </>
        )}
        {draft.kind !== 'create' ? (
          editing ? (
            <textarea className={`${inputCls} mt-1 min-h-20`} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} aria-label="Complemento" />
          ) : (
            <p className="mt-1 rounded-lg bg-desk px-3 py-2 text-[13.5px] text-ink-2">
              <span className="font-medium text-ink">{draft.kind === 'reopen' ? 'Motivo da reabertura: ' : 'Vou adicionar: '}</span>
              {draft.note}
            </p>
          )
        ) : null}
        {formError ? <p className="text-[12.5px] text-danger-text">{formError}</p> : null}
      </div>
      <div className="mx-5 grid grid-cols-1 gap-4 border-t border-rule py-4 sm:grid-cols-3">
        <Field k="Categoria">{draft.subcategory && !editing ? `${draft.category} › ${draft.subcategory}` : draft.category}</Field>
        <Field k="Prioridade">
          <span className="flex flex-wrap items-center gap-1.5" title={draft.priorityRule}>
            <Dot className={PRIORITY_DOT[draft.priority]} />
            {PRIORITY_LABEL[draft.priority]}
            <span className="text-[13.5px] font-normal text-ink-3">· resposta até {formatLocalDateTime(draft.dueAt, now)}</span>
          </span>
        </Field>
        <Field k="Afetados">{AFFECTED_LABEL[draft.affected]}</Field>
      </div>
      {pending ? (
        <div className="flex items-center gap-2 bg-desk px-3 py-2.5">
          {editing ? (
            <>
              <button onClick={save} disabled={working !== null} className="flex items-center gap-2 rounded-lg bg-cta px-3 py-1.5 text-[13.5px] font-semibold text-white hover:bg-cta-hover disabled:opacity-70">
                {working === 'save' ? <LoaderCircle size={14} className="animate-spin" /> : null} Salvar
              </button>
              <button onClick={() => setEditing(false)} className="rounded-lg px-3 py-1.5 text-[13.5px] font-medium text-ink-2 hover:bg-paper">
                Descartar edição
              </button>
            </>
          ) : (
            <>
              <button onClick={() => run('confirm')} disabled={working !== null || !active} className="flex items-center gap-2 rounded-lg bg-cta px-3 py-1.5 text-[13.5px] font-semibold text-white hover:bg-cta-hover disabled:opacity-70">
                {working === 'confirm' ? <LoaderCircle size={14} className="animate-spin" /> : null}
                Confirmar
                <kbd className="rounded-md bg-white/15 px-1.5 py-0.5 font-ui text-[11.5px] text-white/80">⌘↵</kbd>
              </button>
              <button onClick={() => setEditing(true)} disabled={working !== null || !active} className="rounded-lg border border-rule bg-paper px-3 py-1.5 text-[13.5px] font-medium hover:border-ink-3/40 disabled:opacity-60">
                Editar
              </button>
              <button onClick={() => run('cancel')} disabled={working !== null || !active} className="rounded-lg px-3 py-1.5 text-[13.5px] font-medium text-ink-2 hover:bg-paper disabled:opacity-60">
                Cancelar
              </button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function ArticlesBlock({ articles }: { articles: Array<{ id: string; title: string }> }) {
  return (
    <div className="flex flex-wrap gap-2">
      {articles.map((a) => (
        <span key={a.id} className="flex items-center gap-1.5 rounded-lg bg-desk px-2.5 py-1 text-[12.5px] text-ink-2">
          <BookOpen size={13} className="text-ink-3" />
          Central de ajuda · {a.title}
        </span>
      ))}
    </div>
  );
}

export function HandoffBlock({ level, reason }: { level: string; reason: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-[13.5px]">
      <Headset size={18} className="text-warning-text" />
      <span>
        <span className="font-semibold">Encaminhado ao Suporte {level}</span> <span className="text-ink-2">· {reason}</span>
      </span>
    </div>
  );
}

export type BlockHandlers = {
  now: Date;
  interactive: boolean;
  drafts: Record<string, DraftView>;
  onSend: (text: string) => void;
  onDraft: (id: string, action: 'confirm' | 'cancel') => Promise<void>;
  onEditDraft: (id: string, f: Partial<Pick<DraftView, 'title' | 'description' | 'category' | 'note'>>) => Promise<void>;
};

/** Blocos que vão fora do balão (cards), na ordem em que o agent os gerou. */
export function UiBlocks({ blocks, h }: { blocks: UiBlock[]; h: BlockHandlers }) {
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.type) {
          case 'ticket_selector':
            return <TicketSelector key={i} tickets={b.tickets} disabled={!h.interactive} onPick={(t) => h.onSend(`${t.id} · ${t.title}`)} />;
          case 'ticket':
            return <TicketCard key={i} ticket={b.ticket} now={h.now} />;
          case 'draft': {
            const d = h.drafts[b.draftId];
            return d ? (
              <DraftCard
                key={i}
                draft={d}
                now={h.now}
                active={h.interactive}
                onConfirm={() => h.onDraft(d.id, 'confirm')}
                onCancel={() => h.onDraft(d.id, 'cancel')}
                onEdit={(f) => h.onEditDraft(d.id, f)}
              />
            ) : null;
          }
          case 'handoff':
            return <HandoffBlock key={i} level={b.level} reason={b.reason} />;
          default:
            return null; // options e articles ficam dentro do balão
        }
      })}
    </>
  );
}
