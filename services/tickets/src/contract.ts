import { z } from 'zod';
import { AFFECTED, CATEGORIES, PRIORITIES, TICKET_STATUSES, TICKET_TYPES } from '../../../src/domain/types';

/**
 * Contrato HTTP do serviço de chamados. O app só conversa com o serviço por
 * HTTP, usando estes schemas — nunca acessa o banco dele diretamente.
 *
 * Cabeçalhos obrigatórios em toda chamada (exceto /health):
 *   x-service-key  segredo compartilhado app ↔ serviço
 *   x-actor-email  quem está agindo (definido pelo app a partir da sessão)
 *   x-actor-role   employee | analyst
 *   x-actor-name   nome para o histórico do chamado
 * Escritas aceitam `idempotency-key` para que retentativas não dupliquem.
 */

export const createTicketBody = z.object({
  type: z.enum(TICKET_TYPES),
  title: z.string().min(5).max(120),
  description: z.string().min(10).max(2000),
  category: z.enum(CATEGORIES),
  subcategory: z.string().max(60).nullable().default(null),
  priority: z.enum(PRIORITIES),
  affected: z.enum(AFFECTED),
});
export type CreateTicketBody = z.infer<typeof createTicketBody>;

export const commentBody = z.object({ text: z.string().min(2).max(2000) });
export const reopenBody = z.object({ reason: z.string().min(2).max(2000) });
export const escalateBody = z.object({
  summary: z.string().min(5).max(2000),
  level: z.enum(['N1', 'N2']),
});
export const statusBody = z.object({
  status: z.enum(TICKET_STATUSES),
  note: z.string().max(500).optional(),
});

export type ActorRole = 'employee' | 'analyst';
export interface Actor {
  email: string;
  role: ActorRole;
  name: string;
}

export interface ApiError {
  error: { code: 'unauthorized' | 'not_found' | 'invalid' | 'unavailable' | 'conflict'; message: string };
}
