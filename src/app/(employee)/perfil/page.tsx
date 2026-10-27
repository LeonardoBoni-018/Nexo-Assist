import { redirect } from 'next/navigation';
import { Info, KeyRound, Laptop, Lock, Send } from 'lucide-react';
import { getSessionUser } from '@/server/auth';
import { TopBar } from '@/components/sidebar';

export default async function ProfilePage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const row = 'flex items-center justify-between gap-4 border-b border-rule px-5 py-4 last:border-b-0';
  return (
    <>
      <TopBar here="Meu perfil" />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[640px] flex-col gap-6 px-6 py-12">
          <div>
            <h1 className="text-2xl font-semibold">Meu perfil</h1>
            <p className="mt-1 text-[14.5px] text-ink-3">Seus dados de acesso ao service desk de TI.</p>
          </div>
          <section className="rounded-2xl border border-rule">
            <div className={row}>
              <span className="text-[13.5px] text-ink-3">Nome</span>
              <span className="text-[14.5px] font-medium">{user.name}</span>
            </div>
            <div className={row}>
              <span className="text-[13.5px] text-ink-3">E-mail corporativo</span>
              <span className="flex items-center gap-3 text-[14.5px] font-medium">
                {user.email}
                <span className="flex items-center gap-1 text-[12.5px] font-normal text-ink-3">
                  <Lock size={12} /> Gerenciado pela TI
                </span>
              </span>
            </div>
            <div className={row}>
              <span className="text-[13.5px] text-ink-3">Área</span>
              <span className="text-[14.5px] font-medium">{user.department}</span>
            </div>
            <div className={row}>
              <span className="flex items-center gap-1.5 text-[13.5px] text-ink-3">
                <Laptop size={14} /> Equipamento
              </span>
              <span className="text-[14.5px] font-medium">{user.device ?? '—'}</span>
            </div>
          </section>
          <section className="rounded-2xl border border-rule">
            <div className="flex items-center gap-3 px-5 py-4">
              <span className="flex size-9 items-center justify-center rounded-full bg-desk">
                <KeyRound size={16} className="text-ink-2" />
              </span>
              <div className="flex-1">
                <p className="text-[14.5px] font-medium">Senha</p>
                <p className="text-[12.5px] text-ink-3">Alterada há 42 dias</p>
              </div>
              <span className="flex items-center gap-1.5 rounded-lg border border-rule px-3 py-1.5 text-[13.5px] font-medium">
                <Send size={14} /> Redefinir senha
              </span>
            </div>
            <p className="flex items-center gap-2 border-t border-rule bg-desk px-5 py-3 text-[12.5px] text-ink-3">
              <Info size={14} /> Enviaremos um link de redefinição para {user.email}.
            </p>
          </section>
        </div>
      </div>
    </>
  );
}
