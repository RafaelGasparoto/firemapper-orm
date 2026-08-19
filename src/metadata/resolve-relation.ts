import { getEntityMetadata } from "./get-entity";
import { getColumns } from "./get-columns";
import { getPrimaryKeyProperty } from "./get-primary-key";
import type { ColumnMetadata } from "../interfaces/column-options.interface";
import type {
  JoinType,
  RelationKind,
  RelationMetadata,
} from "../interfaces/relation-options.interface";

export interface ResolvedRelation {
  kind: RelationKind;
  /** Propriedade da entidade dona que recebe o objeto relacionado. */
  property: string;
  /** Classe da entidade relacionada. */
  target: Function;
  /** Nome da tabela relacionada. */
  table: string;
  /** Alias da tabela relacionada usado no SQL. */
  prefix: string;
  joinType: JoinType;
  /** Cláusula pronta, ex: `LEFT JOIN forma_atendimento fa ON fa.cod_forma = a.cod_forma`. */
  joinSql: string;
  /** Colunas da entidade relacionada, para montar o SELECT e o hidratador de linhas. */
  columns: ColumnMetadata[];
}

function findColumn(
  columns: ColumnMetadata[],
  property: string,
  entityName: string,
  relation: RelationMetadata,
): ColumnMetadata {
  const column = columns.find((c) => c.property === property);

  if (!column) {
    const decoratorName = relation.kind === "belongsTo" ? "BelongsTo" : "HasOne";
    throw new Error(
      `@${decoratorName}: propriedade '${property}' não encontrada em ${entityName} (usada no relacionamento '${relation.property}').`,
    );
  }

  return column;
}

/**
 * Resolve um `@BelongsTo`/`@HasOne` já declarado em `owner` para uma cláusula
 * JOIN pronta e a lista de colunas disponíveis na entidade relacionada —
 * tudo derivado do `@Entity`/`@Column` de ambos os lados, sem SQL manual.
 */
export function resolveRelation(owner: Function, relation: RelationMetadata): ResolvedRelation {
  const target = relation.target();
  const ownerEntity = getEntityMetadata(owner);
  const targetEntity = getEntityMetadata(target);
  const ownerColumns = getColumns(owner);
  const targetColumns = getColumns(target);

  const prefix = relation.prefix ?? targetEntity.prefix;

  let joinSql: string;

  if (relation.kind === "belongsTo") {
    const fkColumn = findColumn(ownerColumns, relation.foreignKeyProperty, owner.name, relation);
    const ownerKeyProperty = relation.referencedKeyProperty ?? getPrimaryKeyProperty(target);
    const ownerKeyColumn = findColumn(targetColumns, ownerKeyProperty, target.name, relation);

    joinSql = `${relation.joinType} JOIN ${targetEntity.name} ${prefix} ON ${prefix}.${ownerKeyColumn.name} = ${ownerEntity.prefix}.${fkColumn.name}`;
  } else {
    const fkColumn = findColumn(targetColumns, relation.foreignKeyProperty, target.name, relation);
    const localKeyProperty = relation.referencedKeyProperty ?? getPrimaryKeyProperty(owner);
    const localKeyColumn = findColumn(ownerColumns, localKeyProperty, owner.name, relation);

    joinSql = `${relation.joinType} JOIN ${targetEntity.name} ${prefix} ON ${prefix}.${fkColumn.name} = ${ownerEntity.prefix}.${localKeyColumn.name}`;
  }

  return {
    kind: relation.kind,
    property: relation.property,
    target,
    table: targetEntity.name,
    prefix,
    joinType: relation.joinType,
    joinSql,
    columns: targetColumns,
  };
}
