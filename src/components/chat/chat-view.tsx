'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, Headset, LoaderCircle, MessageSquarePlus, X } from 'lucide-react';
import { TopBar } from '../sidebar';
import { useChat } from './use-chat';
import { AgentTurn, AnalystBubble, SystemLine, UserBubble } from './messages';
import type { BlockHandlers } from './blocks';

const SUGGESTIONS = ['Qual o status do meu chamado?', 'Meu notebook não conecta na VPN', 'Preciso de acesso a um sistema', 'Qual o horário do service desk?'];

export function ChatView({ firstName }: { firstName: string }) {
  const { conversation, streaming, busy, error, setError, send, draftAction, editDraft, newConversation } = useChat();
  const [text, setText] = useState('');
  const [now, setNow] = useState(() => new Date());
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const messages = conversation?.messages ?? [];
  const status = conversation?.status ?? 'agent';
  const limitReached = conversation ? conversation.userMessageCount >= conversation.messageLimit : false;
  const canType = Boolean(conversation) && status !== 'closed' && !limitReached;

  // Rola para o fim quando chega conteúdo novo.
  const lastLen = messages.length + (streaming ? streaming.text.length + streaming.steps.length + streaming.ui.length : 0);
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [lastLen]);

  const lastAssistantId = useMemo(() => [...messages].reverse().find((m) => m.role !== 'system')?.id, [messages]);

  async function submit(value = text) {
    const v = value.trim();
    if (!v || busy || !canType) return;
    setText('');
    await send(v);
    input.current?.focus();
  }

  const handlers = (interactive: boolean): BlockHandlers => ({
    now,
    interactive: interactive && !busy && status === 'agent',
    drafts: conversation?.drafts ?? {},
    onSend: (t) => void submit(t),
    onDraft: draftAction,
    onEditDraft: editDraft,
  });

  // Atalhos 1–5 escolhem uma opção rápida da última resposta, com o campo vazio.
  useEffect(() => {
    const last = messages[messages.length - 1];
    const opts = last?.role === 'assistant' ? last.ui.find((b) => b.type === 'options') : undefined;
    if (!opts || opts.type !== 'options' || busy || status !== 'agent') return;
    const onKey = (e: KeyboardEvent) => {
      if (text || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || (tag === 'TEXTAREA' && e.target !== input.current)) return;
      const n = Number(e.key);
      const choice = opts.options[n - 1];
      if (n >= 1 && choice) {
        e.preventDefault();
        void submit(choice);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const statusPill =
    status === 'agent'
      ? { cls: 'bg-success-soft text-success-text', dot: 'bg-success', label: 'Assistente online' }
      : status === 'waiting_human'
        ? { cls: 'bg-warning-soft text-warning-text', dot: 'bg-warning', label: 'Aguardando um analista' }
        : status === 'human'
          ? { cls: 'bg-primary-soft text-primary-text', dot: 'bg-primary', label: `Em atendimento com ${conversation?.assignedAnalyst ?? 'analista'}` }
          : { cls: 'bg-desk text-ink-3', dot: 'bg-ink-3/40', label: 'Conversa encerrada' };

  return (
    <>
      <TopBar
        here="Atendimento"
        right={
          <div className="flex items-center gap-3">
            {status === 'agent' && messages.length > 0 ? (
              <button onClick={() => void newConversation()} disabled={busy} className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12.5px] font-medium text-ink-3 hover:bg-desk hover:text-ink">
                <MessageSquarePlus size={14} /> Nova conversa
              </button>
            ) : null}
            <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-semibold ${statusPill.cls}`}>
              <span className={`size-[7px] rounded-full ${statusPill.dot}`} />
              {statusPill.label}
            </span>
          </div>
        }
      />
      <div ref={scroller} className="scrollbar-thin flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[760px] flex-col gap-6 px-6 py-10">
          {!conversation ? (
            <div className="flex justify-center py-20 text-ink-3">
              <LoaderCircle className="animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col gap-5 py-10">
              <h1 className="font-display text-[34px] leading-tight">Olá, {firstName}. Como posso ajudar?</h1>
              <p className="max-w-[520px] text-[15px] text-ink-2">
                Descreva o problema com suas palavras. Eu consulto seus chamados, busco na central de ajuda, abro ou atualizo chamados e chamo um analista quando precisa.
              </p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => void submit(s)} className="rounded-lg border border-rule px-3 py-1.5 text-[13.5px] hover:border-cta/40 hover:bg-primary-soft hover:text-primary-text">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m) => {
              if (m.role === 'user') return <UserBubble key={m.id} text={m.content} />;
              if (m.role === 'system') return <SystemLine key={m.id} text={m.content} />;
              if (m.role === 'analyst') return <AnalystBubble key={m.id} m={m} />;
              return <AgentTurn key={m.id} content={m.content} ui={m.ui} steps={m.trace?.steps ?? []} trace={m.trace} streaming={false} h={handlers(m.id === lastAssistantId)} />;
            })
          )}
          {streaming ? <AgentTurn content={streaming.text} ui={streaming.ui} steps={streaming.steps} trace={null} streaming h={handlers(false)} /> : null}
        </div>
      </div>

      <div className="mx-auto w-full max-w-[760px] px-6 pb-5">
        {error ? (
          <p className="mb-2 flex items-center justify-between gap-3 rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger-text" role="alert">
            {error}
            <button onClick={() => setError(null)} aria-label="Fechar aviso">
              <X size={14} />
            </button>
          </p>
        ) : null}
        {status === 'waiting_human' || status === 'human' ? (
          <p className="mb-2 flex items-center gap-2 rounded-lg bg-desk px-3 py-2 text-[13px] text-ink-2">
            <Headset size={15} className="text-ink-3" />
            {status === 'waiting_human'
              ? 'Sua conversa está na fila do service desk. O assistente fica pausado até um analista assumir — pode deixar mais detalhes aqui.'
              : `${conversation?.assignedAnalyst} está atendendo você.`}
          </p>
        ) : null}
        {status === 'closed' || limitReached ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-rule bg-desk px-4 py-3 text-[13.5px]">
            <span className="text-ink-2">{status === 'closed' ? 'Este atendimento foi encerrado.' : `Você chegou ao limite de ${conversation?.messageLimit} mensagens nesta sessão.`}</span>
            <button onClick={() => void newConversation()} className="flex items-center gap-1.5 rounded-lg bg-cta px-3 py-1.5 font-semibold text-white hover:bg-cta-hover">
              <MessageSquarePlus size={14} /> Nova conversa
            </button>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
            className="flex items-end gap-2 rounded-xl border border-rule bg-paper py-2 pr-2 pl-4 focus-within:border-cta/50 focus-within:ring-3 focus-within:ring-cta/10"
          >
            <textarea
              ref={input}
              rows={1}
              value={text}
              maxLength={2000}
              disabled={!canType}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
                  e.preventDefault();
                  void submit();
                }
              }}
              placeholder={status === 'agent' ? 'Escreva para o Nexo…' : 'Escreva para o analista…'}
              className="max-h-40 min-h-[26px] flex-1 resize-none bg-transparent py-1 text-[14.5px] outline-none placeholder:text-ink-3"
              aria-label="Mensagem"
            />
            <button type="submit" disabled={busy || !text.trim()} className="flex items-center gap-1.5 rounded-md bg-cta px-3 py-1.5 text-[13.5px] font-semibold text-white hover:bg-cta-hover disabled:opacity-60">
              {busy ? <LoaderCircle size={14} className="animate-spin" /> : <ArrowUp size={14} />}
              Enviar
            </button>
          </form>
        )}
        <p className="mt-2 text-right text-[12.5px] text-ink-3">
          {conversation ? `${conversation.userMessageCount}/${conversation.messageLimit} mensagens nesta sessão` : ' '}
        </p>
      </div>
    </>
  );
}
