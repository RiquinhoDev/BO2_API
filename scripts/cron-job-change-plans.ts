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
