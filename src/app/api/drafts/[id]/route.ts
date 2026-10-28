import { NextResponse } from 'next/server';
import { handle, readJson } from '@/server/api';
import { requireUser } from '@/server/auth';
import { getStore } from '@/server/context';
import { editDraft, type DraftEdit } from '@/server/drafts';

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireUser('employee');
  const { id } = await ctx.params;
  const edit = await readJson<DraftEdit>(req);
  return NextResponse.json({ draft: await editDraft(await getStore(), user, id, edit) });
});
