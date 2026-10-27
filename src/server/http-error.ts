/** Erro com status HTTP, convertido em resposta JSON pelas rotas da API. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
