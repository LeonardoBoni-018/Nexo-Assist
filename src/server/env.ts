/** Configuração lida do ambiente uma única vez. Chaves nunca vão para o cliente. */
function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variável de ambiente ausente: ${name} (veja .env.example)`);
  return v;
}

const num = (name: string, fallback: number) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && process.env[name] !== undefined && process.env[name] !== '' ? v : fallback;
};

export const env = {
  get sessionSecret() {
    return required('SESSION_SECRET');
  },
  get ticketsUrl() {
    return process.env.TICKETS_URL ?? 'http://127.0.0.1:4001';
  },
  get ticketsServiceKey() {
    return required('TICKETS_SERVICE_KEY');
  },
  get appDbPath() {
    return process.env.APP_DB_PATH ?? 'data/app.db';
  },
  get model() {
    return process.env.NEXO_MODEL ?? 'claude-opus-5-5';
  },
  get effort() {
    const e = process.env.NEXO_EFFORT ?? 'low';
    return (['low', 'medium', 'high'] as const).find((x) => x === e) ?? 'low';
  },
  get hasModelKey() {
    return Boolean(process.env.ANTHROPIC_API_KEY);
  },
  /** Limite de mensagens do funcionário por conversa (protótipo: 30). */
  get messageLimit() {
    return num('NEXO_MESSAGE_LIMIT', 30);
  },
  /** Teto de turnos do agent por usuário por dia — proteção de custo no deploy. */
  get dailyTurnLimit() {
    return num('NEXO_DAILY_TURN_LIMIT', 120);
  },
  /** Abaixo desta confiança o servidor transfere para um analista. */
  get minConfidence() {
    return num('NEXO_MIN_CONFIDENCE', 0.4);
  },
};
