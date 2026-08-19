import "reflect-metadata";
import { RELATION_METADATA_KEY } from "./metadata-keys";
import type { RelationMetadata } from "../interfaces/relation-options.interface";

const DECORATOR_NAME: Record<RelationMetadata["kind"], string> = {
  belongsTo: "BelongsTo",
  hasOne: "HasOne",
};

/** Usado pelos decorators `@BelongsTo`/`@HasOne` para gravar o relacionamento nos metadados da entidade. */
export function registerRelation(constructor: Function, relation: RelationMetadata) {
  const relations: RelationMetadata[] =
    Reflect.getMetadata(RELATION_METADATA_KEY, constructor) || [];

  if (relations.some((r) => r.property === relation.property)) {
    throw new Error(
      `@${DECORATOR_NAME[relation.kind]}: a propriedade '${relation.property}' de ${constructor.name} já possui um relacionamento.`,
    );
  }

  relations.push(relation);
  Reflect.defineMetadata(RELATION_METADATA_KEY, relations, constructor);
}
