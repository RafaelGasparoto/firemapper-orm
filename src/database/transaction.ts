import type { Isolation, Transaction, TransactionOptions } from "node-firebird";
import { getPool } from "./firebird";

/**
 * Executes a transaction on a connection from the pool.
 *
 * @example
 * const total = await runInTransaction(async (transaction) => {
 *   const [users] = await transaction.queryAsync("SELECT COUNT(*) FROM users");
 *   const [addresses] = await transaction.queryAsync("SELECT COUNT(*) FROM addresses");
 *   return { users: users.COUNT, addresses: addresses.COUNT };
 * });
 */
export function runInTransaction<T>(
  work: (transaction: Transaction) => Promise<T> | T,
  options?: TransactionOptions | Isolation,
): Promise<T> {
  return getPool().withConnection((db) => db.withTransaction(work, options));
}
