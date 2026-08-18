import "reflect-metadata";
import { RELATION_METADATA_KEY } from "./metadata-keys";
import type { RelationMetadata } from "../interfaces/relation-options.interface";

export function getRelations(entity: Function): RelationMetadata[] {
  return Reflect.getMetadata(RELATION_METADATA_KEY, entity) || [];
}
