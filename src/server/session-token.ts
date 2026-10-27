import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Sessão sem estado: `email.expiração.assinatura` (HMAC-SHA256), guardada
 * num cookie httpOnly. Funções puras para poderem ser testadas sem o Next.
 */

const DEFAULT_TTL_S = 60 * 60 * 12;
const REMEMBER_TTL_S = 60 * 60 * 24 * 30;

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function createSessionToken(email: string, remember: boolean, secret: string, now = Date.now()): { token: string; maxAge: number } {
  const maxAge = remember ? REMEMBER_TTL_S : DEFAULT_TTL_S;
  const payload = `${Buffer.from(email).toString('base64url')}.${Math.floor(now / 1000) + maxAge}`;
  return { token: `${payload}.${sign(payload, secret)}`, maxAge };
}

export function verifySessionToken(token: string | undefined, secret: string, now = Date.now()): string | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [emailB64, exp, sig] = parts as [string, string, string];
  const expected = Buffer.from(sign(`${emailB64}.${exp}`, secret));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  if (Number(exp) * 1000 < now) return null;
  return Buffer.from(emailB64, 'base64url').toString();
}
