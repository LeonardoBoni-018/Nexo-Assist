import { redirect } from 'next/navigation';
import { getSessionUser } from '@/server/auth';
import { NexoMark } from '@/components/brand';
import { LoginForm } from './login-form';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect(user.role === 'analyst' ? '/console' : '/chat');

  return (
    <main className="flex min-h-screen">
      <section className="hidden w-[55%] max-w-[800px] flex-col justify-between bg-ink px-16 pt-10 pb-12 text-white lg:flex">
        <div className="flex items-center gap-2.5">
          <NexoMark size={24} color="#fff" />
          <span className="text-[17px] font-bold">Nexo Assist</span>
        </div>
        <div className="flex flex-col gap-10">
          <div className="flex flex-col gap-5">
            <p className="text-[13.5px] font-medium text-white/55">Service desk de TI da Nexo</p>
            <h1 className="max-w-[560px] font-display text-[54px] leading-[1.05] tracking-tight">Seu problema de TI, resolvido em uma conversa.</h1>
            <p className="max-w-[520px] text-base text-white/65">
              Descreva o que está acontecendo. O assistente consulta seus chamados, busca na central de ajuda e chama um analista quando precisa.
            </p>
          </div>
          <div className="flex w-[500px] flex-col gap-4 rounded-2xl bg-white/[.04] p-6">
            <div className="flex justify-end">
              <p className="rounded-[12px_12px_4px_12px] bg-paper px-3.5 py-2.5 text-[13.5px] text-ink">Meu notebook não conecta na VPN. Erro 809.</p>
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-[12.5px]">
                <span className="font-semibold text-white/80">Nexo Assist</span> <span className="text-white/45">consultou seus chamados · criou um chamado</span>
              </p>
              <p className="w-[380px] rounded-[4px_12px_12px_12px] bg-white/[.08] px-3.5 py-2.5 text-[13.5px]">
                Pronto: abri o chamado com prioridade alta. Um analista fala com você em até 4 h úteis.
              </p>
              <p className="flex w-fit items-center gap-2 rounded-xl bg-paper px-3 py-2 text-[12.5px]">
                <span className="size-[7px] rounded-full bg-warning" />
                <span className="font-semibold text-ink">INC-20517</span>
                <span className="text-ink-3">Rede e VPN · Alta · em até 4 h</span>
              </p>
            </div>
          </div>
        </div>
        <dl className="flex gap-14">
          {[
            ['8 s', 'primeira resposta, em média'],
            ['72%', 'resolvidos sem fila'],
            ['6', 'analistas online agora'],
          ].map(([n, l], i) => (
            <div key={l} className="flex flex-col gap-1">
              <dt className="flex items-center gap-2 font-display text-[34px]">
                {n}
                {i === 2 ? <span className="size-2 rounded-full bg-success" /> : null}
              </dt>
              <dd className="text-[13.5px] text-white/55">{l}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="flex flex-1 flex-col px-8 py-10 lg:px-12">
        <p className="text-right text-[13.5px] text-ink-3">
          Problema para entrar? <span className="font-semibold text-primary-text">Ligue no ramal 4000</span>
        </p>
        <div className="flex flex-1 items-center justify-center">
          <LoginForm />
        </div>
        <footer className="flex justify-between text-[12.5px] text-ink-3">
          <span>© 2026 Nexo · Service desk de TI</span>
          <span>Privacidade e uso de dados</span>
        </footer>
      </section>
    </main>
  );
}
