import type { Transaction } from "node-firebird";
import { AbstractSql } from "./abstract-sql";
import { runInTransaction } from "../database/transaction";
import type { SqlOptions } from "../interfaces/sql-options.interface";

/**
 * Repositório genérico herda o `AbstractSql` e já roda a query,
 * devolvendo instâncias de `T`.
 *
 * A `transaction` é opcional em todo método, caso não seja passada será aberta automaticamente.
 * Passe uma quando precisar que a busca faça parte de uma transação maior, já aberta
 * por quem chamou.
 */
export abstract class AbstractRepository<T> extends AbstractSql<T> {
  /**
   * Busca tudo e mapeia o resultado pra instâncias de `T`. Aceita opções de filtro, ordenação e paginação.
   */
  public async findAll(
    options?: SqlOptions,
    transaction?: Transaction,
  ): Promise<T[]> {
    const { sql, params } = this.buildSelectQuery(options);
    const rows = await this.withTransaction(transaction, (tx) =>
      tx.queryAsync(sql, params),
    );

    return this.mapRows(rows);
  }

  /** Usa a transação recebida ou abre uma nova se nenhuma. */
  private withTransaction<R>(
    transaction: Transaction | undefined,
    work: (tx: Transaction) => Promise<R>,
  ): Promise<R> {
    if (transaction) {
      return work(transaction);
    }

    return runInTransaction(work);
  }
}
