import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { env } from './env';
import { getStore } from './context';
import type { Person } from '../../seed/people';

/**
 * Sessão sem estado: cookie httpOnly com `email.expiração.assinatura` (HMAC).
 * O e-mail do funcionário vem SEMPRE daqui — nunca do corpo da requisição nem
 * do modelo —, o que garante que ninguém consulta chamados de outra pessoa.
 */

export const SESSION_COOKIE = 'nexo_session';
const DEFAULT_TTL_S = 60 * 60 * 12;
const REMEMBER_TTL_S = 60 * 60 * 24 * 30;

function sign(payload: string): string {
  return createHmac('sha256', env.sessionSecret).update(payload).digest('base64url');
}

export function createSessionToken(email: string, remember: boolean, now = Date.now()): { token: string; maxAge: number } {
  const maxAge = remember ? REMEMBER_TTL_S : DEFAULT_TTL_S;
  const payload = `${Buffer.from(email).toString('base64url')}.${Math.floor(now / 1000) + maxAge}`;
  return { token: `${payload}.${sign(payload)}`, maxAge };
}

export function verifySessionToken(token: string | undefined, now = Date.now()): string | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [emailB64, exp, sig] = parts as [string, string, string];
  const expected = Buffer.from(sign(`${emailB64}.${exp}`));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  if (Number(exp) * 1000 < now) return null;
  return Buffer.from(emailB64, 'base64url').toString();
}

export async function getSessionUser(): Promise<Person | null> {
  const jar = await cookies();
  const email = verifySessionToken(jar.get(SESSION_COOKIE)?.value);
  return email ? getStore().findUser(email) : null;
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function requireUser(role?: Person['role']): Promise<Person> {
  const user = await getSessionUser();
  if (!user) throw new HttpError(401, 'Sessão expirada. Entre novamente.');
  if (role && user.role !== role) throw new HttpError(403, 'Acesso não permitido para este perfil.');
  return user;
}
