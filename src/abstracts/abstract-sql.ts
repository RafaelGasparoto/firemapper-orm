import { getEntityMetadata } from "../metadata/get-entity";
import { getColumns } from "../metadata/get-columns";
import { getRelations } from "../metadata/get-relations";
import { getPrimaryKeyProperty } from "../metadata/get-primary-key";
import { resolveRelation } from "../metadata/resolve-relation";
import type { ResolvedRelation } from "../metadata/resolve-relation";
import type { ColumnMetadata } from "../interfaces/column-options.interface";
import type { EntityMetadata } from "../interfaces/entity-options.interface";
import type { ColumnType } from "../types/column-type";
import type {
  SqlCondition,
  SqlFilter,
  SqlOptions,
} from "../interfaces/sql-options.interface";

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
  protected readonly relations: ResolvedRelation[];

  constructor(protected readonly entityClass: new () => T) {
    this.entity = getEntityMetadata(entityClass);
    this.columns = getColumns(entityClass);
    this.relations = getRelations(entityClass).map((relation) =>
      resolveRelation(entityClass, relation),
    );

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
   * Transforma as linhas que vieram do banco em instâncias de verdade da entidade.
   * Cada `@BelongsTo`/`@HasOne` também vira uma instância, ou `null` quando o LEFT JOIN não achou nada.
   */
  protected mapRows(rows: Record<string, any>[]): T[] {
    return rows.map((row) => this.mapRow(row));
  }

  /** Igual a `mapRows`, mas pra uma linha só. */
  protected mapRow(row: Record<string, any>): T {
    const instance = new this.entityClass();

    for (const column of this.columns) {
      (instance as any)[column.property] = readColumnValue(
        row,
        column.alias ?? column.property,
      );
    }

    for (const relation of this.relations) {
      (instance as any)[relation.property] = this.mapRelation(row, relation);
    }

    return instance;
  }

  private mapRelation(
    row: Record<string, any>,
    relation: ResolvedRelation,
  ): any {
    const target = relation.target as new () => any;
    const primaryKeyProperty = getPrimaryKeyProperty(target);
    const primaryKeyColumn = relation.columns.find(
      (c) => c.property === primaryKeyProperty,
    )!;

    const primaryKeyValue = readColumnValue(
      row,
      relationAlias(relation, primaryKeyColumn),
    );

    if (primaryKeyValue === null) {
      return null;
    }

    const instance = new target();

    for (const column of relation.columns) {
      instance[column.property] = readColumnValue(
        row,
        relationAlias(relation, column),
      );
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
    const included = (property: string) =>
      !shouldFilter || select!.includes(property);

    const ownFields = this.columns
      .filter((c) => included(c.property))
      .map(
        (c) => `${this.entity.prefix}.${c.name} AS ${c.alias ?? c.property}`,
      );

    const relationFields = this.relations.flatMap((relation) =>
      relation.columns
        .filter((c) => included(`${relation.property}.${c.property}`))
        .map(
          (c) =>
            `${relation.prefix}.${c.name} AS ${relationAlias(relation, c)}`,
        ),
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

  private buildWhere(
    sql: string,
    params: any[],
    conditions?: SqlCondition[],
  ): string {
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
          throw new Error(
            `Operador IN precisa de um array não vazio ('${filter.field}').`,
          );
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

  private buildOrderBy(
    sql: string,
    orderBy?: string,
    direction?: "ASC" | "DESC",
  ): string {
    const column = orderBy
      ? this.resolveField(orderBy).column
      : `${this.entity.prefix}.${this.entity.primaryKeys[0]}`;

    return `${sql} ORDER BY ${column} ${direction?.toUpperCase() === "DESC" ? "DESC" : "ASC"}`;
  }

  /**
   * Adiciona a paginação. O Firebird pagina com `ROWS <inicio> TO <fim>`,
   * contando a partir de 1 e incluindo as duas pontas — por isso o `+1`.
   */
  private buildPagination(
    sql: string,
    params: any[],
    limit?: number,
    offset = 0,
  ): string {
    if (limit === undefined) {
      return sql;
    }

    if (
      !Number.isFinite(limit) ||
      !Number.isFinite(offset) ||
      limit < 1 ||
      offset < 0
    ) {
      throw new Error(
        "Limit e offset devem ser números válidos (limit >= 1, offset >= 0).",
      );
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
        throw new Error(
          `Campo '${field}' não encontrado em '${this.entity.name}'.`,
        );
      }

      return {
        column: `${this.entity.prefix}.${found.name}`,
        type: found.type,
      };
    }

    const relationProperty = field.slice(0, dotIndex);
    const columnProperty = field.slice(dotIndex + 1);
    const relation = this.relations.find(
      (r) => r.property === relationProperty,
    );

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
        return String(value).toUpperCase() === "TRUE" ||
          String(value).toUpperCase() === "S"
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
        throw new Error(
          `Relacionamento '${relation.property}' (${relation.table}) sem colunas.`,
        );
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

function relationAlias(
  relation: ResolvedRelation,
  column: ColumnMetadata,
): string {
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
