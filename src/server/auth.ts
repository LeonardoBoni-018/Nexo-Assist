import { cookies } from 'next/headers';
import { env } from './env';
import { getStore } from './context';
import { HttpError } from './http-error';
import { verifySessionToken } from './session-token';
import type { Person } from '../../seed/people';

/**
 * O e-mail de quem está logado vem SEMPRE do cookie assinado — nunca do
 * corpo da requisição nem do modelo. É isso que impede um funcionário de
 * consultar chamados de outra pessoa.
 */

export const SESSION_COOKIE = 'nexo_session';

export async function getSessionUser(): Promise<Person | null> {
  const jar = await cookies();
  const email = verifySessionToken(jar.get(SESSION_COOKIE)?.value, env.sessionSecret);
  return email ? getStore().findUser(email) : null;
}

export async function requireUser(role?: Person['role']): Promise<Person> {
  const user = await getSessionUser();
  if (!user) throw new HttpError(401, 'Sessão expirada. Entre novamente.');
  if (role && user.role !== role) throw new HttpError(403, 'Acesso não permitido para este perfil.');
  return user;
}
