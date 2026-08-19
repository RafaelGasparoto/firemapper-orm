import { test } from "node:test";
import assert from "node:assert/strict";
import { AbstractSql } from "../src/abstracts/abstract-sql";
import type { SqlOptions, WhereInput } from "../src/interfaces/sql-options.interface";
import { TestAddressEntity } from "./fixtures/test-address.entity";
import { TestUserRoleEntity } from "./fixtures/test-user-role.entity";

// Subclasse só pra expor os métodos protected do AbstractSql pro teste.
class TestableSql<T> extends AbstractSql<T> {
  select(options?: SqlOptions) {
    return this.buildSelectQuery(options);
  }
  insert(entity: Partial<T>) {
    return this.buildInsertQuery(entity);
  }
  update(entity: Partial<T>, where: WhereInput) {
    return this.buildUpdateQuery(entity, where);
  }
  delete(where: WhereInput) {
    return this.buildDeleteQuery(where);
  }
}

test("paginação usa ROWS <offset+1> TO <offset+limit>", () => {
  const sql = new TestableSql(TestAddressEntity);
  const { sql: query, params } = sql.select({ limit: 10, offset: 20 });

  assert.match(query, /ROWS \? TO \?/);
  assert.deepEqual(params, [21, 30]);
});

test("insert não inclui campo undefined e valida null contra nullable", () => {
  const sql = new TestableSql(TestAddressEntity);

  const { sql: query, params } = sql.insert({ userId: 1, street: "Rua X", city: "Y" });
  const insertClause = query.split(" RETURNING ")[0];

  assert.doesNotMatch(insertClause, /\bstate\b/);
  assert.deepEqual(params, [1, "Rua X", "Y"]);

  assert.throws(
    () => sql.insert({ userId: 1, street: "Rua X", city: null as unknown as string }),
    /não aceita null/,
  );
});

test("update/delete exigem where não vazio", () => {
  const sql = new TestableSql(TestAddressEntity);

  assert.throws(() => sql.update({ city: "X" }, []), /pelo menos uma condição/);
  assert.throws(() => sql.delete([]), /pelo menos uma condição/);
});

test("where com id escalar numa entidade de chave composta lança erro", () => {
  const sql = new TestableSql(TestUserRoleEntity);

  assert.throws(() => sql.delete(1), /chave composta/);
});

test("where com objeto vira condições AND em chave composta", () => {
  const sql = new TestableSql(TestUserRoleEntity);
  const { sql: query, params } = sql.delete({ userId: 1, roleId: 2 });

  assert.match(query, /WHERE us\.user_id = \? AND us\.role_id = \?/);
  assert.deepEqual(params, [1, 2]);
});
