import { NextResponse } from 'next/server';
import { handle } from '@/server/api';
import { requireUser } from '@/server/auth';
import { markRead } from '@/server/console';
import { getStore, ticketsFor } from '@/server/context';
import { conversationView } from '@/server/conversation';
import { env } from '@/server/env';
import { HttpError } from '@/server/http-error';
import { toSummary } from '@/server/ticket-view';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** Conversa + dados do funcionário + chamados dele (o analista pode ver todos). */
export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const me = await requireUser('analyst');
  const { id } = await ctx.params;
  const store = await getStore();
  const conv = await store.getConversation(id);
  if (!conv) throw new HttpError(404, 'Conversa não encontrada.');
  await markRead(store, id);
  const person = (await store.findUser(conv.userEmail))!;
  let tickets = null;
  let ticketsError: string | null = null;
  try {
    tickets = (await ticketsFor(me).listTickets(conv.userEmail)).map(toSummary);
  } catch {
    ticketsError = 'Sistema de chamados indisponível no momento.';
  }
  return NextResponse.json({
    conversation: await conversationView(store, conv, env.messageLimit),
    focusTicketId: conv.focusTicketId,
    user: { name: person.name, email: person.email, department: person.department, device: person.device },
    tickets,
    ticketsError,
  });
});
