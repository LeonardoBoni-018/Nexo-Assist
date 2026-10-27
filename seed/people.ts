// Diretório de exemplo (Anexo B). Usado pelo seed do app (login/perfil) e
// pelo seed do serviço de chamados (nome do solicitante).

export interface Person {
  email: string;
  name: string;
  role: 'employee' | 'analyst';
  department: string;
  /** Equipamento principal — contexto útil para o agent (ex.: versão do Windows). */
  device: string | null;
  /** Nível de suporte, apenas para analistas. */
  supportLevel?: 'N1' | 'N2';
}

export const PEOPLE: Person[] = [
  { email: 'ana.souza@nexo.com.br', name: 'Ana Souza', role: 'employee', department: 'Financeiro', device: 'Notebook Dell Latitude · Windows 11' },
  { email: 'bruno.tavares@nexo.com.br', name: 'Bruno Tavares', role: 'employee', department: 'Comercial', device: 'Notebook Lenovo ThinkPad · Windows 10' },
  { email: 'carla.mendes@nexo.com.br', name: 'Carla Mendes', role: 'employee', department: 'Controladoria', device: 'Desktop HP · Windows 11' },
  { email: 'diego.ramos@nexo.com.br', name: 'Diego Ramos', role: 'employee', department: 'Marketing', device: 'MacBook Air · macOS 15' },
  { email: 'elisa.prado@nexo.com.br', name: 'Elisa Prado', role: 'employee', department: 'Recursos Humanos', device: 'Notebook Dell Latitude · Windows 10' },
  { email: 'rafael.lima@nexo.com.br', name: 'Rafael Lima', role: 'analyst', department: 'Service desk de TI', device: null, supportLevel: 'N2' },
  { email: 'juliana.costa@nexo.com.br', name: 'Juliana Costa', role: 'analyst', department: 'Service desk de TI', device: null, supportLevel: 'N1' },
];
