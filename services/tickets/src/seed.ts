import type { KbArticle, Ticket, TicketEvent } from '../../../src/domain/types';

/**
 * Dados de exemplo (Anexo B). As datas são relativas ao momento do seed para
 * que as situações (vencido, resolvido há poucos dias…) façam sentido sempre.
 */

const DAY = 86_400_000;
const HOUR = 3_600_000;

function ago(now: Date, ms: number): string {
  return new Date(now.getTime() - ms).toISOString();
}

type SeedTicket = Omit<Ticket, 'events' | 'updatedAt' | 'slaAnchorAt'> & {
  events: TicketEvent[];
};

function finalize(t: SeedTicket): Ticket {
  const last = t.events[t.events.length - 1];
  const lastSupport = [...t.events].reverse().find((e) => e.author === 'suporte');
  return { ...t, updatedAt: last?.at ?? t.createdAt, slaAnchorAt: lastSupport?.at ?? t.createdAt };
}

export function seedTickets(now: Date): Ticket[] {
  const ana = { requesterEmail: 'ana.souza@nexo.com.br', requesterName: 'Ana Souza' };
  const bruno = { requesterEmail: 'bruno.tavares@nexo.com.br', requesterName: 'Bruno Tavares' };
  const carla = { requesterEmail: 'carla.mendes@nexo.com.br', requesterName: 'Carla Mendes' };
  const diego = { requesterEmail: 'diego.ramos@nexo.com.br', requesterName: 'Diego Ramos' };

  const created = (at: string): TicketEvent => ({ at, author: 'sistema', authorName: 'Service desk', kind: 'criado', text: 'Chamado aberto.' });
  const support = (at: string, text: string, name = 'Juliana Costa'): TicketEvent => ({ at, author: 'suporte', authorName: name, kind: 'comentario', text });

  const tickets: SeedTicket[] = [
    {
      ...ana,
      id: 'INC-20311',
      type: 'INC',
      title: 'Notebook lento após atualização do Windows',
      description: 'Lentidão geral desde a atualização do Windows. Reiniciar e rodar o diagnóstico da central não resolveu.',
      category: 'Hardware',
      subcategory: 'Notebook',
      priority: 'media',
      status: 'aguardando_analista',
      affected: 'individual',
      createdAt: ago(now, 11 * DAY),
      resolvedAt: null,
      events: [
        created(ago(now, 11 * DAY)),
        support(ago(now, 6 * DAY), 'Coletamos os logs de desempenho. Encaminhado para análise do Suporte N2.'),
      ],
    },
    {
      ...ana,
      id: 'INC-20298',
      type: 'INC',
      title: 'Acesso à pasta Financeiro no SharePoint',
      description: 'Sem acesso à pasta Financeiro/Fechamento no SharePoint desde a troca de equipe. Mensagem "Você precisa de permissão".',
      category: 'Acesso',
      subcategory: 'SharePoint',
      priority: 'media',
      status: 'em_andamento',
      affected: 'individual',
      createdAt: ago(now, 13 * DAY),
      resolvedAt: null,
      events: [created(ago(now, 13 * DAY)), support(ago(now, 20 * HOUR), 'Aguardando aprovação do dono da pasta (gestor do Financeiro).')],
    },
    {
      ...ana,
      id: 'REQ-10442',
      type: 'REQ',
      title: 'Segundo monitor para home office',
      description: 'Solicito um segundo monitor para o home office, conforme política de equipamentos.',
      category: 'Hardware',
      subcategory: 'Periféricos',
      priority: 'baixa',
      status: 'aprovado',
      affected: 'individual',
      createdAt: ago(now, 18 * DAY),
      resolvedAt: null,
      events: [created(ago(now, 18 * DAY)), support(ago(now, 2 * DAY), 'Pedido aprovado pelo gestor. Monitor separado para envio.', 'Rafael Lima')],
    },
    {
      ...ana,
      id: 'INC-20150',
      type: 'INC',
      title: 'Senha do SAP bloqueada',
      description: 'Senha do SAP bloqueada após várias tentativas.',
      category: 'Acesso',
      subcategory: 'SAP',
      priority: 'alta',
      status: 'resolvido',
      affected: 'individual',
      createdAt: ago(now, 5 * DAY),
      resolvedAt: ago(now, 4 * DAY),
      events: [created(ago(now, 5 * DAY)), support(ago(now, 4 * DAY), 'Senha desbloqueada e redefinida. Chamado resolvido.')],
    },
    {
      ...ana,
      id: 'INC-19877',
      type: 'INC',
      title: 'Outlook não sincroniza no celular',
      description: 'O app do Outlook no celular parou de sincronizar os e-mails.',
      category: 'E-mail',
      subcategory: 'Mobile',
      priority: 'media',
      status: 'resolvido',
      affected: 'individual',
      createdAt: ago(now, 56 * DAY),
      resolvedAt: ago(now, 55 * DAY),
      events: [created(ago(now, 56 * DAY)), support(ago(now, 55 * DAY), 'Conta removida e adicionada novamente no app. Resolvido.')],
    },
    {
      ...bruno,
      id: 'INC-20402',
      type: 'INC',
      title: 'Impressora do 3º andar não imprime',
      description: 'A impressora do 3º andar (Comercial) mostra "offline" para todo o time. Estamos usando a do 2º andar.',
      category: 'Hardware',
      subcategory: 'Impressora',
      priority: 'media',
      status: 'aberto',
      affected: 'equipe',
      createdAt: ago(now, 1 * DAY),
      resolvedAt: null,
      events: [created(ago(now, 1 * DAY))],
    },
    {
      ...bruno,
      id: 'REQ-10460',
      type: 'REQ',
      title: 'Licença do Power BI Pro',
      description: 'Preciso de licença do Power BI Pro para publicar os relatórios de vendas.',
      category: 'Software',
      subcategory: 'Licença',
      priority: 'baixa',
      status: 'aberto',
      affected: 'individual',
      createdAt: ago(now, 2 * DAY),
      resolvedAt: null,
      events: [created(ago(now, 2 * DAY))],
    },
    {
      ...carla,
      id: 'REQ-10455',
      type: 'REQ',
      title: 'Acesso ao SAP, módulo FI',
      description: 'Preciso de acesso ao módulo FI do SAP para o fechamento de hoje.',
      category: 'Acesso',
      subcategory: 'SAP',
      priority: 'alta',
      status: 'aguardando_analista',
      affected: 'individual',
      createdAt: ago(now, 3 * HOUR),
      resolvedAt: null,
      events: [created(ago(now, 3 * HOUR))],
    },
    {
      ...diego,
      id: 'INC-20488',
      type: 'INC',
      title: 'Wi-Fi caindo na sala de reuniões Atlântico',
      description: 'A conexão Wi-Fi cai a cada poucos minutos na sala Atlântico. Cabo funciona.',
      category: 'Rede e VPN',
      subcategory: 'Wi-Fi',
      priority: 'media',
      status: 'em_andamento',
      affected: 'equipe',
      createdAt: ago(now, 2 * DAY),
      resolvedAt: null,
      events: [created(ago(now, 2 * DAY)), support(ago(now, 1 * DAY), 'Ponto de acesso será substituído amanhã.', 'Rafael Lima')],
    },
  ];
  return tickets.map(finalize);
}

