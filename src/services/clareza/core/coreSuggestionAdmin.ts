import type { CoreSuggestionRecord } from './coreSuggestionService'

export interface CoreSuggestionAdminStore {
  list(query: {
    readonly offset: number
    readonly limit: number
    readonly order: 'demand-desc'
  }): Promise<{ readonly total: number; readonly items: readonly CoreSuggestionRecord[] }>
}

export interface CoreSuggestionAdminDependencies {
  readonly authorize: (action: 'read' | 'export') => Promise<void> | void
  readonly store: CoreSuggestionAdminStore
}

export class CoreSuggestionAdminAuthorizationError extends Error {
  readonly code = 'CLAREZA_SUGGESTION_ADMIN_FORBIDDEN'

  constructor() {
    super('suggestion administration is forbidden')
    this.name = 'CoreSuggestionAdminAuthorizationError'
  }
}

const validateLimit = (value: number, maximum: number, label: string): void => {
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new RangeError(`${label} must be between 1 and ${maximum}`)
  }
}

function csvCell(rawValue: string | number): string {
  let value = String(rawValue)
  if (/^[=+\-@\t\r]/.test(value)) value = `'${value}`
  return `"${value.replace(/"/g, '""')}"`
}

export function createCoreSuggestionAdminService(dependencies: CoreSuggestionAdminDependencies) {
  return {
    async list(page: number, pageSize: number) {
      validateLimit(page, Number.MAX_SAFE_INTEGER, 'page')
      validateLimit(pageSize, 100, 'page size')
      await dependencies.authorize('read')
      const result = await dependencies.store.list({
        offset: (page - 1) * pageSize,
        limit: pageSize,
        order: 'demand-desc',
      })
      return { page, pageSize, total: result.total, items: result.items }
    },

    async exportCsv(limit: number): Promise<string> {
      validateLimit(limit, 1000, 'export limit')
      await dependencies.authorize('export')
      const result = await dependencies.store.list({ offset: 0, limit, order: 'demand-desc' })
      const header = ['query', 'count', 'first_requested', 'last_requested', 'status'].map(csvCell).join(',')
      const rows = result.items.map(item => [
        item.query, item.count, item.firstRequestedAt, item.lastRequestedAt, item.status,
      ].map(csvCell).join(','))
      return [header, ...rows].join('\n')
    },
  }
}

export function planLegacySuggestionImport(
  rows: readonly { readonly query: string; readonly count: number }[],
  existingKeys: readonly string[],
  options: { readonly sourceAuthorized: boolean; readonly dryRun: boolean },
) {
  if (!options.sourceAuthorized) throw new CoreSuggestionAdminAuthorizationError()
  if (!options.dryRun) throw new RangeError('legacy suggestion import planner only supports dry-run')
  const existing = new Set(existingKeys.map(key => key.trim().toLocaleUpperCase('pt-PT')))
  const skipped = new Set<string>()
  const planned = new Map<string, { key: string; query: string; count: number }>()
  for (const row of rows) {
    const query = row.query.normalize('NFKC').replace(/\s+/gu, ' ').trim()
    const key = query.toLocaleUpperCase('pt-PT')
    if (!key || [...query].length > 80 || !Number.isInteger(row.count) || row.count < 1) continue
    if (existing.has(key)) {
      skipped.add(key)
      continue
    }
    const previous = planned.get(key)
    planned.set(key, previous
      ? { ...previous, count: previous.count + row.count }
      : { key, query, count: row.count })
  }
  return { dryRun: true as const, skipped: [...skipped], planned: [...planned.values()] }
}
