import "dotenv/config";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { closePool } from "../src/database/firebird";
import { withRollback } from "./helpers/with-rollback";
import { TestUserRepository } from "./fixtures/test-user.repository";
import { TestAddressRepository } from "./fixtures/test-address.repository";

after(() => closePool());

test("insert devolve a entidade com o que o banco preencheu", async () => {
  await withRollback(async (tx) => {
    const users = new TestUserRepository();
    const user = await users.insert({ name: "Fulano", email: "fulano@example.com" }, tx);

    assert.equal(user.name, "Fulano");
    assert.equal(typeof user.id, "number");
  });
});

test("update muda só os campos enviados; delete some com a linha", async () => {
  await withRollback(async (tx) => {
    const users = new TestUserRepository();
    const user = await users.insert({ name: "Fulano", email: "fulano@example.com" }, tx);

    const [updated] = await users.update({ name: "Fulano Silva" }, user.id, tx);
    assert.equal(updated.name, "Fulano Silva");
    assert.equal(updated.email, "fulano@example.com");

    const deleted = await users.delete(user.id, tx);
    assert.equal(deleted.length, 1);

    const gone = await users.findById(user.id, tx);
    assert.equal(gone, null);
  });
});

test("@BelongsTo é resolvido via JOIN no findOne", async () => {
  await withRollback(async (tx) => {
    const users = new TestUserRepository();
    const addresses = new TestAddressRepository();

    const user = await users.insert({ name: "Fulano", email: "fulano@example.com" }, tx);
    const address = await addresses.insert(
      { userId: user.id, street: "Rua X", city: "Curitiba" },
      tx,
    );

    const found = await addresses.findById(address.id, tx);

    assert.ok(found?.user);
    assert.equal(found.user.name, "Fulano");
  });
});

test("@HasMany fica [] até chamar load", async () => {
  await withRollback(async (tx) => {
    const users = new TestUserRepository();
    const addresses = new TestAddressRepository();

    const user = await users.insert({ name: "Fulano", email: "fulano@example.com" }, tx);
    await addresses.insert({ userId: user.id, street: "Rua X", city: "Curitiba" }, tx);
    await addresses.insert({ userId: user.id, street: "Rua Y", city: "Curitiba" }, tx);

    const beforeLoad = await users.findById(user.id, tx);
    assert.deepEqual(beforeLoad?.addresses, []);

    const [afterLoad] = await users.load([beforeLoad!], "addresses", tx);
    assert.equal(afterLoad.addresses.length, 2);
  });
});

test("findAllWithRelations já carrega todo @HasMany, sem chamar load à parte", async () => {
  await withRollback(async (tx) => {
    const users = new TestUserRepository();
    const addresses = new TestAddressRepository();

    const user = await users.insert({ name: "Fulano", email: "fulano@example.com" }, tx);
    await addresses.insert({ userId: user.id, street: "Rua X", city: "Curitiba" }, tx);
    await addresses.insert({ userId: user.id, street: "Rua Y", city: "Curitiba" }, tx);

    const [found] = await users.findAllWithRelations(
      { where: [{ field: "id", value: user.id }] },
      tx,
    );

    assert.equal(found.addresses.length, 2);
    assert.deepEqual(found.addresses.map((a) => a.street).sort(), ["Rua X", "Rua Y"]);
  });
});
