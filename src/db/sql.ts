/**
 * Acesso a Postgres com dois motores e o mesmo SQL:
 * - produção: Neon (Postgres gerenciado, via HTTP — funciona em serverless);
 * - local e testes: PGlite (Postgres embutido em WASM, sem instalar nada).
 * O app e o serviço de chamados usam bancos diferentes; só o código é comum.
 */
export interface Sql {
  query<T>(text: string, params?: unknown[]): Promise<T[]>;
  /** Vários comandos separados por ";" (DDL de inicialização). */
  exec(script: string): Promise<void>;
}

/**
 * `url` = string de conexão Postgres (ex.: Neon). Sem ela, usa PGlite no
 * diretório `localDir` (ou em memória, com ":memory:").
 */
export async function connect(url: string | undefined, localDir: string): Promise<Sql> {
  if (url) {
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(url);
    return {
      query: async <T>(text: string, params: unknown[] = []) => (await sql.query(text, params)) as T[],
      exec: async (script) => {
        for (const stmt of script.split(';').map((s) => s.trim()).filter(Boolean)) await sql.query(stmt);
      },
    };
  }
  const { PGlite } = await import('@electric-sql/pglite');
  const db = localDir === ':memory:' ? new PGlite() : new PGlite(localDir);
  return {
    query: async <T>(text: string, params: unknown[] = []) => (await db.query<T>(text, params)).rows,
    exec: async (script) => {
      await db.exec(script);
    },
  };
}
