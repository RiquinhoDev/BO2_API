export type JobRecord = Record<string, unknown> & {
  _id: unknown
  name: string
}

export type DisableTagRulesSyncPlan =
  | {
      action: 'disable'
      before: JobRecord & { isActive: boolean }
      after: JobRecord & { isActive: false }
      filter: { _id: unknown; name: 'TAG_RULES_SYNC'; isActive: true }
      update: { $set: { isActive: false } }
    }
  | {
      action: 'already-disabled'
      before: JobRecord & { isActive: false }
      after: JobRecord & { isActive: false }
    }

export type RenameProductionJobPlan =
  | {
      action: 'rename'
      before: JobRecord
      after: JobRecord
      filter: { _id: unknown; name: string }
      update: { $set: { name: string } }
    }
  | {
      action: 'already-renamed'
      before: JobRecord
      after: JobRecord
    }

export function planDisableTagRulesSync(records: JobRecord[]): DisableTagRulesSyncPlan {
  if (records.length !== 1) {
    throw new Error(`Estado inesperado: esperado exactamente um TAG_RULES_SYNC, encontrados ${records.length}.`)
  }

  const record = records[0] as JobRecord & { isActive: unknown }
  if (typeof record.isActive !== 'boolean') {
    throw new Error('Estado inesperado: TAG_RULES_SYNC.isActive não é booleano.')
  }

  if (!record.isActive) {
    return { action: 'already-disabled', before: record as JobRecord & { isActive: false }, after: record as JobRecord & { isActive: false } }
  }

  return {
    action: 'disable',
    before: record as JobRecord & { isActive: boolean },
    after: { ...record, isActive: false },
    filter: { _id: record._id, name: 'TAG_RULES_SYNC', isActive: true },
    update: { $set: { isActive: false } },
  }
}

export const productionJobRenames = [
  { from: 'TEST_CURSEDUCA_4MIN', to: 'CursEducaSync' },
  { from: '1º', to: 'HotmartSync' },
] as const

function exactlyOne(records: JobRecord[], name: string): JobRecord | undefined {
  if (records.length > 1) {
    throw new Error(`Estado inesperado: nome de job duplicado: ${name}.`)
  }
  return records[0]
}

export function planRenameProductionJobs(records: JobRecord[]): RenameProductionJobPlan[] {
  return productionJobRenames.map(({ from, to }) => {
    const source = exactlyOne(records.filter(record => record.name === from), from)
    const destination = exactlyOne(records.filter(record => record.name === to), to)

    if (source && destination) {
      throw new Error(`Estado inesperado: colisão entre ${from} e ${to}; nada será alterado.`)
    }
    if (destination) {
      return { action: 'already-renamed', before: destination, after: destination }
    }
    if (!source) {
      throw new Error(`Estado inesperado: job ${from} não encontrado e destino ${to} também não encontrado.`)
    }

    return {
      action: 'rename',
      before: source,
      after: { ...source, name: to },
      filter: { _id: source._id, name: from },
      update: { $set: { name: to } },
    }
  })
}
