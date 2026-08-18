import "reflect-metadata";
import { COLUMN_METADATA_KEY } from "./metadata-keys";
import type { ColumnMetadata } from "../interfaces/column-options.interface";

export function getColumns(entity: Function): ColumnMetadata[] {
  return Reflect.getMetadata(COLUMN_METADATA_KEY, entity) || [];
}
