import { NextResponse } from 'next/server';
import { clientIp, handle, rateLimit, readJson } from '@/server/api';
import { requireUser } from '@/server/auth';
import { getStore, ticketsFor } from '@/server/context';
import { env } from '@/server/env';
import { HttpError } from '@/server/http-error';
import { createModel, providerOptions } from '@/server/agent/model';
import { runTurn } from '@/server/agent/turn';
import type { StreamEvent } from '@/shared/chat';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Conversas com um turno em andamento — evita duas respostas simultâneas. */
const busy = new Set<string>();

export const POST = handle(async (req: Request) => {
  const user = await requireUser('employee');
  rateLimit(`chat:${clientIp(req)}`, 20, 60_000);
  const store = getStore();
  const body = await readJson<{ conversationId?: string; text?: string }>(req);
  const text = body.text?.trim() ?? '';
  if (!text) throw new HttpError(400, 'Escreva uma mensagem.');
  if (text.length > 2000) throw new HttpError(400, 'Mensagem longa demais (máx. 2.000 caracteres).');

  const conversation = body.conversationId ? store.getConversation(body.conversationId) : null;
  if (!conversation || conversation.userEmail !== user.email) throw new HttpError(404, 'Conversa não encontrada.');
  if (conversation.status === 'closed') throw new HttpError(409, 'Esta conversa foi encerrada. Inicie uma nova.');
  if (conversation.userMessageCount >= env.messageLimit) {
    throw new HttpError(429, `Limite de ${env.messageLimit} mensagens nesta sessão. Inicie uma nova conversa.`);
  }

  // Com um analista (ou aguardando um), o agent não responde: só registra.
  if (conversation.status !== 'agent') {
    const message = store.addMessage(conversation.id, { role: 'user', authorName: user.name, content: text });
    return NextResponse.json({ queued: true, message });
  }

  if (busy.has(conversation.id)) throw new HttpError(409, 'Aguarde a resposta anterior terminar.');
  if (store.countTurn(user.email) > env.dailyTurnLimit) {
    throw new HttpError(429, 'Você atingiu o limite diário de mensagens com o assistente. Fale com o service desk pelo ramal 4000.');
  }

  busy.add(conversation.id);
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const emit = (e: StreamEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
        } catch {
          open = false; // cliente desconectou; o turno termina e é salvo mesmo assim
        }
      };
      try {
        await runTurn(
          {
            store,
            model: createModel(),
            modelName: env.model,
            providerOptions: providerOptions(),
            tickets: (onCall) => ticketsFor(user, onCall),
            messageLimit: env.messageLimit,
            minConfidence: env.minConfidence,
          },
          { person: user, conversation, text, emit },
        );
      } catch (e) {
        console.error('[chat] falha no turno', e);
        emit({ type: 'error', message: 'Não consegui concluir a resposta. Tente novamente.' });
      } finally {
        busy.delete(conversation.id);
        if (open) controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive' },
  });
});
