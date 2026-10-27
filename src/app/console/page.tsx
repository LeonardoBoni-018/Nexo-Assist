import { redirect } from 'next/navigation';
import { getSessionUser } from '@/server/auth';
import { ConsoleView } from '@/components/console/console-view';

export const dynamic = 'force-dynamic';

export default async function ConsolePage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role !== 'analyst') redirect('/chat');
  return <ConsoleView />;
}
