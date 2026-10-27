import { redirect } from 'next/navigation';
import { getSessionUser } from '@/server/auth';
import { Sidebar } from '@/components/sidebar';

export const dynamic = 'force-dynamic';

export default async function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role !== 'employee') redirect('/console');
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar name={user.name} email={user.email} />
      <main className="flex min-w-0 flex-1 flex-col">{children}</main>
    </div>
  );
}
