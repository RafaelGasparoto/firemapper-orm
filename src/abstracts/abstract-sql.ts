import { getEntityMetadata } from "../metadata/get-entity";
import { getColumns } from "../metadata/get-columns";
import { getRelations } from "../metadata/get-relations";
import { getPrimaryKeyProperty } from "../metadata/get-primary-key";
import { resolveRelation } from "../metadata/resolve-relation";
import type { ResolvedRelation } from "../metadata/resolve-relation";
import type { ColumnMetadata } from "../interfaces/column-options.interface";
import type { EntityMetadata } from "../interfaces/entity-options.interface";
import type { RelationMetadata } from "../interfaces/relation-options.interface";
import type { ColumnType } from "../types/column-type";
import type {
  SqlCondition,
  SqlFilter,
  SqlOptions,
  WhereInput,
} from "../interfaces/sql-options.interface";
import { IncrementType } from "../enums/increment-type.enum";

export interface QueryWithParams {
  sql: string;
  params: any[];
}

/**
 * Monta um SELECT a partir do que já está nos decorators (`@Entity`, `@Column`,
 * `@BelongsTo`, `@HasOne`).
 *
 * Pra referenciar um campo, usa o nome da propriedade: `"name"` pra uma coluna
 * da própria entidade, `"user.name"` pra uma coluna de um relacionamento.
 */
export abstract class AbstractSql<T> {
  protected readonly entity: EntityMetadata;
  protected readonly columns: ColumnMetadata[];
  /** `@BelongsTo`/`@HasOne` — resolvidos via JOIN, entram no SELECT. */
  protected readonly relations: ResolvedRelation[];
  /** `@HasMany` — não entra no SELECT (duplicaria a entidade dona). Carregado à parte, ver `AbstractRepository.load`. */
  protected readonly hasManyRelations: RelationMetadata[];

  constructor(protected readonly entityClass: new () => T) {
    this.entity = getEntityMetadata(entityClass);
    this.columns = getColumns(entityClass);

    const allRelations = getRelations(entityClass);
    this.relations = allRelations
      .filter((relation) => relation.kind !== "hasMany")
      .map((relation) => resolveRelation(entityClass, relation));
    this.hasManyRelations = allRelations.filter((relation) => relation.kind === "hasMany");

    this.validateEntity();
  }

  /** Monta o SELECT inteiro: campos, JOINs, WHERE, ORDER BY e paginação. */
  protected buildSelectQuery(options?: SqlOptions): QueryWithParams {
    const params: any[] = [];
    let sql = this.buildBaseSelect(options?.select);

    sql = this.buildWhere(sql, params, options?.where);
    sql = this.buildOrderBy(sql, options?.orderBy, options?.orderDirection);
    sql = this.buildPagination(sql, params, options?.limit, options?.offset);

    return { sql, params };
  }

  /**
   * Monta um INSERT a partir de uma instância parcial de `T`. `undefined` não
   * entra na query (a coluna fica de fora, o banco decide o valor); `null`
   * vira `NULL`, se a coluna for `nullable` lança erro antes de ir pro banco.
   *
   * Com `incrementType` `GEN_ID` ou `MAX_ID`, a chave primária é gerada em
   * SQL (não vem do `entity`, mesmo que você a preencha).
   *
   * O `RETURNING` usa os mesmos aliases do `findAll`, então dá pra jogar
   * direto em `mapRow`.
   */
  protected buildInsertQuery(entity: Partial<T>): QueryWithParams {
    const params: any[] = [];
    const generatedPrimaryKey = this.buildGeneratedPrimaryKey();

    const columnsToInsert = this.columns.filter(
      (c) =>
        c.name !== generatedPrimaryKey?.columnName && (entity as any)[c.property] !== undefined,
    );

    if (columnsToInsert.length === 0 && !generatedPrimaryKey) {
      throw new Error(`Nenhum campo para inserir em '${this.entity.name}'.`);
    }

    const columnNames = [
      ...(generatedPrimaryKey ? [generatedPrimaryKey.columnName] : []),
      ...columnsToInsert.map((c) => c.name),
    ].join(", ");

    const values = [
      ...(generatedPrimaryKey ? [generatedPrimaryKey.expression] : []),
      ...columnsToInsert.map((c) => {
        params.push(this.resolveValueForWrite(c, (entity as any)[c.property]));
        return "?";
      }),
    ].join(", ");

    return {
      sql: `INSERT INTO ${this.entity.name} (${columnNames}) VALUES (${values}) RETURNING ${this.buildReturning()}`,
      params,
    };
  }

