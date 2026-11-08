import { Pool, type PoolClient } from "pg";

// Read-only connections to the source database: the raw social media and online news collection.
// Two pools, so slow aggregate work can never starve requests that must answer quickly:
//  - "main": the public API (KIPERMAS and other apps) and the panel's lists, filters and counts.
//  - "analytics": Ringkasan insights, the background warmer and exact counts — scans that can take tens of seconds.
//    Its requests wait in line (long connection timeout) instead of failing, and it never takes the main pool's slots.
// Kept on globalThis so dev hot reloads don't open new pools each time.
type PoolName = "main" | "analytics";
const globalRef = globalThis as unknown as { bankPools?: Partial<Record<PoolName, Pool>> };

const SETTINGS: Record<PoolName, { max: number; connectionTimeoutMillis: number }> = {
  main: { max: 6, connectionTimeoutMillis: 10_000 },
  analytics: { max: 3, connectionTimeoutMillis: 180_000 },
};

function pool(name: PoolName) {
  const connectionString = process.env.SOURCE_DATABASE_URL;
  if (!connectionString) throw new Error("SOURCE_DATABASE_URL belum diatur");
  const pools = (globalRef.bankPools ??= {});
  pools[name] ??= new Pool({
    connectionString,
    ...SETTINGS[name],
    statement_timeout: 25_000,
    ssl: { rejectUnauthorized: false },
    options: "-c default_transaction_read_only=on",
  });
  return pools[name];
}

/** Pool for requests that must answer quickly (public API, panel lists). */
export const bankPool = () => pool("main");

/** Pool for slow aggregate scans (insights, warm-ups, exact counts). */
export const analyticsPool = () => pool("analytics");

/** Runs `fn` on one analytics connection with a longer statement timeout. */
export async function withLongTimeout<T>(ms: number, fn: (client: PoolClient) => Promise<T>) {
  const client = await analyticsPool().connect();
  try {
    await client.query(`SET statement_timeout = ${Math.floor(ms)}`);
    return await fn(client);
  } finally {
    await client.query("RESET statement_timeout").catch(() => {});
    client.release();
  }
}
