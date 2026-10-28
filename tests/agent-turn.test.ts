import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startHarness } from './helpers/harness';

const ANA = 'ana.souza@nexo.com.br';

const decision = (acao: string, confianca: number, justificativa = 'teste') => ({
  tool: 'registrar_decisao',
  args: { entendimento: 'teste', acao, confianca, justificativa, regras: [] },
});

describe('turno do agent (modelo roteirizado + serviço de chamados real)', () => {
  let h: Awaited<ReturnType<typeof startHarness>>;
  beforeAll(async () => {
    h = await startHarness();
  });
  afterAll(async () => h.close());

  it('pergunta quem é afetado e registra etapas, cards, decisão e uso', async () => {
    const conv = (await h.store.createConversation(ANA));
    const { message, events } = await h.turn(ANA, conv.id, 'Meu notebook não conecta na VPN. Erro 809.', [
      [
        { tool: 'listar_meus_chamados', args: {} },
        { tool: 'buscar_central_ajuda', args: { consulta: 'vpn erro 809' } },
      ],
      [
        { tool: 'perguntar', args: { pergunta: 'Quem está sendo afetado?', opcoes: ['Só eu', 'Minha equipe', 'Toda a empresa', 'Não sei'] } },
        decision('pedir_informacao', 0.9),
      ],
      [{ text: 'O artigo do erro 809 vale só para Windows 10 — o seu é Windows 11. Vou abrir um chamado.' }],
    ]);

    const labels = message.trace!.steps.filter((s) => s.visible).map((s) => s.label);
    expect(labels).toEqual(['consultou seus chamados', 'buscou na central de ajuda']);
    expect(message.ui.map((b) => b.type)).toEqual(['articles', 'options']);
    expect(message.trace!.decision).toMatchObject({ action: 'pedir_informacao', confidence: 0.9 });
    expect(message.trace!.usage).toMatchObject({ cachedInputTokens: 2400 });
    expect(message.trace!.guards).toEqual([]);
    expect(message.content).toContain('Windows 11');
    // eventos em tempo real: etapas antes do texto, e um "done" no fim
    expect(events[0]!.type).toBe('user_message');
    expect(events.findIndex((e) => e.type === 'step')).toBeLessThan(events.findIndex((e) => e.type === 'text'));
    expect(events.at(-1)!.type).toBe('done');
  });

  it('monta rascunho com prioridade calculada pela regra, sem criar o chamado', async () => {
    const conv = (await h.store.createConversation(ANA));
    const before = (await h.ticketsAs(ANA)().listTickets()).length;
    const { message } = await h.turn(ANA, conv.id, 'Só eu. Tenho reunião com cliente às 14h.', [
      [
        {
          tool: 'propor_chamado',
          args: {
            tipo: 'INC',
            titulo: 'VPN não conecta no notebook — erro 809',
            descricao: 'Desde ontem o notebook (Windows 11) não conecta na VPN, erro 809. Precisa para reunião às 14h.',
            categoria: 'Rede e VPN',
            subcategoria: 'VPN',
            afetados: 'individual',
            impede_trabalho: false,
            compromisso_hoje: true,
          },
        },
        decision('abrir_chamado', 0.92),
      ],
      [{ text: 'Coloquei prioridade alta por causa da reunião. Confira antes de eu criar:' }],
    ]);
    const draftBlock = message.ui.find((b) => b.type === 'draft');
    expect(draftBlock).toBeDefined();
    const draft = (await h.store.getDraft((draftBlock as { draftId: string }).draftId))!.draft;
    expect(draft).toMatchObject({ status: 'pending', priority: 'alta', category: 'Rede e VPN' });
    expect(message.trace!.steps.map((s) => s.label)).toEqual(
      expect.arrayContaining(['verificou duplicidade', 'classificou a prioridade', 'consultou o SLA', 'montou o rascunho']),
    );
    // nada foi criado no sistema de chamados: só após a confirmação
    expect((await h.ticketsAs(ANA)().listTickets()).length).toBe(before);
  });

  it('não monta rascunho duplicado e devolve o chamado existente', async () => {
    const conv = (await h.store.createConversation(ANA));
    const { message } = await h.turn(ANA, conv.id, 'Meu notebook está lento depois da atualização do Windows', [
      [
        {
          tool: 'propor_chamado',
          args: {
            tipo: 'INC',
            titulo: 'Notebook lento após atualização do Windows',
            descricao: 'Notebook muito lento desde a última atualização do Windows.',
            categoria: 'Hardware',
            afetados: 'individual',
            impede_trabalho: false,
            compromisso_hoje: false,
          },
        },
        decision('abrir_chamado', 0.8),
      ],
      [{ text: 'Você já tem o INC-20311 sobre isso.' }],
    ]);
    expect(message.ui.some((b) => b.type === 'draft')).toBe(false);
    const step = message.trace!.steps.find((s) => s.tool === 'verificar_duplicidade')!;
    expect(step.output).toContain('INC-20311');
  });

  it('não expõe chamado de outro funcionário', async () => {
    const conv = (await h.store.createConversation(ANA));
    const { message } = await h.turn(ANA, conv.id, 'Qual o status do INC-20402?', [
      [{ tool: 'consultar_chamado', args: { id: 'INC-20402' } }, decision('consultar_chamado', 0.8)],
      [{ text: 'Não encontrei esse chamado entre os seus.' }],
    ]);
    const step = message.trace!.steps.find((s) => s.tool === 'consultar_chamado')!;
    expect(step.status).toBe('error');
    expect(step.output).toBe('Chamado não encontrado.');
    expect(message.ui).toEqual([]);
  });

  it('transfere automaticamente quando a confiança é baixa', async () => {
    const conv = (await h.store.createConversation(ANA));
    const { message } = await h.turn(ANA, conv.id, 'aquele negócio do sistema que deu ruim', [
      [decision('outro', 0.2, 'Mensagem ambígua, não sei qual sistema.')],
      [{ text: 'Não entendi bem.' }],
    ]);
    expect(message.trace!.guards.join(' ')).toContain('abaixo do mínimo');
    expect(message.content).toContain('chamei um analista');
    const after = (await h.store.getConversation(conv.id))!;
    expect(after.status).toBe('waiting_human');
    expect(after.handoff?.lowConfidence).toBe(0.2);
    expect((await h.store.listMessages(conv.id)).at(-1)!.role).toBe('system');
  });

  it('transferência pedida pelo funcionário marca o chamado como aguardando analista', async () => {
    const conv = (await h.store.createConversation(ANA));
    await h.turn(ANA, conv.id, 'Quero falar com um analista sobre o INC-20311', [
      [
        {
          tool: 'transferir_para_analista',
          args: { motivo: 'chamado_vencido', nivel: 'N2', chamado_id: 'INC-20311', resumo: 'INC-20311 sem atualização há 6 dias, acima do prazo; funcionária pediu analista.' },
        },
        decision('transferir_analista', 0.95),
      ],
      [{ text: 'Encaminhei para o Suporte N2.' }],
    ]);
    expect((await h.store.getConversation(conv.id))!.status).toBe('waiting_human');
    const t = await h.ticketsAs(ANA)().getTicket('INC-20311');
    expect(t.events.at(-1)!.kind).toBe('transferido');
  });

  it('com o sistema de chamados fora do ar, retenta e marca a etapa como erro', async () => {
    h.service.failureRate = 1;
    try {
      const conv = (await h.store.createConversation(ANA));
      const { message } = await h.turn(ANA, conv.id, 'Qual o status dos meus chamados?', [
        [{ tool: 'listar_meus_chamados', args: {} }, decision('consultar_chamado', 0.8)],
        [{ text: 'O sistema de chamados está fora do ar agora.' }],
      ]);
      const step = message.trace!.steps.find((s) => s.tool === 'listar_meus_chamados')!;
      expect(step).toMatchObject({ status: 'error', attempts: 4 });
    } finally {
      h.service.failureRate = 0;
    }
  });

  it('registra salvaguarda quando o modelo não declara a decisão', async () => {
    const conv = (await h.store.createConversation(ANA));
    const { message } = await h.turn(ANA, conv.id, 'Oi', [[{ text: 'Olá! Como posso ajudar?' }]]);
    expect(message.trace!.decision).toBeNull();
    expect(message.trace!.guards).toContain('O modelo não registrou a decisão deste turno.');
  });
});
