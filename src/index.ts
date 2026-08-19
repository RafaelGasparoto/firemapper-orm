import "dotenv/config";

export * from "./database/firebird";
export * from "./database/transaction";

export * from "./decorators/entity.decorator";
export * from "./decorators/column.decorator";
export * from "./decorators/belongs-to.decorator";
export * from "./decorators/has-one.decorator";
export * from "./decorators/has-many.decorator";

export * from "./metadata/get-entity";
export * from "./metadata/get-columns";
export * from "./metadata/get-relations";
export * from "./metadata/get-primary-key";
export * from "./metadata/resolve-relation";

export * from "./abstracts/abstract-sql";
export * from "./abstracts/abstract-repository";

export * from "./enums/increment-type.enum";
export type { ColumnType } from "./types/column-type";
export type { ColumnOptions, ColumnMetadata } from "./interfaces/column-options.interface";
export type { EntityOptions, EntityMetadata } from "./interfaces/entity-options.interface";
export type {
  RelationOptions,
  RelationMetadata,
  RelationKind,
  JoinType,
} from "./interfaces/relation-options.interface";
export type {
  SqlOperator,
  SqlFilter,
  SqlCondition,
  SqlGroup,
  SqlOptions,
} from "./interfaces/sql-options.interface";
