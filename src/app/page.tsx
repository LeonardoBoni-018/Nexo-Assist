import { redirect } from 'next/navigation';
import { getSessionUser } from '@/server/auth';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  redirect(user.role === 'analyst' ? '/console' : '/chat');
}
