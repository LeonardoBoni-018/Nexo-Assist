'use client';

import { useState } from 'react';
import { ArrowRight, Check, Eye, EyeOff, Lock, Mail, LoaderCircle } from 'lucide-react';

const DEMO_USERS = [
  { email: 'ana.souza@nexo.com.br', label: 'Ana Souza · funcionária (tem chamados, um vencido)' },
  { email: 'bruno.tavares@nexo.com.br', label: 'Bruno Tavares · funcionário' },
  { email: 'elisa.prado@nexo.com.br', label: 'Elisa Prado · funcionária (sem chamados)' },
  { email: 'rafael.lima@nexo.com.br', label: 'Rafael Lima · analista N2 (console)' },
];

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password, remember }),
      });
      const data = (await res.json()) as { redirect?: string; error?: string };
      if (!res.ok || !data.redirect) throw new Error(data.error ?? 'Não foi possível entrar.');
      window.location.assign(data.redirect);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível entrar.');
      setLoading(false);
    }
  }

  const input = 'flex items-center gap-2.5 rounded-lg border border-rule bg-paper px-3.5 py-2.5 focus-within:border-cta focus-within:ring-3 focus-within:ring-cta/15';

  return (
    <form onSubmit={submit} className="flex w-full max-w-[380px] flex-col gap-7" noValidate>
      <div className="flex flex-col gap-2">
        <h2 className="font-display text-[40px] leading-tight">Entrar</h2>
        <p className="text-[15.5px] text-ink-3">Use seu e-mail corporativo e a senha da rede Nexo.</p>
      </div>
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13.5px] font-medium">E-mail corporativo</span>
          <span className={input}>
            <Mail size={16} className="text-ink-3" />
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nome.sobrenome@nexo.com.br"
              className="w-full bg-transparent text-[14.5px] outline-none placeholder:text-ink-3/70"
            />
          </span>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="flex justify-between text-[13.5px] font-medium">
            Senha <span className="text-primary-text">Esqueci minha senha</span>
          </span>
          <span className={input}>
            <Lock size={16} className="text-primary-text" />
            <input
              type={show ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-transparent text-[14.5px] outline-none"
            />
            <button type="button" onClick={() => setShow((s) => !s)} className="rounded-md p-1 text-ink-3 hover:bg-desk" aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}>
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </span>
        </label>
        <label className="flex cursor-pointer items-center gap-2.5 text-[13.5px] text-ink-2">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="peer sr-only" />
          <span className="flex size-[18px] items-center justify-center rounded-md border border-rule bg-paper peer-checked:border-cta peer-checked:bg-cta peer-focus-visible:ring-3 peer-focus-visible:ring-cta/20">
            {remember ? <Check size={12} className="text-white" strokeWidth={3} /> : null}
          </span>
          Manter conectado neste computador
        </label>
      </div>
      {error ? <p className="rounded-lg bg-danger-soft px-3 py-2 text-[13.5px] text-danger-text" role="alert">{error}</p> : null}
      <button
        type="submit"
        disabled={loading}
        className="flex items-center justify-center gap-2 rounded-lg bg-cta py-3 text-[15.5px] font-semibold text-white shadow-sm hover:bg-cta-hover disabled:opacity-70"
      >
        {loading ? <LoaderCircle size={16} className="animate-spin" /> : null}
        Entrar {loading ? null : <ArrowRight size={16} />}
      </button>
      <div className="border-t border-rule pt-5">
        <p className="mb-2 text-[12.5px] font-medium text-ink-3">Ambiente de demonstração — qualquer senha funciona:</p>
        <ul className="flex flex-col gap-1">
          {DEMO_USERS.map((u) => (
            <li key={u.email}>
              <button type="button" onClick={() => { setEmail(u.email); setPassword('demo'); }} className="text-left text-[12.5px] text-primary-text hover:underline">
                {u.label}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </form>
  );
}
