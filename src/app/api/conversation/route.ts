import { NextResponse } from 'next/server';
import { handle } from '@/server/api';
import { requireUser } from '@/server/auth';
import { getStore } from '@/server/context';
import { conversationView } from '@/server/conversation';
import { env } from '@/server/env';

/** Conversa atual do funcionário: a última aberta, ou a última encerrada (para exibir o fim). */
export const GET = handle(async () => {
  const user = await requireUser('employee');
  const store = await getStore();
  const conv = await store.getOpenConversation(user.email) ?? await store.getLatestConversation(user.email) ?? await store.createConversation(user.email);
  return NextResponse.json(await conversationView(store, conv, env.messageLimit));
});
