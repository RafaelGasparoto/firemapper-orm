import { Entity } from "../../src/decorators/entity.decorator";
import { Column } from "../../src/decorators/column.decorator";
import { HasMany } from "../../src/decorators/has-many.decorator";
import { TestAddressEntity } from "./test-address.entity";

@Entity({ name: "users", primaryKeys: ["id"] })
export class TestUserEntity {
  @Column({ name: "id" })
  id!: number;

  @Column({ name: "name" })
  name!: string;

  @Column({ name: "email" })
  email!: string;

  @HasMany(() => TestAddressEntity, "userId")
  addresses!: TestAddressEntity[];
}
