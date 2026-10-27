import type { TicketSummary } from '@/shared/chat';
import type { TicketWithSla } from './tickets-client';

export function toSummary(t: TicketWithSla): TicketSummary {
  return {
    id: t.id,
    type: t.type,
    title: t.title,
    description: t.description,
    category: t.category,
    subcategory: t.subcategory,
    priority: t.priority,
    status: t.status,
    affected: t.affected,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    dueAt: t.sla.dueAt,
    overdue: t.sla.overdue,
    slaLabel: t.sla.slaLabel,
  };
}
