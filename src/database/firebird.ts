import * as Firebird from "node-firebird";
import type {
  ConnectionPool,
  Options,
  SupportedCharacterSet,
} from "node-firebird";

let pool: ConnectionPool | null = null;

/**
 * Builds the connection options accepted by node-firebird.
 */
export function resolveOptions(
  overrides?: string | Partial<Options>,
): string | Options {
  if (typeof overrides === "string") {
    return overrides;
  }

  if (!overrides && process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const defaults: Options = {
    host: process.env.FIREBIRD_HOST || "127.0.0.1",
    port: process.env.FIREBIRD_PORT ? Number(process.env.FIREBIRD_PORT) : 3050,
    database: process.env.FIREBIRD_DATABASE as string,
    user: process.env.ISC_USER || process.env.FIREBIRD_USER || "SYSDBA",
    password: process.env.FIREBIRD_PASSWORD || "masterkey",
    role: process.env.FIREBIRD_ROLE || undefined,
    lowercase_keys: process.env.FIREBIRD_LOWERCASE_KEYS === "true",
    encoding:
      (process.env.FIREBIRD_ENCODING as SupportedCharacterSet) || "UTF8",
    retryConnectionInterval: 1000,
  };

  const options: Options = { ...defaults, ...overrides };

  if (!options.database) {
    throw new Error(
      'Firebird config: "database" is required. Set FIREBIRD_DATABASE, DATABASE_URL, or pass { database } explicitly.',
    );
  }

  return options;
}

let cleanupRegistered = false;

/**
 * Registers automatic cleanup for the connection pool.
 */

function registerAutoCleanup() {
  if (cleanupRegistered) return;
  cleanupRegistered = true;

  const onShutdown = async () => {
    if (pool) {
      try {
        await pool.destroyAsync();
        pool = null;
      } catch (err) {
        console.error("[Firebird] Cleanup error:", err);
      }
    }
  };

  process.once("SIGTERM", onShutdown);
  process.once("SIGINT", onShutdown);
}

/**
 * Creates (or returns the existing) connection pool. Safe to call more
 * than once — only the first call takes effect.
 *
 * @param size max simultaneous connections, defaults to `FIREBIRD_POOL_SIZE` or 5.
 * @param overrides see {@link resolveOptions}.
 */
export function createPool(
  size?: number,
  overrides?: string | Partial<Options>,
): ConnectionPool {
  if (pool) {
    return pool;
  }

  const poolSize = size || Number(process.env.FIREBIRD_POOL_SIZE) || 5;
  pool = Firebird.pool(poolSize, resolveOptions(overrides));

  registerAutoCleanup();

  return pool;
}

/**
 * Returns the connection pool. Safe to call more than once.
 */
export function getPool(): ConnectionPool {
  return pool ?? createPool();
}
