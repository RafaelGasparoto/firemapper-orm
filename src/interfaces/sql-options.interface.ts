export type SqlOperator =
  | "="
  | "<>"
  | ">"
  | "<"
  | ">="
  | "<="
  | "IS NULL"
  | "IS NOT NULL"
  | "CONTAINING"
  | "LIKE"
  | "BETWEEN"
  | "IN";

export interface SqlFilter {
  /** Propriedade da entidade (`"name"`) ou de um `@BelongsTo`/`@HasOne` (`"user.name"`). */
  field: string;
  /** Padrão: `=`. */
  operator?: SqlOperator;
  value?: any;
}

export type SqlCondition = SqlFilter | SqlGroup;

/**
 * Formato aceito por `findOne`/`findById`/`update`/`delete` pra identificar
 * linhas: um id solto (só serve pra chave primária simples), um objeto
 * propriedade → valor (obrigatório pra chave composta, ex: `{ userId: 5, roleId: 2 }`),
 * ou uma lista de condições completa, igual ao `where` do `findAll`.
 */
export type WhereInput = number | string | Record<string, any> | SqlCondition[];

export interface SqlGroup {
  and?: SqlCondition[];
  or?: SqlCondition[];
}

export interface SqlOptions {
  where?: SqlCondition[];
  orderBy?: string;
  orderDirection?: "ASC" | "DESC";
  limit?: number;
  /** Ignorado se `limit` não for informado. Padrão: `0`. */
  offset?: number;
  /** Restringe o SELECT a estas propriedades (mesma convenção de `field`). Padrão: todas. */
  select?: string[];
}
