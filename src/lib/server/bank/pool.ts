import { Pool, type PoolClient } from "pg";

// Read-only connection to the source database: the raw social media and online news collection.
// Kept on globalThis so dev hot reloads don't open a new pool each time.
const globalRef = globalThis as unknown as { bankPool?: Pool };

export function bankPool() {
  const connectionString = process.env.SOURCE_DATABASE_URL;
  if (!connectionString) throw new Error("SOURCE_DATABASE_URL belum diatur");
  globalRef.bankPool ??= new Pool({
    connectionString,
    max: 4,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 25_000,
    ssl: { rejectUnauthorized: false },
    options: "-c default_transaction_read_only=on",
  });
  return globalRef.bankPool;
}

/** Runs `fn` on a dedicated connection with a longer statement timeout (for slow exact counts). */
export async function withLongTimeout<T>(ms: number, fn: (client: PoolClient) => Promise<T>) {
  const client = await bankPool().connect();
  try {
    await client.query(`SET statement_timeout = ${Math.floor(ms)}`);
    return await fn(client);
  } finally {
    await client.query("RESET statement_timeout").catch(() => {});
    client.release();
  }
}
