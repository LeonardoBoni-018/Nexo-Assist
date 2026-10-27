import type { Affected, Priority, TicketType } from './types';

/**
 * Sinais que o agent extrai da conversa. A prioridade NÃO é escolhida pelo
 * modelo: ele só informa os fatos (impacto e urgência) e a regra do Anexo A
 * é aplicada aqui, de forma determinística e testável.
 */
export interface PrioritySignals {
  type: TicketType;
  /** Quantas pessoas são afetadas. `null` quando o funcionário não sabe. */
  affected: Affected | null;
  /** O problema impede o trabalho (algo "parado"), sem alternativa. */
  blocksWork: boolean;
  /** Há um compromisso no mesmo dia em risco. */
  deadlineToday: boolean;
}

export interface PriorityDecision {
  priority: Priority;
  /** Regra do Anexo A que levou à prioridade, em linguagem natural. */
  rule: string;
}

export function classifyPriority(s: PrioritySignals): PriorityDecision {
  const affected = s.affected ?? 'individual';
  const collective = affected === 'equipe' || affected === 'empresa';

  if (collective && s.blocksWork) {
    return {
      priority: 'critica',
      rule: `Crítica: algo parado para ${affected === 'empresa' ? 'a empresa' : 'uma equipe'}.`,
    };
  }
  if (s.blocksWork) {
    return { priority: 'alta', rule: 'Alta: impede uma pessoa de trabalhar.' };
  }
  if (s.deadlineToday) {
    return { priority: 'alta', rule: 'Alta: há um compromisso no mesmo dia em risco.' };
  }
  if (s.type === 'REQ') {
    return { priority: 'baixa', rule: 'Baixa: pedido sem urgência.' };
  }
  return { priority: 'media', rule: 'Média: atrapalha, mas há alternativa.' };
}
