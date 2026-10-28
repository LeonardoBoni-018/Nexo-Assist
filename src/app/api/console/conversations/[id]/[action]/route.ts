import { NextResponse } from 'next/server';
import { handle, readJson } from '@/server/api';
import { requireUser } from '@/server/auth';
import { analystMessage, closeConversation, returnToAgent, takeOver } from '@/server/console';
import { getStore, ticketsFor } from '@/server/context';
import { HttpError } from '@/server/http-error';

type Ctx = { params: Promise<{ id: string; action: string }> };

export const POST = handle(async (req: Request, ctx: Ctx) => {
  const me = await requireUser('analyst');
  const { id, action } = await ctx.params;
  const store = await getStore();
  switch (action) {
    case 'takeover':
      return NextResponse.json({ message: await takeOver(store, me, id, ticketsFor(me)) });
    case 'return':
      return NextResponse.json({ message: await returnToAgent(store, me, id) });
    case 'close':
      return NextResponse.json({ message: await closeConversation(store, me, id) });
    case 'message': {
      const body = await readJson<{ text?: string }>(req);
      return NextResponse.json({ message: await analystMessage(store, me, id, body.text ?? '') });
    }
    default:
      throw new HttpError(404, 'Ação desconhecida.');
  }
});
