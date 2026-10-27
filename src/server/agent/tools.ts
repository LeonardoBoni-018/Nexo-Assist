import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { classifyPriority } from '@/domain/priority';
import { canReopen, findDuplicates } from '@/domain/similarity';
import { computeDueAt, formatLocalDateTime, SLA } from '@/domain/sla';
import { AFFECTED, CATEGORIES, OPEN_STATUSES, PRIORITY_LABEL, STATUS_LABEL, TICKET_TYPES } from '@/domain/types';
import type { DraftView } from '@/shared/chat';
import type { AppStore } from '../store';
import type { CallInfo, TicketsClient, TicketWithSla } from '../tickets-client';
import { toSummary } from '../ticket-view';
import type { TurnRecorder } from './recorder';

/**
 * Ferramentas do agent. Todas recebem o funcionário pela closure do turno —
 * o modelo nunca escolhe "em nome de quem" age —, e toda escrita no sistema
 * de chamados passa por um rascunho confirmado pelo funcionário na interface.
 */
export interface ToolContext {
  conversationId: string;
  store: AppStore;
  recorder: TurnRecorder;
  tickets: (onCall: (info: CallInfo) => void) => TicketsClient;
  now: () => Date;
}

const ticketId = z
  .string()
  .regex(/^(INC|REQ)-\d{4,6}$/i, 'Use o formato INC-12345 ou REQ-12345')
  .transform((s) => s.toUpperCase());

/** Visão compacta para o modelo: só o necessário para decidir e responder. */
function forModel(t: TicketWithSla, now: Date) {
  return {
    id: t.id,
    titulo: t.title,
    status: STATUS_LABEL[t.status],
    categoria: t.subcategory ? `${t.category} › ${t.subcategory}` : t.category,
    prioridade: PRIORITY_LABEL[t.priority],
    prazo_da_prioridade: t.sla.slaLabel,
    aberto_em: formatLocalDateTime(t.createdAt, now),
    ultima_atualizacao: formatLocalDateTime(t.updatedAt, now),
    proxima_resposta_ate: t.sla.dueAt ? formatLocalDateTime(t.sla.dueAt, now) : null,
    vencido: t.sla.overdue,
    pode_reabrir: canReopen(t, now),
  };
}

