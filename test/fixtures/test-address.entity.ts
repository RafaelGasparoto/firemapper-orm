import { Entity } from "../../src/decorators/entity.decorator";
import { Column } from "../../src/decorators/column.decorator";
import { BelongsTo } from "../../src/decorators/belongs-to.decorator";
import { TestUserEntity } from "./test-user.entity";

@Entity({ name: "addresses", primaryKeys: ["id"] })
export class TestAddressEntity {
  @Column({ name: "id" })
  id!: number;

  @Column({ name: "user_id" })
  userId!: number;

  @Column({ name: "street" })
  street!: string;

  @Column({ name: "city" })
  city!: string;

  @Column({ name: "state", nullable: true })
  state!: string | null;

  @Column({ name: "zip_code", nullable: true })
  zipCode!: string | null;

  @BelongsTo(() => TestUserEntity, "userId")
  user!: TestUserEntity;
}
