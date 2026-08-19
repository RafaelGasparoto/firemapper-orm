import { AbstractRepository } from "../../src/abstracts/abstract-repository";
import { TestUserEntity } from "./test-user.entity";

export class TestUserRepository extends AbstractRepository<TestUserEntity> {
  constructor() {
    super(TestUserEntity);
  }
}
