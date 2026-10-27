// Vocabulário do service desk (Anexo A). Compartilhado entre o serviço de
// chamados, o agent e a interface — é a única fonte das regras de negócio.

export const TICKET_TYPES = ['INC', 'REQ'] as const;
export type TicketType = (typeof TICKET_TYPES)[number];

export const CATEGORIES = ['Acesso', 'Rede e VPN', 'Hardware', 'Software', 'E-mail', 'Outros'] as const;
export type Category = (typeof CATEGORIES)[number];

export const PRIORITIES = ['critica', 'alta', 'media', 'baixa'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const AFFECTED = ['individual', 'equipe', 'empresa'] as const;
export type Affected = (typeof AFFECTED)[number];

export const TICKET_STATUSES = [
  'aberto',
  'em_andamento',
  'aguardando_analista',
  'aguardando_usuario',
  'aprovado',
  'resolvido',
  'fechado',
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

/** Status em que o chamado ainda está "vivo" para o funcionário. */
export const OPEN_STATUSES: readonly TicketStatus[] = [
  'aberto',
  'em_andamento',
  'aguardando_analista',
  'aguardando_usuario',
  'aprovado',
];

export type EventAuthor = 'funcionario' | 'suporte' | 'sistema';

export interface TicketEvent {
  at: string; // ISO
  author: EventAuthor;
  authorName: string;
  kind: 'criado' | 'comentario' | 'status' | 'transferido' | 'reaberto' | 'assumido';
  text: string;
}

export interface Ticket {
  id: string; // INC-20311 / REQ-10442
  type: TicketType;
  title: string;
  description: string;
  category: Category;
  subcategory: string | null;
  priority: Priority;
  status: TicketStatus;
  affected: Affected;
  requesterEmail: string;
  requesterName: string;
  createdAt: string;
  updatedAt: string;
  /** Início da contagem do prazo: criação ou última atualização do suporte. */
  slaAnchorAt: string;
  resolvedAt: string | null;
  events: TicketEvent[];
}

export interface KbArticle {
  id: string;
  title: string;
  body: string;
  tags: string[];
  category: Category;
}

export const PRIORITY_LABEL: Record<Priority, string> = {
  critica: 'Crítica',
  alta: 'Alta',
  media: 'Média',
  baixa: 'Baixa',
};

export const STATUS_LABEL: Record<TicketStatus, string> = {
  aberto: 'Aberto',
  em_andamento: 'Em andamento',
  aguardando_analista: 'Aguardando analista',
  aguardando_usuario: 'Aguardando você',
  aprovado: 'Aprovado',
  resolvido: 'Resolvido',
  fechado: 'Fechado',
};

export const AFFECTED_LABEL: Record<Affected, string> = {
  individual: 'Somente você',
  equipe: 'A equipe',
  empresa: 'Toda a empresa',
};

export const TYPE_LABEL: Record<TicketType, string> = {
  INC: 'Incidente',
  REQ: 'Requisição',
};
