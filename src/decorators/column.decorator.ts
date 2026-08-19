import "reflect-metadata";
import { COLUMN_METADATA_KEY } from "../metadata/metadata-keys";
import type { ColumnMetadata, ColumnOptions } from "../interfaces/column-options.interface";
import type { ColumnType } from "../types/column-type";

/**
 * Mapeia uma propriedade da entidade para uma coluna do banco de dados.
 *
 * @example
 * ```ts
 * @Column({ name: 'nome' })
 * name: string;
 * ```
 */
export function Column(options: ColumnOptions) {
  return (target: object, propertyKey: string) => {
    const columns: ColumnMetadata[] =
      Reflect.getMetadata(COLUMN_METADATA_KEY, target.constructor) || [];

    const designType = Reflect.getMetadata("design:type", target, propertyKey);
    const inferredType = designType?.name?.toLowerCase() as ColumnType | undefined;

    if (columns.some((c) => c.property === propertyKey)) {
      throw new Error(
        `@Column: a propriedade '${propertyKey}' de ${target.constructor.name} já possui uma coluna.`,
      );
    }

    columns.push({
      ...options,
      property: propertyKey,
      type: options.type ?? inferredType,
    });

    Reflect.defineMetadata(COLUMN_METADATA_KEY, columns, target.constructor);
  };
}
