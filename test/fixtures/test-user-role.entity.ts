import { Entity } from "../../src/decorators/entity.decorator";
import { Column } from "../../src/decorators/column.decorator";

// Chave composta: usada pra testar o resolveWhere com { userId, roleId }.
@Entity({ name: "user_roles", primaryKeys: ["user_id", "role_id"] })
export class TestUserRoleEntity {
  @Column({ name: "user_id" })
  userId!: number;

  @Column({ name: "role_id" })
  roleId!: number;

  @Column({ name: "granted_at" })
  grantedAt!: Date;
}
