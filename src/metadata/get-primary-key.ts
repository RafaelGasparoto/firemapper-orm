import { getEntityMetadata } from "./get-entity";
import { getColumns } from "./get-columns";

/** Propriedade (não coluna) que representa a N-ésima chave primária da entidade. */
export function getPrimaryKeyProperty(entity: Function, index = 0): string {
  const entityMetadata = getEntityMetadata(entity);
  const pkColumnName = entityMetadata.primaryKeys[index];

  if (!pkColumnName) {
    throw new Error(`${entity.name} não possui chave primária no índice ${index}.`);
  }

  const column = getColumns(entity).find((c) => c.name === pkColumnName);

  if (!column) {
    throw new Error(
      `${entity.name}: chave primária '${pkColumnName}' não corresponde a nenhuma propriedade com @Column.`,
    );
  }

  return column.property;
}