  /**
   * Pra `incrementType` `GEN_ID`/`MAX_ID`, monta a expressão SQL que gera a
   * chave primária no próprio INSERT. `null` pros outros tipos (`AUTOINCREMENT`
   * usa a IDENTITY da coluna; `NONE`/`COMPOSITE_KEY` esperam o valor no `entity`).
   */
  private buildGeneratedPrimaryKey(): { columnName: string; expression: string } | null {
    const pkColumnName = this.entity.primaryKeys[0];

    if (this.entity.incrementType === IncrementType.GEN_ID) {
      if (!this.entity.generatorName) {
        throw new Error(
          `Entidade '${this.entity.name}': incrementType GEN_ID precisa de 'generatorName'.`,
        );
      }

      return { columnName: pkColumnName, expression: `GEN_ID(${this.entity.generatorName}, 1)` };
    }

    if (this.entity.incrementType === IncrementType.MAX_ID) {
      return {
        columnName: pkColumnName,
        expression: `(SELECT COALESCE(MAX(${pkColumnName}), 0) + 1 FROM ${this.entity.name})`,
      };
    }

    return null;
  }

  /**
   * Monta um UPDATE a partir de uma instância parcial de `T`. Mesma regra do
   * insert: `undefined` não entra na query, `null` vira `NULL` se a coluna aceitar.
   *
   * `where` aceita um id (só pra chave primária simples), um objeto
   * propriedade → valor (obrigatório pra chave composta) ou uma lista de
   * condições. Nunca pode vir vazio, por segurança.
   */
  protected buildUpdateQuery(entity: Partial<T>, where: WhereInput): QueryWithParams {
    const params: any[] = [];
    const columnsToUpdate = this.columns.filter((c) => (entity as any)[c.property] !== undefined);

    if (columnsToUpdate.length === 0) {
      throw new Error(`Nenhum campo para atualizar em '${this.entity.name}'.`);
    }

    const setClause = columnsToUpdate
      .map((c) => {
        params.push(this.resolveValueForWrite(c, (entity as any)[c.property]));
        return `${c.name} = ?`;
      })
      .join(", ");

    let sql = `UPDATE ${this.entity.name} ${this.entity.prefix} SET ${setClause}`;
    sql = this.buildWhere(sql, params, this.resolveWhere(where));

    return { sql: `${sql} RETURNING ${this.buildReturning()}`, params };
  }

  /** Monta um DELETE. `where` aceita as mesmas opções do `buildUpdateQuery`. */
  protected buildDeleteQuery(where: WhereInput): QueryWithParams {
    const params: any[] = [];
    let sql = `DELETE FROM ${this.entity.name} ${this.entity.prefix}`;
    sql = this.buildWhere(sql, params, this.resolveWhere(where));

    return { sql: `${sql} RETURNING ${this.buildReturning()}`, params };
  }

  /** Colunas próprias com o mesmo alias do `findAll`, pra usar em RETURNING. */
  private buildReturning(): string {
    return this.columns.map((c) => `${c.name} AS ${c.alias ?? c.property}`).join(", ");
  }

  /**
   * Um id vira condição pela chave primária (só funciona pra chave simples);
   * um objeto vira uma condição por propriedade, unidas com AND; uma lista
   * de condições passa direto. Nunca aceita vazio.
   */
  protected resolveWhere(where: WhereInput): SqlCondition[] {
    const conditions = Array.isArray(where) ? where : this.resolveWhereShorthand(where);

    if (conditions.length === 0) {
      throw new Error(`'${this.entity.name}': precisa de pelo menos uma condição, por segurança.`);
    }

    return conditions;
  }

