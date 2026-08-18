import type { ColumnType } from "../types/column-type";

export interface ColumnOptions {
  /** Nome da coluna no banco de dados. */
  name: string;
  /** Alias usado no SQL gerado (`SELECT col AS alias`). Padrão: o próprio nome da propriedade. */
  alias?: string;
  /** Tipo da coluna. Se omitido, é inferido do tipo TypeScript da propriedade (`design:type`). */
  type?: ColumnType;
  /** Se a coluna aceita `NULL` no banco. Padrão: `false`. */
  nullable?: boolean;
}

/** Metadados de uma coluna já resolvidos pelo decorator `@Column` — inclui a propriedade que a carrega. */
export interface ColumnMetadata extends ColumnOptions {
  property: string;
}
