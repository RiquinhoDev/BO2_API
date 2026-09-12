// Os tetos contratados. Sem eles o painel mostra volume; com eles mostra
// "estamos a 62% do que podemos gastar", que e a pergunta que a chefia faz.
//
// Sao numeros de contrato, nao de codigo: mudam quando se muda de plano, e por
// isso vivem em ambiente. Um teto por preencher nao e erro — a metrica aparece
// na mesma, apenas sem percentagem.

import { parseBoundedInteger } from '../../config/appConfig'

const GIGABYTE = 1024 ** 3
const MEGABYTE = 1024 ** 2

export interface CapacityCeilings {
  /** Chamadas/dia do plano FMP. */
  readonly fmpCallsPerDay: number | null
  /** Memoria contratada no Redis, em bytes. */
  readonly redisMemoryBytes: number | null
  /** Espaco contratado na Mongo, em bytes. */
  readonly mongoStorageBytes: number | null
  /** Orcamento mensal para o Railway, em USD. */
  readonly railwayMonthlyBudgetUsd: number | null
  /** Memoria do container onde a API corre, em bytes. */
  readonly serviceMemoryBytes: number | null
}

function optionalInteger(
  env: NodeJS.ProcessEnv,
  name: string,
  max: number,
): number | null {
  const raw = env[name]
  if (raw === undefined || raw.trim() === '') return null
  return parseBoundedInteger(raw, name, { min: 1, max, defaultValue: 1 })
}

export function loadCapacityCeilings(
  env: NodeJS.ProcessEnv = process.env,
): CapacityCeilings {
  const redisMemoryMb = optionalInteger(env, 'REDIS_PLAN_MEMORY_MB', 1_048_576)
  // Em MB, porque os planos pequenos nao chegam a 1 GB: o Atlas M0 sao 512 MB e
  // em GB inteiros nao havia forma de os escrever. A variante em GB fica para
  // planos grandes, onde escrever megabytes seria absurdo.
  const mongoStorageMb = optionalInteger(env, 'MONGO_PLAN_STORAGE_MB', 100_000_000)
  const mongoStorageGb = optionalInteger(env, 'MONGO_PLAN_STORAGE_GB', 100_000)
  const serviceMemoryGb = optionalInteger(env, 'RAILWAY_SERVICE_MEMORY_GB', 1_024)

  return {
    fmpCallsPerDay: optionalInteger(env, 'FMP_PLAN_CALLS_PER_DAY', 100_000_000),
    redisMemoryBytes: redisMemoryMb === null ? null : redisMemoryMb * MEGABYTE,
    mongoStorageBytes: mongoStorageMb !== null
      ? mongoStorageMb * MEGABYTE
      : mongoStorageGb === null ? null : mongoStorageGb * GIGABYTE,
    railwayMonthlyBudgetUsd: optionalInteger(env, 'RAILWAY_MONTHLY_BUDGET_USD', 1_000_000),
    serviceMemoryBytes: serviceMemoryGb === null ? null : serviceMemoryGb * GIGABYTE,
  }
}
