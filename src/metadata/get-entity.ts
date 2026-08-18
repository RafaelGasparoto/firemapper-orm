import "reflect-metadata";
import { ENTITY_METADATA_KEY } from "./metadata-keys";
import type { EntityMetadata } from "../interfaces/entity-options.interface";

export function getEntityMetadata(entity: Function): EntityMetadata {
  const metadata: EntityMetadata | undefined = Reflect.getMetadata(ENTITY_METADATA_KEY, entity);

  if (!metadata) {
    throw new Error(`${entity.name} não está decorada com @Entity.`);
  }

  return metadata;
}
