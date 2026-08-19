import "reflect-metadata";
import { registerRelation } from "../metadata/register-relation";

/**
 * Declara uma coleção: a chave estrangeira está na entidade RELACIONADA,
 * apontando de volta pra chave primária (ou `localKey`) desta entidade.
 * O lado "1" de um relacionamento 1:N.
 *
 * Diferente de `@BelongsTo`/`@HasOne`, não é resolvido via JOIN (duplicaria
 * esta entidade por cada item da coleção). Carregue com
 * `AbstractRepository.load(entidades, "propriedade")` depois do `findAll`/`findOne`.
 *
 * @param target     Função que retorna a classe da entidade relacionada.
 * @param foreignKey Propriedade da entidade relacionada que guarda o valor da chave estrangeira.
 * @param localKey   Propriedade **desta** entidade referenciada pela chave estrangeira. Padrão: a chave primária desta.
 *
 * @example
 * ```ts
 * @Entity({ name: 'usuarios', primaryKeys: ['id'] })
 * class UserEntity {
 *   @Column({ name: 'id' }) id: number;
 *
 *   @HasMany(() => AddressEntity, 'userId')
 *   addresses: AddressEntity[];
 * }
 * ```
 */
export function HasMany(target: () => Function, foreignKey: string, localKey?: string) {
  return (targetPrototype: object, propertyKey: string) => {
    registerRelation(targetPrototype.constructor, {
      kind: "hasMany",
      property: propertyKey,
      target,
      foreignKeyProperty: foreignKey,
      referencedKeyProperty: localKey,
      joinType: "LEFT",
    });
  };
}
