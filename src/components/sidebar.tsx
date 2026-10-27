'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut, MessageSquare, User } from 'lucide-react';
import { Avatar, NexoMark } from './brand';

export async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.assign('/login');
}

export function Sidebar({ name, email }: { name: string; email: string }) {
  const path = usePathname();
  const items = [
    { href: '/chat', label: 'Atendimento', icon: MessageSquare },
    { href: '/perfil', label: 'Meu perfil', icon: User },
  ];
  return (
    <aside className="hidden w-[232px] shrink-0 flex-col border-r border-rule px-3 py-4 md:flex">
      <div className="flex items-center gap-2 px-2 py-1.5">
        <NexoMark />
        <span className="text-base font-bold">Nexo Assist</span>
      </div>
      <nav className="mt-6 flex flex-col gap-0.5">
        {items.map(({ href, label, icon: Icon }) => {
          const active = path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] ${active ? 'bg-primary-soft font-semibold text-primary-text' : 'font-medium text-ink-2 hover:bg-desk'}`}
            >
              <Icon size={16} className={active ? 'text-primary-text' : 'text-ink-3'} />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="flex-1" />
      <div className="flex items-center gap-2.5 border-t border-rule px-2 pt-4 pb-2">
        <Avatar name={name} />
        <div className="min-w-0">
          <p className="truncate text-[13.5px] font-semibold">{name}</p>
          <p className="truncate text-[11.5px] text-ink-3">{email}</p>
        </div>
      </div>
      <button onClick={logout} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-medium text-ink-2 hover:bg-desk">
        <LogOut size={16} className="text-ink-3" /> Sair
      </button>
    </aside>
  );
}

export function TopBar({ here, right }: { here: string; right?: React.ReactNode }) {
  return (
    <header className="flex h-[57px] shrink-0 items-center justify-between border-b border-rule px-6">
      <p className="flex items-center gap-1.5 text-[13.5px]">
        <span className="text-ink-3">Service desk de TI</span>
        <span className="text-ink-3">›</span>
        <span className="font-semibold">{here}</span>
      </p>
      {right}
    </header>
  );
}
