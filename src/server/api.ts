import { NextResponse } from 'next/server';
import { HttpError } from './http-error';

/** Envolve um handler de rota: erros conhecidos viram JSON com status; o resto vira 500 sem vazar detalhes. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
      console.error('[api] erro inesperado', e);
      return NextResponse.json({ error: 'Erro inesperado. Tente novamente.' }, { status: 500 });
    }
  };
}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, 'Corpo da requisição inválido.');
  }
}

/** Limite simples em memória por chave (ex.: IP no login). Suficiente para uma instância. */
const buckets = new Map<string, { count: number; resetAt: number }>();
export function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  if (++b.count > max) throw new HttpError(429, 'Muitas tentativas. Aguarde um pouco e tente de novo.');
}

export function clientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
}