  private resolveWhereShorthand(where: number | string | Record<string, any>): SqlFilter[] {
    if (typeof where === "object") {
      return Object.entries(where).map(([field, value]) => ({ field, value }));
    }

    if (this.entity.primaryKeys.length > 1) {
      throw new Error(
        `Entidade '${this.entity.name}' tem chave composta (${this.entity.primaryKeys.join(", ")}). ` +
          "Passe um objeto com todas as colunas em vez de um id solto.",
      );
    }

    return [{ field: getPrimaryKeyProperty(this.entityClass), value: where }];
  }

  /** Valida `null` contra `nullable` e converte o valor pro tipo da coluna. Usado por insert e update. */
  private resolveValueForWrite(column: ColumnMetadata, value: any): any {
    if (value === null && !column.nullable) {
      throw new Error(`Campo '${column.property}' de '${this.entity.name}' não aceita null.`);
    }

    return this.processValue(value, `${this.entity.prefix}.${column.name}`, column.type);
  }

  /**
   * Transforma as linhas que vieram do banco em instâncias de verdade da entidade.
   * Cada `@BelongsTo`/`@HasOne` também vira uma instância, ou `null` quando o LEFT JOIN não achou nada.
   */
  protected mapRows(rows: Record<string, any>[]): T[] {
    return rows.map((row) => this.mapRow(row));
  }

  /** Igual a `mapRows`, mas pra uma linha só. */
  protected mapRow(row: Record<string, any>): T {
    const instance = hydrateEntity(this.entityClass, this.columns, row);

    for (const relation of this.relations) {
      (instance as any)[relation.property] = this.mapRelation(row, relation);
    }

    for (const relation of this.hasManyRelations) {
      (instance as any)[relation.property] = [];
    }

    return instance;
  }

  private mapRelation(row: Record<string, any>, relation: ResolvedRelation): any {
    const target = relation.target as new () => any;
    const primaryKeyProperty = getPrimaryKeyProperty(target);
    const primaryKeyColumn = relation.columns.find((c) => c.property === primaryKeyProperty)!;

    const primaryKeyValue = readColumnValue(row, relationAlias(relation, primaryKeyColumn));

    if (primaryKeyValue === null) {
      return null;
    }

    const instance = new target();

    for (const column of relation.columns) {
      const value = readColumnValue(row, relationAlias(relation, column));
      instance[column.property] = parseColumnValue(value, column.type);
    }

    return instance;
  }

  /**
   * Monta o `SELECT ... FROM ... JOIN ...`. As colunas de cada relacionamento
   * ganham um alias `<relacao>_<coluna>` pra não bater de frente com as
   * colunas da própria entidade.
   */
  private buildBaseSelect(select?: string[]): string {
    const shouldFilter = !!select?.length;
    const included = (property: string) => !shouldFilter || select!.includes(property);

    const ownFields = this.columns
      .filter((c) => included(c.property))
      .map((c) => `${this.entity.prefix}.${c.name} AS ${c.alias ?? c.property}`);

    const relationFields = this.relations.flatMap((relation) =>
      relation.columns
        .filter((c) => included(`${relation.property}.${c.property}`))
        .map((c) => `${relation.prefix}.${c.name} AS ${relationAlias(relation, c)}`),
    );

    const fields = [...ownFields, ...relationFields];

    if (fields.length === 0) {
      throw new Error(
        `Nenhum campo selecionado para '${this.entity.name}' — verifique a opção 'select'.`,
      );
    }

    const joins = this.relations.map((r) => r.joinSql).join(" ");

    return `SELECT ${fields.join(", ")} FROM ${this.entity.name} ${this.entity.prefix}${joins ? ` ${joins}` : ""}`;
  }

  private buildWhere(sql: string, params: any[], conditions?: SqlCondition[]): string {
    if (!conditions?.length) {
      return sql;
    }

    const built = conditions.map((c) => this.buildCondition(c));
    params.push(...built.flatMap((c) => c.params));

    return `${sql} WHERE ${built.map((c) => c.sql).join(" AND ")}`;
  }

