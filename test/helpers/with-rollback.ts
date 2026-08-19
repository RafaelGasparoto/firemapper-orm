import type { Transaction } from "node-firebird";
import { runInTransaction } from "../../src/database/transaction";

class RollbackSentinel extends Error {}

/**
 * Roda `work` numa transação e sempre reverte no final, mesmo se `work`
 * terminar sem erro. Uso em teste: insere/atualiza/apaga dados e faz as
 * asserções dentro do próprio callback. Depois do rollback, nada disso
 * fica gravado no banco.
 */
export async function withRollback(work: (tx: Transaction) => Promise<void>): Promise<void> {
  try {
    await runInTransaction(async (tx) => {
      await work(tx);
      throw new RollbackSentinel();
    });
  } catch (err) {
    if (!(err instanceof RollbackSentinel)) {
      throw err;
    }
  }
}
