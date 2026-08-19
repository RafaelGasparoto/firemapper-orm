export type RelationKind = "belongsTo" | "hasOne" | "hasMany";
export type JoinType = "LEFT" | "INNER" | "RIGHT";

export interface RelationOptions {
  /** Tipo de JOIN usado ao resolver o relacionamento. Padrão: `LEFT`. */
  joinType?: JoinType;
  /**
   * Alias da tabela relacionada no SQL gerado. Padrão: o prefixo do
   * `@Entity` da entidade relacionada.
   */
  prefix?: string;
}

/**
 * Metadados de um relacionamento já resolvidos pelo decorator `@BelongsTo`/`@HasOne`/`@HasMany`.
 *
 * O significado de `foreignKeyProperty` e `referencedKeyProperty` depende de `kind`:
 * - `belongsTo`: a chave estrangeira está NESTA entidade (`foreignKeyProperty`); ela
 *   referencia uma propriedade da entidade relacionada (`referencedKeyProperty`,
 *   padrão: a chave primária dela).
 * - `hasOne`/`hasMany`: a chave estrangeira está na entidade RELACIONADA (`foreignKeyProperty`);
 *   ela referencia uma propriedade desta entidade (`referencedKeyProperty`,
 *   padrão: a chave primária desta).
 *
 * `hasMany` não entra em `AbstractSql.relations` (não é resolvido via JOIN,
 * que duplicaria a entidade dona por cada item da coleção) — é carregado
 * à parte, com `AbstractRepository.load`.
 */
export interface RelationMetadata extends RelationOptions {
  kind: RelationKind;
  property: string;
  target: () => Function;
  foreignKeyProperty: string;
  referencedKeyProperty?: string;
  joinType: JoinType;
}
