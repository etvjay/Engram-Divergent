import pg from "pg";

const { Pool } = pg;
const SERIALIZATION_FAILURE = "40001";

export function createCockroachPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");

  return new Pool({
    connectionString,
    max: Number(process.env.DB_POOL_MAX ?? 5),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: connectionString.includes("localhost") ? undefined : { rejectUnauthorized: true },
  });
}

export async function withTransaction<T>(
  pool: pg.Pool,
  fn: (client: pg.PoolClient) => Promise<T>,
  maxRetries = 3,
): Promise<T> {
  let attempt = 0;
  while (true) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code?: unknown }).code) : undefined;
      if (code === SERIALIZATION_FAILURE && attempt < maxRetries) {
        attempt += 1;
        await new Promise((resolve) => setTimeout(resolve, 25 * 2 ** attempt));
        continue;
      }
      throw error;
    } finally {
      client.release();
    }
  }
}
