import "reflect-metadata";
import { registerRelation } from "../metadata/register-relation";
import type { RelationOptions } from "../interfaces/relation-options.interface";

/**
 * Declara que a entidade guarda a chave estrangeira, apontando para a
 * chave primária (ou `ownerKey`) de outra entidade.
 *
 * @param target     Função que retorna a classe da entidade relacionada.
 * @param foreignKey Propriedade **desta** entidade que guarda o valor da chave estrangeira.
 * @param ownerKey   Propriedade da entidade relacionada referenciada pela chave estrangeira. Padrão: a chave primária dela.
 *
 * @example
 * ```ts
 * @Entity({ name: 'users', primaryKeys: ['id'] })
 * class UserEntity {
 *   @Column({ name: 'id' }) id: number;
 *   @Column({ name: 'name' }) name: string;
 * }
 *
 * @Entity({ name: 'addresses', primaryKeys: ['id'] })
 * class AddressEntity {
 *   @Column({ name: 'user_id' }) userId: number;
 *
 *   @BelongsTo(() => UserEntity, 'userId')
 *   user: UserEntity;
 * }
 * ```
 */
export function BelongsTo(
  target: () => Function,
  foreignKey: string,
  ownerKey?: string,
  options: RelationOptions = {},
) {
  return (targetPrototype: object, propertyKey: string) => {
    registerRelation(targetPrototype.constructor, {
      kind: "belongsTo",
      property: propertyKey,
      target,
      foreignKeyProperty: foreignKey,
      referencedKeyProperty: ownerKey,
      prefix: options.prefix,
      joinType: options.joinType ?? "LEFT",
    });
  };
}
