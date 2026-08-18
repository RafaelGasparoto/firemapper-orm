import type { IncrementType } from "../enums/increment-type.enum";

export interface EntityOptions {
  /** Nome da tabela no banco de dados. */
  name: string;
  /** Nomes de coluna (não propriedades) que compõem a chave primária. */
  primaryKeys: string[];
  /** Prefixo usado como alias da tabela no SQL gerado. Padrão: os 2 primeiros caracteres de `name`. */
  prefix?: string;
  /** Estratégia de geração da chave primária no INSERT. Padrão: `AUTOINCREMENT`, ou `COMPOSITE_KEY` se houver mais de uma `primaryKeys`. */
  incrementType?: IncrementType;
  /** Nome do gerador (sequence) do Firebird — obrigatório quando `incrementType` é `GEN_ID`. */
  generatorName?: string;
}

/** Metadados de uma entidade já resolvidos pelo decorator `@Entity` — `prefix`/`incrementType` sempre definidos. */
export interface EntityMetadata extends EntityOptions {
  prefix: string;
  incrementType: IncrementType;
}
