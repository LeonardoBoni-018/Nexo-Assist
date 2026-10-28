import { NextResponse } from 'next/server';
import { handle } from '@/server/api';
import { requireUser } from '@/server/auth';
import { getStore } from '@/server/context';
import { cancelDraft } from '@/server/drafts';

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle(async (_req: Request, ctx: Ctx) => {
  const user = await requireUser('employee');
  const { id } = await ctx.params;
  return NextResponse.json(await cancelDraft(await getStore(), user, id));
});