  private buildCondition(condition: SqlCondition): {
    sql: string;
    params: any[];
  } {
    if ("field" in condition) {
      return this.buildFilter(condition);
    }

    const parts: string[] = [];
    const params: any[] = [];

    if (condition.and?.length) {
      const built = condition.and.map((c) => this.buildCondition(c));
      parts.push(`(${built.map((c) => c.sql).join(" AND ")})`);
      params.push(...built.flatMap((c) => c.params));
    }

    if (condition.or?.length) {
      const built = condition.or.map((c) => this.buildCondition(c));
      parts.push(`(${built.map((c) => c.sql).join(" OR ")})`);
      params.push(...built.flatMap((c) => c.params));
    }

    return { sql: parts.join(" AND "), params };
  }

  private buildFilter(filter: SqlFilter): { sql: string; params: any[] } {
    const { column, type } = this.resolveField(filter.field);
    const operator = filter.operator ?? "=";
    const params: any[] = [];

    switch (operator) {
      case "=":
      case "<>":
      case ">":
      case "<":
      case ">=":
      case "<=":
        params.push(this.processValue(filter.value, column, type));
        return { sql: `${column} ${operator} ?`, params };

      case "IS NULL":
        return { sql: `${column} IS NULL`, params: [] };

      case "IS NOT NULL":
        return { sql: `${column} IS NOT NULL`, params: [] };

      case "CONTAINING":
        params.push(this.processValue(filter.value, column, type));
        return { sql: `${column} COLLATE PT_BR CONTAINING ?`, params };

      case "LIKE":
        params.push(`%${filter.value}%`);
        return { sql: `${column} LIKE ?`, params };

      case "BETWEEN": {
        if (!Array.isArray(filter.value) || filter.value.length !== 2) {
          throw new Error(
            `Operador BETWEEN precisa de um array com dois elementos ('${filter.field}').`,
          );
        }
        params.push(this.processValue(filter.value[0], column, type));
        params.push(this.processValue(filter.value[1], column, type));
        return { sql: `${column} BETWEEN ? AND ?`, params };
      }

      case "IN": {
        if (!Array.isArray(filter.value) || filter.value.length === 0) {
          throw new Error(`Operador IN precisa de um array não vazio ('${filter.field}').`);
        }
        const placeholders = filter.value.map((v) => {
          params.push(this.processValue(v, column, type));
          return "?";
        });
        return { sql: `${column} IN (${placeholders.join(", ")})`, params };
      }

      default:
        throw new Error(`Operador '${operator}' não suportado.`);
    }
  }

  /** Sem `orderBy`, ordena pela chave primária inteira (todas as colunas, se for composta). */
  private buildOrderBy(sql: string, orderBy?: string, direction?: "ASC" | "DESC"): string {
    const directionSql = direction?.toUpperCase() === "DESC" ? "DESC" : "ASC";

    if (orderBy) {
      return `${sql} ORDER BY ${this.resolveField(orderBy).column} ${directionSql}`;
    }

    const columns = this.entity.primaryKeys
      .map((pk) => `${this.entity.prefix}.${pk} ${directionSql}`)
      .join(", ");

    return `${sql} ORDER BY ${columns}`;
  }

  /**
   * Adiciona a paginação. O Firebird pagina com `ROWS <inicio> TO <fim>`,
   * contando a partir de 1 e incluindo as duas pontas, por isso o `+1`.
   */
  private buildPagination(sql: string, params: any[], limit?: number, offset = 0): string {
    if (limit === undefined) {
      return sql;
    }

    if (!Number.isFinite(limit) || !Number.isFinite(offset) || limit < 1 || offset < 0) {
      throw new Error("Limit e offset devem ser números válidos (limit >= 1, offset >= 0).");
    }

    params.push(offset + 1, offset + limit);

    return `${sql} ROWS ? TO ?`;
  }

