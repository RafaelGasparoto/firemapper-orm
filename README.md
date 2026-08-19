# firemapper-orm

ORM para Firebird baseado em decorators, construído sobre o [node-firebird](https://github.com/hgourvest/node-firebird).

## Instalação

```bash
npm install firemapper-orm
```

## Configuração

Copie `.env.example` para `.env` e ajuste os valores:

```bash
cp .env.example .env
```

| Variável                  | Obrigatória | Padrão      | Descrição                                                                                               |
| ------------------------- | ----------- | ----------- | ------------------------------------------------------------------------------------------------------- |
| `FIREBIRD_DATABASE`       | Sim*        | —           | Caminho do `.fdb` **resolvido pelo servidor**, não pelo cliente (ex: `/var/lib/firebird/data/app.fdb`). |
| `FIREBIRD_HOST`           | Não         | `127.0.0.1` | Host do servidor.                                                                                       |
| `FIREBIRD_PORT`           | Não         | `3050`      | Porta do servidor.                                                                                      |
| `FIREBIRD_USER`           | Não         | `SYSDBA`    | Usuário de conexão (`ISC_USER` também é aceito).                                                        |
| `FIREBIRD_PASSWORD`       | Não         | `masterkey` | Senha do usuário.                                                                                       |
| `FIREBIRD_ROLE`           | Não         | —           | Role SQL, se necessário.                                                                                |
| `FIREBIRD_ENCODING`       | Não         | `UTF8`      | Charset da conexão.                                                                                     |
| `FIREBIRD_LOWERCASE_KEYS` | Não         | `false`     | `"true"` para colunas em minúsculas.                                                                    |
| `FIREBIRD_POOL_SIZE`      | Não         | `5`         | Máximo de conexões simultâneas.                                                                         |
| `DATABASE_URL`            | Não         | —           | `firebird://user:pass@host:port/database`, substitui as variáveis acima.                                |

\* Obrigatória a menos que `DATABASE_URL` seja informada.

O pacote não carrega o `.env` sozinho: a aplicação que o usa deve fazer `import "dotenv/config"` antes de qualquer outro import.

## Banco local com Docker

```bash
docker compose up -d
```

Sobe um Firebird 5. `FIREBIRD_DATABASE_FILE` define o nome do arquivo criado (padrão `firemapper.fdb`); `FIREBIRD_EXTRA_USER`/`FIREBIRD_EXTRA_PASSWORD` criam um usuário além do SYSDBA.

## Entidades

```ts
import { Entity, Column } from "firemapper-orm";

@Entity({ name: "users", primaryKeys: ["id"] })
class UserEntity {
  @Column({ name: "id" })
  id!: number;

  @Column({ name: "name" })
  name!: string;

  @Column({ name: "active", type: "string-boolean" })
  active!: boolean; // no banco é CHAR(1) 'S'/'N' (ou 'Y'/'N'); aqui é boolean de verdade
}
```

`@Entity`:

| Opção           | Descrição                                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `name`          | Nome da tabela.                                                                                                           |
| `primaryKeys`   | Nomes de **coluna** (não propriedade) da chave primária. Mais de uma = chave composta.                                    |
| `prefix`        | Alias da tabela no SQL. Padrão: 2 primeiras letras de `name`.                                                             |
| `incrementType` | `AUTOINCREMENT` (padrão), `GEN_ID`, `MAX_ID`, `NONE` ou `COMPOSITE_KEY` (automático quando há mais de uma `primaryKeys`). |
| `generatorName` | Nome do gerador Firebird, obrigatório com `incrementType: GEN_ID`.                                                        |

`@Column`:

| Opção      | Descrição                                                                                                                                                |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`     | Nome da coluna.                                                                                                                                          |
| `alias`    | Alias no SQL gerado. Padrão: nome da propriedade.                                                                                                        |
| `type`     | `string`, `number`, `date`, `timestamp`, `boolean`, `string-boolean`. Se omitido, é inferido do tipo TS (só funciona com build via `tsc`, não no `tsx`). |
| `nullable` | Se a coluna aceita `NULL`. Padrão `false`: `insert`/`update` rejeitam `null` explícito nela.                                                             |

## Relacionamentos

```ts
import { Entity, Column, BelongsTo, HasOne, HasMany } from "firemapper-orm";

@Entity({ name: "addresses", primaryKeys: ["id"] })
class AddressEntity {
  @Column({ name: "id" }) id!: number;
  @Column({ name: "user_id" }) userId!: number;

  @BelongsTo(() => UserEntity, "userId")
  user!: UserEntity;
}

@Entity({ name: "users", primaryKeys: ["id"] })
class UserEntity {
  @Column({ name: "id" }) id!: number;

  @HasOne(() => ProfileEntity, "userId")
  profile!: ProfileEntity;

  @HasMany(() => AddressEntity, "userId")
  addresses!: AddressEntity[];
}
```

- **`@BelongsTo(target, foreignKey, ownerKey?)`**: a FK está nesta entidade. Resolvido via `JOIN`, já vem populado em `findAll`/`findOne`.
- **`@HasOne(target, foreignKey, localKey?)`**: a FK está na entidade relacionada. Também via `JOIN`, também já vem populado.
- **`@HasMany(target, foreignKey, localKey?)`**: coleção. **Não** vem populada por padrão (um `JOIN` duplicaria a entidade dona por item da coleção). Fica `[]` até você chamar `load`:

```ts
const users = await userRepository.findAll();
await userRepository.load(users, "addresses"); // 2ª query, agrupa por usuário

// ou tudo de uma vez:
const users = await userRepository.findAllWithRelations(); // findAll + load de todo @HasMany
```

Campos de relacionamento são referenciados como `"relacao.campo"` em `where`/`orderBy`/`select` (ex: `{ field: "user.name", value: "Ana" }`).

## Repositório

```ts
import { AbstractRepository } from "firemapper-orm";

class UserRepository extends AbstractRepository<UserEntity> {
  constructor() {
    super(UserEntity);
  }
}

const users = new UserRepository();
```

| Método                                | Descrição                                                                                                                                                                    |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `findAll(options?, tx?)`              | Lista com filtro/ordenação/paginação/seleção de campos.                                                                                                                      |
| `findOne(where, options?, tx?)`       | Primeiro registro que bater com `where`, ou `null`.                                                                                                                          |
| `findById(id, tx?)`                   | Atalho: `findOne(id)`.                                                                                                                                                       |
| `findAllWithRelations(options?, tx?)` | `findAll` + carrega todo `@HasMany` declarado. Não é o padrão do `findAll`, é opt-in.                                                                                        |
| `load(entities, "propriedade", tx?)`  | Carrega um `@HasMany` específico pra um conjunto de entidades já buscadas.                                                                                                   |
| `loadAll(entities, tx?)`              | Carrega todos os `@HasMany` declarados pra um conjunto de entidades.                                                                                                         |
| `findBySql(sql, params?, tx?)`        | SQL escrita na mão, mapeada pra instâncias. Serve pra queries que `findAll` não monta (subquery, GROUP BY...). Aliases das colunas precisam bater com os que `findAll` gera. |
| `insert(entity, tx?)`                 | Insere e devolve a entidade com o que o banco preencheu (id, defaults).                                                                                                      |
| `update(entity, where, tx?)`          | Atualiza e devolve as linhas afetadas já mapeadas.                                                                                                                           |
| `delete(where, tx?)`                  | Apaga e devolve as linhas removidas já mapeadas.                                                                                                                             |

`entity` em `insert`/`update` é sempre parcial: propriedade `undefined` fica de fora da query (o banco decide o valor); `null` explícito grava `NULL`, mas só se a coluna for `nullable`, senão lança erro antes de ir pro banco.

`where` em `findOne`/`update`/`delete` aceita três formatos:

```ts
users.update({ name: "Ana" }, 5); // id (só chave simples)
users.update({ name: "Ana" }, { userId: 1, roleId: 2 }); // objeto, obrigatório em chave composta
users.update({ name: "Ana" }, [{ field: "email", value: "a@b.com" }]); // lista de condições
```

### `where` do `findAll`/`findOne`

```ts
await users.findAll({
  where: [
    { field: "name", operator: "CONTAINING", value: "Ana" },
    {
      or: [
        { field: "active", value: true },
        { field: "role", value: "admin" },
      ],
    },
  ],
  orderBy: "name",
  orderDirection: "DESC",
  limit: 10,
  offset: 20,
  select: ["id", "name"],
});
```

Operadores: `=` `<>` `>` `<` `>=` `<=` `IS NULL` `IS NOT NULL` `CONTAINING` `LIKE` `BETWEEN` `IN` (padrão `=`). Itens de um array são unidos com `AND`; agrupe com `{ and: [...] }`/`{ or: [...] }`.

## Transações

Todo método aceita uma `transaction` opcional. Sem ela, o repositório abre e fecha uma sozinha (commit automático no sucesso, rollback automático em erro):

```ts
import { runInTransaction } from "firemapper-orm";

// cada chamada abre/fecha a própria transação
const user = await users.insert({ name: "Ana", email: "ana@x.com" });

// ou compartilhando uma transação entre várias operações
await runInTransaction(async (tx) => {
  const user = await users.insert({ name: "Ana", email: "ana@x.com" }, tx);
  await addresses.insert({ userId: user.id, city: "Curitiba" }, tx);
});
```

## Testes

```bash
docker compose up -d   # precisa do banco de pé
npm test
```

`npm run build` compila `src/` pra `dist/`; `test/` e `src/examples/` nunca entram no build nem no pacote.
