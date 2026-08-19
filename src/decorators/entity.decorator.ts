import "reflect-metadata";
import { ENTITY_METADATA_KEY } from "../metadata/metadata-keys";
import { IncrementType } from "../enums/increment-type.enum";
import type { EntityMetadata, EntityOptions } from "../interfaces/entity-options.interface";

/**
 * Mapeia uma classe para uma tabela do banco de dados.
 *
 * @example
 * ```ts
 * @Entity({ name: 'usuarios', primaryKeys: ['id'] })
 * class UserEntity {
 *   @Column({ name: 'id' })
 *   id: number;
 * }
 * ```
 */
export function Entity(options: EntityOptions) {
  return function (constructor: Function) {
    if (Reflect.getMetadata(ENTITY_METADATA_KEY, constructor)) {
      throw new Error(
        `@Entity: a entidade ${constructor.name} já possui uma anotação de entidade.`,
      );
    }

    if (options.primaryKeys.length === 0) {
      throw new Error(
        `@Entity: a entidade ${constructor.name} precisa de ao menos uma chave primária.`,
      );
    }

    if (
      options.primaryKeys.length > 1 &&
      options.incrementType !== undefined &&
      options.incrementType !== IncrementType.COMPOSITE_KEY
    ) {
      throw new Error(
        `@Entity: ${constructor.name} tem mais de uma chave primária — incrementType deve ser COMPOSITE_KEY ou omitido.`,
      );
    }

    if (options.incrementType === IncrementType.GEN_ID && !options.generatorName) {
      throw new Error(
        `@Entity: 'generatorName' é obrigatório em ${constructor.name} quando incrementType é GEN_ID.`,
      );
    }

    const metadata: EntityMetadata = {
      ...options,
      prefix: options.prefix || options.name.slice(0, 2),
      incrementType:
        options.primaryKeys.length > 1
          ? IncrementType.COMPOSITE_KEY
          : (options.incrementType ?? IncrementType.AUTOINCREMENT),
    };

    Reflect.defineMetadata(ENTITY_METADATA_KEY, metadata, constructor);
  };
}
