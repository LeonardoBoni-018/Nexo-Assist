import { NextResponse } from 'next/server';
import { clientIp, handle, rateLimit, readJson } from '@/server/api';
import { SESSION_COOKIE } from '@/server/auth';
import { getStore } from '@/server/context';
import { env } from '@/server/env';
import { HttpError } from '@/server/http-error';
import { createSessionToken } from '@/server/session-token';

export const POST = handle(async (req: Request) => {
  rateLimit(`login:${clientIp(req)}`, 20, 60_000);
  const body = await readJson<{ email?: string; password?: string; remember?: boolean }>(req);
  const email = body.email?.trim().toLowerCase() ?? '';
  if (!email.endsWith('@nexo.com.br')) throw new HttpError(400, 'Use seu e-mail corporativo (@nexo.com.br).');
  if (!body.password) throw new HttpError(400, 'Informe a senha.');
  // Ambiente de demonstração: qualquer senha é aceita para os usuários de exemplo.
  const user = await (await getStore()).findUser(email);
  if (!user) throw new HttpError(401, 'E-mail não encontrado. Use um dos usuários de exemplo.');
  const { token, maxAge } = createSessionToken(user.email, Boolean(body.remember), env.sessionSecret);
  const res = NextResponse.json({ role: user.role, redirect: user.role === 'analyst' ? '/console' : '/chat' });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    ...(body.remember ? { maxAge } : {}),
  });
  return res;
});
