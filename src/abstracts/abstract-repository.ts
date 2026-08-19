import type { Transaction } from "node-firebird";
import { AbstractSql, hydrateEntity } from "./abstract-sql";
import { runInTransaction } from "../database/transaction";
import { getEntityMetadata } from "../metadata/get-entity";
import { getColumns } from "../metadata/get-columns";
import { getPrimaryKeyProperty } from "../metadata/get-primary-key";
import type { SqlOptions, WhereInput } from "../interfaces/sql-options.interface";

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
  public async findAll(options?: SqlOptions, transaction?: Transaction): Promise<T[]> {
    const { sql, params } = this.buildSelectQuery(options);
    const rows = await this.withTransaction(transaction, (tx) => tx.queryAsync(sql, params));

    return this.mapRows(rows);
  }

  /** Busca um registro pela chave primária, ou `null` se não existir. */
  public async findById(id: number | string, transaction?: Transaction): Promise<T | null> {
    return this.findOne(id, undefined, transaction);
  }

  /**
   * Busca o primeiro registro que bater com `where` (id, objeto propriedade
   * → valor pra chave composta, ou lista de condições), ou `null` se não existir.
   */
  public async findOne(
    where: WhereInput,
    options?: Pick<SqlOptions, "orderBy" | "orderDirection" | "select">,
    transaction?: Transaction,
  ): Promise<T | null> {
    const rows = await this.findAll(
      { ...options, where: this.resolveWhere(where), limit: 1 },
      transaction,
    );

    return rows[0] ?? null;
  }

  /**
   * Roda uma SQL escrita na mão e mapeia o resultado — pra quando a query é
   * complexa demais pro `findAll` (subquery, GROUP BY, UNION...).
   *
   * Os aliases das colunas precisam bater com os que o `findAll` gera,
   * senão o mapeamento não acha os valores.
   */
  public async findBySql(sql: string, params?: any[], transaction?: Transaction): Promise<T[]> {
    const rows = await this.withTransaction(transaction, (tx) => tx.queryAsync(sql, params));

    return this.mapRows(rows);
  }

  /**
   * Insere e devolve a entidade já com o que o banco preencheu (id, etc).
   * Propriedade `undefined` não entra no INSERT; `null` vira `NULL`.
   */
  public async insert(entity: Partial<T>, transaction?: Transaction): Promise<T> {
    const { sql, params } = this.buildInsertQuery(entity);

    // RETURNING devolve um objeto, não um array como o SELECT.
    const row = (await this.withTransaction(transaction, (tx) =>
      tx.queryAsync(sql, params),
    )) as unknown as Record<string, any>;

    return this.mapRow(row);
  }

  /**
   * Atualiza e devolve as linhas afetadas já mapeadas. `where` aceita as
   * mesmas opções do `findOne` (id, objeto pra chave composta, ou condições).
   * Propriedade `undefined` não muda; `null` vira `NULL`.
   */
  public async update(
    entity: Partial<T>,
    where: WhereInput,
    transaction?: Transaction,
  ): Promise<T[]> {
    const { sql, params } = this.buildUpdateQuery(entity, where);
    const rows = await this.withTransaction(transaction, (tx) => tx.queryAsync(sql, params));

    return this.mapRows(rows);
  }

  /**
   * Apaga e devolve as linhas removidas já mapeadas. `where` aceita as
   * mesmas opções do `update`.
   */
  public async delete(where: WhereInput, transaction?: Transaction): Promise<T[]> {
    const { sql, params } = this.buildDeleteQuery(where);
    const rows = await this.withTransaction(transaction, (tx) => tx.queryAsync(sql, params));

    return this.mapRows(rows);
  }

  /**
   * Carrega uma coleção `@HasMany` pra um conjunto de entidades já buscadas
   * (ex: `repo.load(await repo.findAll(), "addresses")`). Roda uma segunda
   * query (`WHERE fk IN (...)`) em vez de JOIN, que duplicaria a entidade
   * dona por cada item da coleção. Entidades sem nenhum item recebem `[]`.
   */
  public async load(
    entities: T[],
    property: keyof T & string,
    transaction?: Transaction,
  ): Promise<T[]> {
    const relation = this.hasManyRelations.find((r) => r.property === property);

    if (!relation) {
      throw new Error(`'${property}' não é um @HasMany de '${this.entity.name}'.`);
    }

    for (const entity of entities) {
      (entity as any)[property] = [];
    }

    if (entities.length === 0) {
      return entities;
    }

    const target = relation.target();
    const targetEntity = getEntityMetadata(target);
    const targetColumns = getColumns(target);

    const foreignKeyColumn = targetColumns.find((c) => c.property === relation.foreignKeyProperty);

    if (!foreignKeyColumn) {
      throw new Error(
        `@HasMany '${property}': propriedade '${relation.foreignKeyProperty}' não encontrada em ${target.name}.`,
      );
    }

    const localKeyProperty =
      relation.referencedKeyProperty ?? getPrimaryKeyProperty(this.entityClass);

    const keys = [
      ...new Set(entities.map((e) => (e as any)[localKeyProperty]).filter((v) => v != null)),
    ];

    if (keys.length === 0) {
      return entities;
    }

    const placeholders = keys.map(() => "?").join(", ");
    const select = targetColumns
      .map((c) => `${targetEntity.prefix}.${c.name} AS ${c.alias ?? c.property}`)
      .join(", ");
    const sql = `SELECT ${select} FROM ${targetEntity.name} ${targetEntity.prefix} WHERE ${targetEntity.prefix}.${foreignKeyColumn.name} IN (${placeholders})`;

    const rows = await this.withTransaction(transaction, (tx) => tx.queryAsync(sql, keys));

    const grouped = new Map<any, any[]>();

    for (const row of rows) {
      const child = hydrateEntity(target as new () => any, targetColumns, row);
      const foreignKeyValue = (child as any)[foreignKeyColumn.property];

      if (!grouped.has(foreignKeyValue)) {
        grouped.set(foreignKeyValue, []);
      }

      grouped.get(foreignKeyValue)!.push(child);
    }

    for (const entity of entities) {
      const key = (entity as any)[localKeyProperty];
      (entity as any)[property] = grouped.get(key) ?? [];
    }

    return entities;
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