  /** Acha a coluna de um campo: `"nome"` é da própria entidade, `"relacao.nome"` é de um relacionamento. */
  private resolveField(field: string): { column: string; type?: ColumnType } {
    const dotIndex = field.indexOf(".");

    if (dotIndex === -1) {
      const found = this.columns.find((c) => c.property === field);

      if (!found) {
        throw new Error(`Campo '${field}' não encontrado em '${this.entity.name}'.`);
      }

      return {
        column: `${this.entity.prefix}.${found.name}`,
        type: found.type,
      };
    }

    const relationProperty = field.slice(0, dotIndex);
    const columnProperty = field.slice(dotIndex + 1);
    const relation = this.relations.find((r) => r.property === relationProperty);

    if (!relation) {
      throw new Error(
        `Relacionamento '${relationProperty}' não encontrado em '${this.entity.name}'.`,
      );
    }

    const found = relation.columns.find((c) => c.property === columnProperty);

    if (!found) {
      throw new Error(
        `Campo '${columnProperty}' não encontrado em '${relationProperty}' (${relation.table}).`,
      );
    }

    return { column: `${relation.prefix}.${found.name}`, type: found.type };
  }

  private processValue(value: any, column: string, type?: ColumnType): any {
    if (value === null || value === undefined) {
      return null;
    }

    switch (type) {
      case "number": {
        const n = Number(value);
        if (isNaN(n)) throw new Error(`Campo ${column} deve ser number.`);
        return n;
      }

      case "boolean":
        return value ? "TRUE" : "FALSE";

      case "string-boolean":
        return String(value).toUpperCase() === "TRUE" || String(value).toUpperCase() === "S"
          ? "S"
          : "N";

      default:
        return value;
    }
  }

  /**
   * Confere se está tudo certo antes de gerar SQL: entidade sem coluna,
   * relacionamento sem coluna, ou prefixo repetido (o que geraria um SQL
   * com o mesmo alias de tabela duas vezes).
   */
  private validateEntity() {
    if (this.columns.length === 0) {
      throw new Error(`Entidade '${this.entity.name}' sem colunas.`);
    }

    const prefixes = new Set([this.entity.prefix]);

    for (const relation of this.relations) {
      if (relation.columns.length === 0) {
        throw new Error(`Relacionamento '${relation.property}' (${relation.table}) sem colunas.`);
      }

      if (prefixes.has(relation.prefix)) {
        throw new Error(
          `Entidade '${this.entity.name}': prefixo '${relation.prefix}' duplicado no relacionamento '${relation.property}'. Informe um 'prefix' diferente em @BelongsTo/@HasOne.`,
        );
      }

      prefixes.add(relation.prefix);
    }
  }
}

function relationAlias(relation: ResolvedRelation, column: ColumnMetadata): string {
  return `${relation.property}_${column.alias ?? column.property}`;
}

/**
 * Lê o valor de uma coluna pelo alias que a gente mesmo colocou no SELECT
 * (`buildBaseSelect` sempre gera um), tolerando o uppercase que o Firebird
 * devolve por padrão.
 *
 * Não tenta o nome cru da coluna como fallback: duas tabelas costumam ter
 * coluna com o mesmo nome (`id`, `name`...), e isso já causou bug de pegar
 * o valor da entidade errada.
 */
function readColumnValue(row: Record<string, any>, alias: string): any {
  const value = row[alias.toUpperCase()] ?? row[alias];
  return value ?? null;
}

/**
 * Converte o valor cru do banco pro tipo declarado na coluna. Por enquanto
 * só mexe em `string-boolean`: `S`/`Y` vira `true`, `N` vira `false`. Cobre
 * tanto CHAR(1) em português (S/N) quanto em inglês (Y/N).
 */
function parseColumnValue(value: any, type?: ColumnType): any {
  if (value === null || value === undefined) {
    return null;
  }

  if (type === "string-boolean") {
    const normalized = String(value).trim().toUpperCase();
    return normalized === "S" || normalized === "Y";
  }

  return value;
}

/**
 * Cria uma instância de `entityClass` e preenche `columns` a partir de `row`
 * (mesma leitura/conversão que `mapRow` usa pros campos próprios). Também
 * usada por `AbstractRepository.load` pra montar os itens de uma coleção `@HasMany`.
 */
export function hydrateEntity<E>(
  entityClass: new () => E,
  columns: ColumnMetadata[],
  row: Record<string, any>,
): E {
  const instance = new entityClass();

  for (const column of columns) {
    const value = readColumnValue(row, column.alias ?? column.property);
    (instance as any)[column.property] = parseColumnValue(value, column.type);
  }

  return instance;
}
