import type { Transaction } from "node-firebird";
import { AbstractSql } from "./abstract-sql";
import { runInTransaction } from "../database/transaction";
import type { SqlCondition, SqlOptions } from "../interfaces/sql-options.interface";

/**
 * Repositório genérico: usa o `AbstractSql` pra montar a query e já roda ela,
 * devolvendo instâncias de `T`.
 *
 * A `transaction` é opcional — se não passar, o repositório abre e fecha
 * uma sozinho. Passe uma quando quiser que a operação faça parte de uma
 * transação maior, já aberta por quem chamou.
 */
export abstract class AbstractRepository<T> extends AbstractSql<T> {
  /** Busca tudo, com filtro/ordenação/paginação opcionais. */
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

  /**
   * Roda uma SQL escrita na mão e mapeia o resultado — pra quando a query é
   * complexa demais pro `findAll` (subquery, GROUP BY, UNION...).
   *
   * Os aliases das colunas precisam bater com os que o `findAll` gera,
   * senão o mapeamento não acha os valores.
   */
  public async findBySql(
    sql: string,
    params?: any[],
    transaction?: Transaction,
  ): Promise<T[]> {
    const rows = await this.withTransaction(transaction, (tx) =>
      tx.queryAsync(sql, params),
    );

    return this.mapRows(rows);
  }

  /**
   * Insere e devolve a entidade já com o que o banco preencheu (id, etc).
   * Propriedade `undefined` não entra no INSERT; `null` vira `NULL`.
   */
  public async insert(entity: T, transaction?: Transaction): Promise<T> {
    const { sql, params } = this.buildInsertQuery(entity);

    // RETURNING devolve um objeto, não um array como o SELECT.
    const row = (await this.withTransaction(transaction, (tx) =>
      tx.queryAsync(sql, params),
    )) as unknown as Record<string, any>;

    return this.mapRow(row);
  }

  /**
   * Atualiza e devolve as linhas afetadas já mapeadas. `where` pode ser um
   * id (atualiza pela chave primária) ou uma lista de condições.
   * Propriedade `undefined` não muda; `null` vira `NULL`.
   */
  public async update(
    entity: Partial<T>,
    where: number | string | SqlCondition[],
    transaction?: Transaction,
  ): Promise<T[]> {
    const { sql, params } = this.buildUpdateQuery(entity, where);
    const rows = await this.withTransaction(transaction, (tx) =>
      tx.queryAsync(sql, params),
    );

    return this.mapRows(rows);
  }

  /** Usa a transação recebida, ou abre uma nova se não vier nenhuma. */
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
