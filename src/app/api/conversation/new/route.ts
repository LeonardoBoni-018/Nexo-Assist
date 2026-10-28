import { NextResponse } from 'next/server';
import { handle } from '@/server/api';
import { requireUser } from '@/server/auth';
import { getStore } from '@/server/context';
import { conversationView } from '@/server/conversation';
import { env } from '@/server/env';
import { HttpError } from '@/server/http-error';

/** Nova conversa — permitida quando a atual foi encerrada ou atingiu o limite de mensagens. */
export const POST = handle(async () => {
  const user = await requireUser('employee');
  const store = await getStore();
  const open = await store.getOpenConversation(user.email);
  if (open && open.status !== 'agent') throw new HttpError(409, 'Sua conversa está com um analista. Aguarde o encerramento.');
  if (open && open.userMessageCount === 0) return NextResponse.json(await conversationView(store, open, env.messageLimit));
  if (open) await store.updateConversation(open.id, { status: 'closed' });
  return NextResponse.json(await conversationView(store, await store.createConversation(user.email), env.messageLimit));
});