export function createNexoTools(ctx: ToolContext) {
  const { recorder: rec } = ctx;

  const buscarCentralAjuda = createTool({
    id: 'buscar_central_ajuda',
    description: 'Busca artigos na central de ajuda de TI. Use para dúvidas e antes de abrir chamado, para ver se há solução de autoatendimento.',
    inputSchema: z.object({ consulta: z.string().min(2).describe('Termos do problema, ex.: "vpn erro 809"') }),
    execute: async ({ consulta }) =>
      rec.run('buscar_central_ajuda', 'buscou na central de ajuda', { consulta }, async (track) => {
        const articles = await ctx.tickets(track).searchKb(consulta);
        const relevant = articles.filter((a) => a.score >= 0.25);
        // Na tela, só o artigo claramente relevante; o modelo recebe todos os candidatos.
        const top = relevant[0];
        if (top && top.score >= 0.4) rec.addUi({ type: 'articles', articles: [{ id: top.id, title: top.title }] });
        return {
          result: { artigos: relevant.map((a) => ({ id: a.id, titulo: a.title, conteudo: a.body, relevancia: a.score })) },
          summary: relevant.length ? `Encontrou: ${relevant.map((a) => `${a.id} "${a.title}" (${a.score})`).join('; ')}` : 'Nenhum artigo relevante.',
        };
      }),
  });

  const listarMeusChamados = createTool({
    id: 'listar_meus_chamados',
    description: 'Lista os chamados do funcionário logado, com status e situação do prazo. Use para consultar status e para checar duplicidade.',
    inputSchema: z.object({
      incluir_encerrados: z.boolean().default(false).describe('Inclui resolvidos/fechados (para reabertura ou histórico).'),
    }),
    execute: async ({ incluir_encerrados }) =>
      rec.run('listar_meus_chamados', 'consultou seus chamados', { incluir_encerrados }, async (track) => {
        const now = ctx.now();
        const all = await ctx.tickets(track).listTickets();
        const list = incluir_encerrados ? all : all.filter((t) => OPEN_STATUSES.includes(t.status));
        return {
          result: { total: list.length, chamados: list.map((t) => forModel(t, now)) },
          summary: list.length
            ? `${list.length} chamado(s): ${list.map((t) => `${t.id} ${STATUS_LABEL[t.status]}${t.sla.overdue ? ' (vencido)' : ''}`).join(', ')}`
            : 'Nenhum chamado.',
        };
      }),
  });

  const pedirSelecaoChamado = createTool({
    id: 'pedir_selecao_chamado',
    description: 'Mostra ao funcionário um seletor com os chamados indicados para ele escolher sobre qual quer falar.',
    inputSchema: z.object({
      ids: z.array(ticketId).min(2).max(8),
      pergunta: z.string().describe('Ex.: "Sobre qual deles quer saber?"'),
    }),
    execute: async ({ ids, pergunta }) =>
      rec.run(
        'pedir_selecao_chamado',
        'pediu para escolher um chamado',
        { ids },
        async (track) => {
          const mine = await ctx.tickets(track).listTickets();
          const selected = ids.map((id) => mine.find((t) => t.id === id)).filter((t): t is TicketWithSla => Boolean(t));
          rec.addUi({ type: 'ticket_selector', prompt: pergunta, tickets: selected.map(toSummary) });
          return { result: { exibidos: selected.map((t) => t.id) }, summary: `Seletor com ${selected.map((t) => t.id).join(', ')}` };
        },
        false,
      ),
  });

  const consultarChamado = createTool({
    id: 'consultar_chamado',
    description: 'Consulta um chamado do funcionário pelo número, com histórico e prazo, e mostra o card do chamado.',
    inputSchema: z.object({ id: ticketId }),
    execute: async ({ id }) =>
      rec.run('consultar_chamado', `consultou o ${id}`, { id }, async (track) => {
        const now = ctx.now();
        const t = await ctx.tickets(track).getTicket(id);
        rec.note('calcular_prazo', 'calculou o prazo', { prioridade: t.priority, desde: t.slaAnchorAt }, t.sla.dueAt
          ? `${SLA[t.priority].label} → ${t.sla.overdue ? 'vencido desde' : 'até'} ${formatLocalDateTime(t.sla.dueAt, now)}`
          : 'Prazo não está correndo (pausado ou encerrado).');
        rec.addUi({ type: 'ticket', ticket: toSummary(t) });
        ctx.store.updateConversation(ctx.conversationId, { focusTicketId: t.id });
        return {
          result: {
            ...forModel(t, now),
            descricao: t.description,
            historico: t.events.slice(-4).map((e) => ({ quando: formatLocalDateTime(e.at, now), quem: e.authorName, texto: e.text })),
          },
          summary: `${t.id}: ${STATUS_LABEL[t.status]}, prioridade ${PRIORITY_LABEL[t.priority]}${t.sla.overdue ? ', prazo vencido' : ''}`,
        };
      }),
  });

  const perguntar = createTool({
    id: 'perguntar',
    description: 'Faz uma pergunta ao funcionário com opções de resposta rápida (ele também pode digitar livremente).',
    inputSchema: z.object({
      pergunta: z.string().min(3),
      opcoes: z.array(z.string().min(1).max(40)).min(2).max(5),
    }),
    execute: async ({ pergunta, opcoes }) => {
      rec.addUi({ type: 'options', question: pergunta, options: opcoes });
      rec.note('perguntar', 'fez uma pergunta', { pergunta, opcoes }, `Opções: ${opcoes.join(' | ')}`, false);
      return { exibida: true };
    },
  });

  const proporChamado = createTool({
    id: 'propor_chamado',
    description:
      'Monta o rascunho de um chamado novo para o funcionário conferir. Calcula prioridade e prazo pelas regras e verifica duplicidade. Só chame quando souber quem é afetado.',
    inputSchema: z.object({
      tipo: z.enum(TICKET_TYPES).describe('INC: algo parou/não funciona. REQ: pedido de acesso, equipamento ou software.'),
      titulo: z.string().min(5).max(90).describe('Curto e específico, ex.: "VPN não conecta no notebook — erro 809"'),
      descricao: z.string().min(10).max(800).describe('O que acontece, desde quando, ambiente, o que já foi tentado e o impacto. Escreva para o analista não precisar perguntar de novo.'),
      categoria: z.enum(CATEGORIES),
      subcategoria: z.string().max(40).nullable().default(null).describe('Ex.: Notebook, VPN, SAP'),
      afetados: z.enum(AFFECTED).nullable().describe('individual, equipe ou empresa; null se o funcionário não sabe'),
      impede_trabalho: z.boolean().describe('Está parado/impedido de trabalhar, sem alternativa'),
      compromisso_hoje: z.boolean().describe('Há compromisso no mesmo dia em risco'),
      ignorar_duplicidade: z.boolean().default(false).describe('Só true se o funcionário confirmou que é outro problema'),
    }),
    execute: async (input) =>
      rec.run('propor_chamado', 'montou o rascunho', input, async (track) => {
        const now = ctx.now();
        const mine = await ctx.tickets(track).listTickets();
        const duplicates = findDuplicates({ title: input.titulo, description: input.descricao, category: input.categoria }, mine, now);
        rec.note(
          'verificar_duplicidade',
          'verificou duplicidade',
          { titulo: input.titulo, categoria: input.categoria },
          duplicates.length ? duplicates.map((d) => `${d.ticketId} (${d.score}) → ${d.action}`).join('; ') : 'Nenhum chamado parecido aberto ou resolvido há até 7 dias.',
        );
        if (duplicates.length > 0 && !input.ignorar_duplicidade) {
          return {
            result: {
              rascunho: null,
              possivel_duplicidade: duplicates.map((d) => ({ id: d.ticketId, titulo: d.title, acao_sugerida: d.action, similaridade: d.score })),
              instrucao: 'Pergunte se é o mesmo problema. Se for, use propor_atualizacao nesse chamado; se não, chame propor_chamado de novo com ignorar_duplicidade=true.',
            },
            summary: `Rascunho não montado: possível duplicidade com ${duplicates[0]!.ticketId}.`,
          };
        }

        const decision = classifyPriority({
          type: input.tipo,
          affected: input.afetados,
          blocksWork: input.impede_trabalho,
          deadlineToday: input.compromisso_hoje,
        });
        rec.note('classificar_prioridade', 'classificou a prioridade', { afetados: input.afetados, impede_trabalho: input.impede_trabalho, compromisso_hoje: input.compromisso_hoje }, decision.rule);
        const due = computeDueAt(decision.priority, now);
        rec.note('consultar_sla', 'consultou o SLA', { prioridade: decision.priority }, `${SLA[decision.priority].label} → resposta até ${formatLocalDateTime(due.toISOString(), now)}`);

        const draft: DraftView = {
          id: ctx.store.nextDraftId(),
          kind: 'create',
          status: 'pending',
          ticketId: null,
          type: input.tipo,
          title: input.titulo,
          description: input.descricao,
          category: input.categoria,
          subcategory: input.subcategoria,
          priority: decision.priority,
          priorityRule: decision.rule,
          affected: input.afetados ?? 'individual',
          dueAt: due.toISOString(),
          note: null,
        };
        ctx.store.saveDraft(ctx.conversationId, draft);
        rec.addUi({ type: 'draft', draftId: draft.id }, draft);
        return {
          result: {
            rascunho: draft.id,
            prioridade: PRIORITY_LABEL[decision.priority],
            motivo_prioridade: decision.rule,
            resposta_ate: formatLocalDateTime(due.toISOString(), now),
            proximo_passo: 'O card com Confirmar/Editar/Cancelar já está na tela. Peça para conferir; não diga que o chamado foi criado.',
          },
          summary: `${draft.id}: ${draft.type} ${draft.category}, ${PRIORITY_LABEL[draft.priority]} (${decision.rule})`,
        };
      }),
  });

  const proporAtualizacao = createTool({
    id: 'propor_atualizacao',
    description:
      'Monta o rascunho de um complemento para um chamado existente do funcionário (ou reabertura, se resolvido há até 7 dias). Ele confirma no card.',
    inputSchema: z.object({
      id: ticketId,
      comentario: z.string().min(5).max(1000).describe('Informação nova, escrita para o analista.'),
    }),
    execute: async ({ id, comentario }) =>
      rec.run('propor_atualizacao', `montou a atualização do ${id}`, { id, comentario }, async (track) => {
        const now = ctx.now();
        const t = await ctx.tickets(track).getTicket(id);
        const open = OPEN_STATUSES.includes(t.status);
        if (!open && !canReopen(t, now)) {
          return {
            result: { rascunho: null, motivo: `${t.id} foi encerrado há mais de 7 dias e não pode ser reaberto. Se o problema voltou, abra um chamado novo citando ${t.id}.` },
            summary: `${t.id} não pode ser reaberto (encerrado há mais de 7 dias).`,
          };
        }
        const draft: DraftView = {
          id: ctx.store.nextDraftId(),
          kind: open ? 'update' : 'reopen',
          status: 'pending',
          ticketId: t.id,
          type: t.type,
          title: t.title,
          description: t.description,
          category: t.category,
          subcategory: t.subcategory,
          priority: t.priority,
          priorityRule: `Mantém a prioridade do chamado (${PRIORITY_LABEL[t.priority]}).`,
          affected: t.affected,
          dueAt: t.sla.dueAt ?? computeDueAt(t.priority, now).toISOString(),
          note: comentario,
        };
        ctx.store.saveDraft(ctx.conversationId, draft);
        ctx.store.updateConversation(ctx.conversationId, { focusTicketId: t.id });
        rec.addUi({ type: 'draft', draftId: draft.id }, draft);
        return {
          result: { rascunho: draft.id, tipo: draft.kind === 'reopen' ? 'reabertura' : 'complemento', proximo_passo: 'Peça para conferir e confirmar no card.' },
          summary: `${draft.id}: ${draft.kind === 'reopen' ? 'reabertura' : 'complemento'} de ${t.id}`,
        };
      }),
  });

  const transferirParaAnalista = createTool({
    id: 'transferir_para_analista',
    description:
      'Transfere a conversa para um analista humano. Depois disso você não responde mais nesta conversa até o analista devolvê-la.',
    inputSchema: z.object({
      motivo: z.enum(['pedido_do_funcionario', 'caso_critico', 'chamado_vencido', 'sem_seguranca', 'outro']),
      nivel: z.enum(['N1', 'N2']).describe('N2 para chamados vencidos, já analisados pelo N1 ou casos técnicos complexos; N1 nos demais.'),
      chamado_id: ticketId.nullable().default(null),
      resumo: z.string().min(20).max(800).describe('Resumo para o analista: problema, o que já foi feito, chamado relacionado e o que o funcionário espera.'),
    }),
    execute: async ({ motivo, nivel, chamado_id, resumo }) =>
      rec.run('transferir_para_analista', `transferiu para Suporte ${nivel}`, { motivo, nivel, chamado_id, resumo }, async (track) => {
        let escalated = 'sem chamado relacionado';
        if (chamado_id) {
          try {
            await ctx.tickets(track).escalate(chamado_id, resumo, nivel, `${ctx.conversationId}:escalate:${chamado_id}`);
            escalated = `${chamado_id} marcado como aguardando analista`;
          } catch {
            // A conversa é transferida mesmo assim; o analista vê o resumo no console.
            escalated = `não foi possível atualizar ${chamado_id} no sistema de chamados (o resumo segue na conversa)`;
          }
        }
        rec.handoff = { level: nivel, reason: MOTIVOS[motivo], summary: resumo, ticketId: chamado_id, lowConfidence: null };
        rec.addUi({ type: 'handoff', level: nivel, reason: MOTIVOS[motivo] });
        return {
          result: { transferido: true, nivel, atendimento: 'Um analista assume esta conversa em até 2 horas úteis (críticos: plantão 24 h).' },
          summary: `Suporte ${nivel} · ${MOTIVOS[motivo]} · ${escalated}`,
        };
      }),
  });

  const registrarDecisao = createTool({
    id: 'registrar_decisao',
    description: 'Registra, uma vez por turno, o que você entendeu, a ação escolhida, sua confiança e o porquê. Exibido ao funcionário e ao analista.',
    inputSchema: z.object({
      entendimento: z.string().min(3).max(240).describe('O que o funcionário quer, em uma frase.'),
      acao: z.enum(['responder_duvida', 'consultar_chamado', 'complementar_chamado', 'abrir_chamado', 'pedir_informacao', 'transferir_analista', 'redirecionar_fora_escopo', 'outro']),
      confianca: z.number().min(0).max(1),
      justificativa: z.string().min(3).max(500),
      regras: z.array(z.string().max(120)).max(5).default([]).describe('Regras do service desk aplicadas, ex.: "Sem duplicidade".'),
    }),
    execute: async (d) => {
      rec.decision = { intent: d.entendimento, action: d.acao, confidence: d.confianca, rationale: d.justificativa, rules: d.regras };
      rec.note('registrar_decisao', 'registrou a decisão', d, `${d.acao} · confiança ${Math.round(d.confianca * 100)}%`, false);
      return { registrado: true };
    },
  });

  return {
    buscar_central_ajuda: buscarCentralAjuda,
    listar_meus_chamados: listarMeusChamados,
    pedir_selecao_chamado: pedirSelecaoChamado,
    consultar_chamado: consultarChamado,
    perguntar,
    propor_chamado: proporChamado,
    propor_atualizacao: proporAtualizacao,
    transferir_para_analista: transferirParaAnalista,
    registrar_decisao: registrarDecisao,
  };
}

export const MOTIVOS = {
  pedido_do_funcionario: 'Pedido do funcionário',
  caso_critico: 'Caso crítico',
  chamado_vencido: 'Chamado com prazo vencido',
  sem_seguranca: 'Agent sem segurança para decidir',
  outro: 'Outro motivo',
} as const;

