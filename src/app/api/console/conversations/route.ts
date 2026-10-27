import { NextResponse } from 'next/server';
import { handle } from '@/server/api';
import { requireUser } from '@/server/auth';
import { listForConsole } from '@/server/console';
import { getStore } from '@/server/context';

export const dynamic = 'force-dynamic';

export const GET = handle(async () => {
  const me = await requireUser('analyst');
  const items = listForConsole(getStore(), me);
  return NextResponse.json({
    me: { name: me.name, email: me.email, supportLevel: me.supportLevel ?? null },
    items,
    counts: {
      all: items.length,
      needsHuman: items.filter((i) => i.needsHuman).length,
      withAgent: items.filter((i) => i.status === 'agent').length,
      mine: items.filter((i) => i.assignedToMe && i.status === 'human').length,
    },
  });
});
