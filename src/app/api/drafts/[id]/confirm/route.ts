import { NextResponse } from 'next/server';
import { handle } from '@/server/api';
import { requireUser } from '@/server/auth';
import { getStore, ticketsFor } from '@/server/context';
import { confirmDraft } from '@/server/drafts';

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle(async (_req: Request, ctx: Ctx) => {
  const user = await requireUser('employee');
  const { id } = await ctx.params;
  return NextResponse.json(await confirmDraft(await getStore(), user, id, (onCall) => ticketsFor(user, onCall)));
});
