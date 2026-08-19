import { AbstractRepository } from "../../src/abstracts/abstract-repository";
import { TestAddressEntity } from "./test-address.entity";

export class TestAddressRepository extends AbstractRepository<TestAddressEntity> {
  constructor() {
    super(TestAddressEntity);
  }
}