export const KB_ARTICLES: KbArticle[] = [
  {
    id: 'KB-001',
    title: 'VPN com erro 809',
    body: 'Reinstale o cliente de VPN pelo portal de softwares e reinicie o computador. Vale apenas para Windows 10; no Windows 11, abra um chamado.',
    tags: ['vpn', 'erro 809', 'conexão', 'windows 10', 'acesso remoto'],
    category: 'Rede e VPN',
  },
  {
    id: 'KB-002',
    title: 'Horário do service desk',
    body: 'De segunda a sexta, das 8h às 18h. Chamados críticos têm plantão 24 horas.',
    tags: ['horário', 'atendimento', 'plantão', 'funcionamento'],
    category: 'Outros',
  },
  {
    id: 'KB-003',
    title: 'Como redefinir a senha da rede',
    body: 'Acesse senha.nexo.com.br, informe seu e-mail corporativo e confirme pelo autenticador (MFA). A nova senha vale para Windows, VPN e e-mail em até 15 minutos. Se o MFA não estiver configurado, abra um chamado de Acesso.',
    tags: ['senha', 'rede', 'redefinir', 'esqueci', 'mfa', 'bloqueada', 'login'],
    category: 'Acesso',
  },
  {
    id: 'KB-004',
    title: 'Senha do SAP bloqueada',
    body: 'O SAP bloqueia a senha após 5 tentativas erradas. Use "Esqueci minha senha" na tela de login do SAP para desbloquear com o autenticador. Se não funcionar, abra um chamado de Acesso.',
    tags: ['sap', 'senha', 'bloqueio', 'bloqueada', 'desbloquear'],
    category: 'Acesso',
  },
  {
    id: 'KB-005',
    title: 'Outlook não sincroniza no celular',
    body: 'No app do Outlook, vá em Configurações › Contas, remova a conta corporativa e adicione de novo. O celular precisa estar registrado no Portal da Empresa (Intune).',
    tags: ['outlook', 'celular', 'email', 'e-mail', 'sincronizar', 'mobile', 'intune'],
    category: 'E-mail',
  },
  {
    id: 'KB-006',
    title: 'Wi-Fi para visitantes',
    body: 'Visitantes usam a rede Nexo-Guest. A senha muda toda segunda-feira e fica disponível na recepção de cada andar. Funcionários devem usar a rede Nexo-Corp com o login da rede.',
    tags: ['wifi', 'wi-fi', 'visitante', 'convidado', 'rede', 'senha'],
    category: 'Rede e VPN',
  },
  {
    id: 'KB-007',
    title: 'Como instalar um software',
    body: 'Softwares homologados são instalados pelo Portal de Softwares, sem chamado. Softwares fora do catálogo exigem uma requisição (REQ) com aprovação do gestor.',
    tags: ['instalar', 'software', 'programa', 'aplicativo', 'portal', 'licença'],
    category: 'Software',
  },
  {
    id: 'KB-008',
    title: 'Computador lento',
    body: 'Reinicie o computador, instale atualizações pendentes e rode o "Diagnóstico Nexo" no Portal de Softwares. Se continuar lento, abra um chamado de Hardware informando o que já tentou.',
    tags: ['lento', 'lentidão', 'travando', 'desempenho', 'notebook', 'computador'],
    category: 'Hardware',
  },
  {
    id: 'KB-009',
    title: 'Impressora não aparece ou não imprime',
    body: 'Adicione a impressora por \\\\print.nexo.local escolhendo a do seu andar. Se a fila travar, cancele os trabalhos pendentes e tente de novo. Se a impressora estiver offline para várias pessoas, abra um incidente.',
    tags: ['impressora', 'imprimir', 'impressão', 'offline', 'fila'],
    category: 'Hardware',
  },
];
