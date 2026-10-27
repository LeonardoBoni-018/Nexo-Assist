'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ConversationView, DraftView, MessageView, StreamEvent, TraceStep, UiBlock } from '@/shared/chat';

export interface StreamingTurn {
  text: string;
  steps: TraceStep[];
  ui: UiBlock[];
}

export class SessionExpired extends Error {}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...init?.headers } });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (res.status === 401) throw new SessionExpired(data.error ?? 'Sessão expirada.');
  if (!res.ok) throw new Error(data.error ?? 'Algo deu errado. Tente novamente.');
  return data;
}

/** Estado do chat do funcionário: carga, envio com streaming (SSE), rascunhos e atualização periódica. */
export function useChat() {
  const [conversation, setConversation] = useState<ConversationView | null>(null);
  const [streaming, setStreaming] = useState<StreamingTurn | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);
  const router = useRouter();

  const fail = useCallback(
    (e: unknown, fallback: string) => {
      if (e instanceof SessionExpired) {
        router.replace('/login');
        return;
      }
      setError(e instanceof Error ? e.message : fallback);
    },
    [router],
  );

  const load = useCallback(
    () =>
      api<ConversationView>('/api/conversation').then(setConversation, (e: unknown) => fail(e, 'Não foi possível carregar a conversa.')),
    [fail],
  );

  useEffect(() => {
    let alive = true;
    api<ConversationView>('/api/conversation').then(
      (c) => alive && setConversation(c),
      (e: unknown) => alive && fail(e, 'Não foi possível carregar a conversa.'),
    );
    return () => {
      alive = false;
    };
  }, [fail]);

  // Com um analista, as mensagens chegam por atualização periódica.
  const status = conversation?.status;
  useEffect(() => {
    if (status !== 'waiting_human' && status !== 'human') return;
    const t = setInterval(() => {
      if (!busyRef.current) void load();
    }, 3000);
    return () => clearInterval(t);
  }, [status, load]);

  const appendMessages = (msgs: MessageView[], drafts?: Record<string, DraftView>) =>
    setConversation((c) => (c ? { ...c, messages: [...c.messages, ...msgs], drafts: { ...c.drafts, ...drafts } } : c));

  const send = useCallback(
    async (text: string) => {
      if (!conversation || busyRef.current || !text.trim()) return;
      busyRef.current = true;
      setBusy(true);
      setError(null);
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ conversationId: conversation.id, text }),
        });
        if (res.status === 401) throw new SessionExpired('Sessão expirada.');
        const type = res.headers.get('content-type') ?? '';
        if (!type.includes('text/event-stream')) {
          const data = (await res.json().catch(() => ({}))) as { error?: string; queued?: boolean; message?: MessageView };
          if (!res.ok) throw new Error(data.error ?? 'Não foi possível enviar.');
          if (data.message) {
            appendMessages([data.message]);
            setConversation((c) => (c ? { ...c, userMessageCount: c.userMessageCount + 1 } : c));
          }
          return;
        }
        setStreaming({ text: '', steps: [], ui: [] });
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let idx;
          while ((idx = buffer.indexOf('\n\n')) >= 0) {
            const raw = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            if (!raw.startsWith('data: ')) continue;
            const ev = JSON.parse(raw.slice(6)) as StreamEvent;
            handleEvent(ev);
          }
        }
        await load();
      } catch (e) {
        fail(e, 'Não foi possível enviar.');
      } finally {
        setStreaming(null);
        busyRef.current = false;
        setBusy(false);
      }

      function handleEvent(ev: StreamEvent) {
        switch (ev.type) {
          case 'user_message':
            appendMessages([ev.message]);
            setConversation((c) => (c ? { ...c, userMessageCount: c.userMessageCount + 1 } : c));
            break;
          case 'step':
            setStreaming((s) => {
              if (!s) return s;
              // Etapa concluída vai para o fim (mesma ordem que o servidor grava).
              const others = s.steps.filter((x) => x.id !== ev.step.id);
              const exists = others.length !== s.steps.length;
              return { ...s, steps: exists && ev.step.status === 'running' ? s.steps.map((x) => (x.id === ev.step.id ? ev.step : x)) : [...others, ev.step] };
            });
            break;
          case 'text':
            setStreaming((s) => (s ? { ...s, text: s.text + ev.delta } : s));
            break;
          case 'ui':
            setStreaming((s) => (s ? { ...s, ui: [...s.ui, ev.block] } : s));
            if (ev.draft) {
              const d = ev.draft;
              setConversation((c) => (c ? { ...c, drafts: { ...c.drafts, [d.id]: d } } : c));
            }
            break;
          case 'done':
            appendMessages([ev.message]);
            setStreaming(null);
            break;
          case 'error':
            setError(ev.message);
            break;
        }
      }
    },
    [conversation, load, fail],
  );

  const draftAction = useCallback(async (id: string, action: 'confirm' | 'cancel') => {
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const data = await api<{ draft: DraftView; messages: MessageView[] }>(`/api/drafts/${id}/${action}`, { method: 'POST' });
      appendMessages(data.messages, { [data.draft.id]: data.draft });
      setConversation((c) => (c ? { ...c, userMessageCount: c.userMessageCount + 1 } : c));
    } catch (e) {
      fail(e, 'Não foi possível concluir.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [fail]);

  const editDraft = useCallback(async (id: string, fields: Partial<Pick<DraftView, 'title' | 'description' | 'category' | 'note'>>) => {
    const data = await api<{ draft: DraftView }>(`/api/drafts/${id}`, { method: 'PATCH', body: JSON.stringify(fields) });
    setConversation((c) => (c ? { ...c, drafts: { ...c.drafts, [id]: data.draft } } : c));
  }, []);

  const newConversation = useCallback(async () => {
    setError(null);
    try {
      setConversation(await api<ConversationView>('/api/conversation/new', { method: 'POST' }));
    } catch (e) {
      fail(e, 'Não foi possível iniciar uma nova conversa.');
    }
  }, [fail]);

  return { conversation, streaming, busy, error, setError, send, draftAction, editDraft, newConversation };
}
