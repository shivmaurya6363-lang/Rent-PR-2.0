import "server-only";
import { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";
import { getEnv } from "./env";

/** Anything that can run a query: the pool, or a client inside a transaction. */
export interface Queryable {
  query<R extends QueryResultRow = any>(text: string, params?: unknown[]): Promise<QueryResult<R>>;
}

let pool: Pool | undefined;

export function db(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: getEnv().DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 20_000,
      connectionTimeoutMillis: 8_000,
      ssl: /localhost|127\.0\.0\.1|\/tmp/.test(getEnv().DATABASE_URL) ? undefined : { rejectUnauthorized: false },
    });
  }
  return pool;
}

/** Run `fn` in a transaction; commits on success and rolls back on any throw. */
export async function tx<T>(fn: (c: PoolClient) => Promise<T>, source: Pool = db()): Promise<T> {
  const client = await source.connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** Postgres error carrying one of our business codes (raised by the billing SQL functions). */
export function businessCode(err: unknown): string | null {
  const msg = err instanceof Error ? err.message : "";
  const m = /(AMOUNT_MISMATCH|AGREEMENT_NOT_FOUND|CYCLE_NOT_FOUND|PROVIDER_MISMATCH|PAYMENT_AGREEMENT_MISMATCH|PAYMENT_NOT_FOUND|INSUFFICIENT_INVENTORY|EXTENSION_CONFLICT|CANNOT_CANCEL_IN_STATUS_\w+|CHECKOUT_KEY_CONFLICT)/.exec(msg);
  return m ? m[1] : null;
}
