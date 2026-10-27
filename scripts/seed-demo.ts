/**
 * Conversas de exemplo para o console do analista ter o que mostrar na
 * primeira execução. Elas passam pelo pipeline real (ferramentas, serviço de
 * chamados, regras de prioridade, salvaguardas, persistência); só as
 * escolhas do modelo são roteirizadas — assim não é preciso chave de API.
 *
 * Uso: com o serviço de chamados rodando, `npm run seed:demo`.
 * Não mexe nas conversas da Ana e da Elisa (ficam livres para testar).
 */
import { AppStore } from '../src/server/store';
import { createTicketsClient } from '../src/server/tickets-client';
import { runTurn } from '../src/server/agent/turn';
import { scriptedModel, type ScriptAction } from '../tests/helpers/scripted-model';

const store = new AppStore(process.env.APP_DB_PATH ?? 'data/app.db');
const baseUrl = process.env.TICKETS_URL ?? 'http://127.0.0.1:4001';
const serviceKey = process.env.TICKETS_SERVICE_KEY ?? '';

const decide = (entendimento: string, acao: string, confianca: number, justificativa: string, regras: string[] = []): ScriptAction => ({
  tool: 'registrar_decisao',
  args: { entendimento, acao, confianca, justificativa, regras },
});

async function conversation(email: string, turns: Array<{ text: string; script: ScriptAction[][] }>) {
  if (store.getLatestConversation(email)) {
    console.log(`- ${email}: já tem conversa, pulando`);
    return;
  }
  const person = store.findUser(email)!;
  const conv = store.createConversation(email);
  for (const t of turns) {
    const { model } = scriptedModel(t.script);
    await runTurn(
      {
        store,
        model,
        modelName: 'demonstração (decisões roteirizadas)',
        tickets: (onCall) => createTicketsClient({ baseUrl, serviceKey, actor: { email, role: 'employee', name: person.name }, onCall }),
        messageLimit: 30,
        minConfidence: 0.4,
      },
      { person, conversation: store.getConversation(conv.id)!, text: t.text, emit: () => {} },
    );
  }
  console.log(`- ${email}: conversa criada (${store.getConversation(conv.id)!.status})`);
}

async function main() {
  if (!serviceKey) throw new Error('Defina TICKETS_SERVICE_KEY (use o mesmo .env do app).');

  await conversation('carla.mendes@nexo.com.br', [
    {
      text: 'Preciso de acesso ao SAP módulo FI ainda hoje, é para o fechamento',
      script: [
        [{ tool: 'listar_meus_chamados', args: {} }],
        [{ tool: 'consultar_chamado', args: { id: 'REQ-10455' } }, decide('Quer acelerar o acesso ao SAP FI pedido no REQ-10455.', 'consultar_chamado', 0.9, 'Já existe requisição aberta sobre o mesmo acesso; consultei em vez de abrir outra.', ['Sem duplicidade'])],
        [{ text: 'Você já tem o REQ-10455 sobre esse acesso, com prioridade alta e aguardando um analista. A resposta está dentro do prazo de 4 horas úteis. Quer que eu chame um analista agora por causa do fechamento?' }],
      ],
    },
    {
      text: 'Sim, por favor. Não posso esperar, o fechamento é hoje às 17h.',
      script: [
        [
          {
            tool: 'transferir_para_analista',
            args: {
              motivo: 'pedido_do_funcionario',
              nivel: 'N1',
              chamado_id: 'REQ-10455',
              resumo: 'Carla (Controladoria) precisa do acesso ao SAP módulo FI hoje para o fechamento das 17h. REQ-10455 aberto há 3 h, prioridade alta, ainda sem atendimento. Pediu para falar com um analista.',
            },
          },
          decide('Pediu um analista por causa do fechamento de hoje.', 'transferir_analista', 0.95, 'Funcionária pediu explicitamente; há compromisso hoje.', ['Transferência a pedido do funcionário']),
        ],
        [{ text: 'Encaminhei para o Suporte N1 com o resumo do caso. Um analista vai falar com você por aqui.' }],
      ],
    },
  ]);

  await conversation('bruno.tavares@nexo.com.br', [
    {
      text: 'o relatório de comissão tá vindo com valor estranho desde a migração',
      script: [
        [{ tool: 'buscar_central_ajuda', args: { consulta: 'relatório comissão migração' } }],
        [decide('Valores divergentes no relatório de comissão após uma migração.', 'outro', 0.35, 'Pode ser problema de dados do sistema comercial (não necessariamente TI) ou de permissão; não há artigo nem categoria clara.')],
        [{ text: 'Não encontrei nada na central de ajuda sobre o relatório de comissão.' }],
      ],
    },
  ]);

  await conversation('diego.ramos@nexo.com.br', [
    {
      text: 'Qual a senha do wifi pra visitante? Tenho cliente chegando',
      script: [
        [{ tool: 'buscar_central_ajuda', args: { consulta: 'wifi visitante senha' } }],
        [decide('Quer a senha do Wi-Fi para um visitante.', 'responder_duvida', 0.93, 'Artigo KB-006 responde diretamente; não precisa de chamado.', ['Resolver no chat quando há artigo'])],
        [{ text: 'Visitantes usam a rede **Nexo-Guest**. A senha muda toda segunda-feira e fica na recepção do seu andar.' }],
      ],
    },
  ]);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
