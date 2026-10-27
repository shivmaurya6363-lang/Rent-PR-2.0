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

/** Business codes raised by our SQL functions with RAISE EXCEPTION. Anything else is an infrastructure error. */
export const BUSINESS_CODES = [
  "AMOUNT_MISMATCH", "AGREEMENT_NOT_FOUND", "CYCLE_NOT_FOUND", "PROVIDER_MISMATCH", "PAYMENT_AGREEMENT_MISMATCH", "PAYMENT_NOT_FOUND",
  "INSUFFICIENT_INVENTORY", "EXTENSION_CONFLICT", "CHECKOUT_KEY_CONFLICT", "INVALID_EXTENSION", "DELIVERY_NOT_FOUND", "PICKUP_NOT_FOUND",
  "PAYMENT_NOT_REFUNDABLE", "REFUND_EXCEEDS_PAYMENT", "DEPOSIT_NOT_FOUND", "DEPOSIT_ALREADY_SETTLED", "DEDUCTION_EXCEEDS_DEPOSIT",
  "DEDUCTION_REASON_REQUIRED", "INVALID_UNIT_STATUS", "INVALID_RESERVATION_REQUEST",
] as const;

export function businessCode(err: unknown): string | null {
  const msg = err instanceof Error ? err.message : "";
  const state = /\b(CANNOT_[A-Z_]+?_IN_STATUS_\w+|CANNOT_[A-Z_]+)\b/.exec(msg);
  if (state) return state[1];
  return BUSINESS_CODES.find((c) => msg.includes(c)) ?? null;
}
