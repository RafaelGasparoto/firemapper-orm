import "reflect-metadata";
import { registerRelation } from "../metadata/register-relation";
import type { RelationOptions } from "../interfaces/relation-options.interface";

/**
 * Declara que a chave estrangeira está na entidade RELACIONADA, apontando de
 * volta para a chave primária (ou `localKey`) desta entidade
 * de um relacionamento 1:1.
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
 *   @HasOne(() => ProfileEntity, 'userId')
 *   profile: ProfileEntity;
 * }
 *
 * @Entity({ name: 'perfis', primaryKeys: ['id'], prefix: 'pf' })
 * class ProfileEntity {
 *   @Column({ name: 'usuario_id' }) userId: number;
 * }
 * ```
 */
export function HasOne(
  target: () => Function,
  foreignKey: string,
  localKey?: string,
  options: RelationOptions = {},
) {
  return (targetPrototype: object, propertyKey: string) => {
    registerRelation(targetPrototype.constructor, {
      kind: "hasOne",
      property: propertyKey,
      target,
      foreignKeyProperty: foreignKey,
      referencedKeyProperty: localKey,
      prefix: options.prefix,
      joinType: options.joinType ?? "LEFT",
    });
  };
}
