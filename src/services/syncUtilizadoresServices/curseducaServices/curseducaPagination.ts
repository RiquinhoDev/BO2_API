import type { CronExecutionPhaseHooks } from '../../cron/scheduler/executionPhases'
import { MAX_PROVIDER_READ_ITEMS } from '../../../security/providerReadBatchPolicy'

export const CURSEDUCA_PROVIDER_PAGE_SIZE = 100
export const CURSEDUCA_PROVIDER_MAX_PAGES = 200
export const CURSEDUCA_PROVIDER_MAX_ITEMS = MAX_PROVIDER_READ_ITEMS

export class CurseducaProviderSafetyError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, message: string, status = 413) {
    super(`${code}: ${message}`)
    this.name = 'CurseducaProviderSafetyError'
    this.code = code
    this.status = status
  }
}

export class CurseducaProviderReadBudget {
  private consumed = 0

  constructor(readonly limit = CURSEDUCA_PROVIDER_MAX_ITEMS) {}

  reserve(count: number, resource: string): void {
    if (!Number.isSafeInteger(count) || count < 0 || this.consumed + count > this.limit) {
      throw new CurseducaProviderSafetyError(
        'CURSEDUCA_PROVIDER_ITEM_LIMIT_EXCEEDED',
        `${resource} excede ${this.limit} itens`,
      )
    }
    this.consumed += count
  }

  get consumedItems(): number {
    return this.consumed
  }
}

type PageMeta = {
  hasMore?: boolean
  nextCursor?: string
  total?: number
  explicitContinuation: boolean
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
)

const asOptionalString = (value: unknown): string | undefined => (
  typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
)

const equalAliasValues = (values: unknown[]): boolean => values.every(value => Object.is(value, values[0]))

const containerKeys = ['data', 'groups', 'members', 'items', 'results'] as const
const metadataKeys = ['metadata', 'meta', 'pagination', 'page_info', 'pageInfo'] as const

function readEnvelope<T>(payload: unknown, resource: string): { items: T[]; meta: PageMeta } {
  if (Array.isArray(payload)) return { items: payload as T[], meta: { explicitContinuation: false } }
  if (!isRecord(payload)) {
    throw new CurseducaProviderSafetyError('CURSEDUCA_PROVIDER_ENVELOPE_INVALID', `${resource} envelope inválido`)
  }

  const presentContainers = containerKeys.filter(key => Object.prototype.hasOwnProperty.call(payload, key))
  if (presentContainers.length !== 1 || !Array.isArray(payload[presentContainers[0]])) {
    throw new CurseducaProviderSafetyError('CURSEDUCA_PROVIDER_ENVELOPE_INVALID', `${resource} container inválido`)
  }

  const metadata = metadataKeys
    .filter(key => Object.prototype.hasOwnProperty.call(payload, key))
    .map(key => payload[key])
  if (metadata.length > 1 && !metadata.every(isRecord)) {
    throw new CurseducaProviderSafetyError('CURSEDUCA_PROVIDER_PAGINATION_CONFLICT', `${resource} metadata contraditória`)
  }
  if (metadata.length > 1) {
    const canonical = JSON.stringify(metadata[0])
    if (!metadata.every(item => JSON.stringify(item) === canonical)) {
      throw new CurseducaProviderSafetyError('CURSEDUCA_PROVIDER_PAGINATION_CONFLICT', `${resource} metadata contraditória`)
    }
  }
  const metadataSources = metadata.filter(isRecord)
  const metaSources = [payload, ...metadataSources]
  const valuesFor = (aliases: string[]): unknown[] => metaSources.flatMap(source => aliases
    .filter(key => Object.prototype.hasOwnProperty.call(source, key))
    .map(key => source[key]))

  const hasMoreAliases = ['hasMore', 'hasmore', 'has_more']
    .flatMap(alias => valuesFor([alias]))
  if (hasMoreAliases.some(value => typeof value !== 'boolean')
    || (hasMoreAliases.length > 1 && !equalAliasValues(hasMoreAliases))) {
    throw new CurseducaProviderSafetyError('CURSEDUCA_PROVIDER_PAGINATION_CONFLICT', `${resource} hasMore contraditório`)
  }

  const cursorAliases = ['nextCursor', 'next_cursor', 'cursor', 'next']
    .flatMap(alias => valuesFor([alias]))
  if (cursorAliases.some(value => value !== null && typeof value !== 'string')
    || (cursorAliases.length > 1 && !equalAliasValues(cursorAliases))) {
    throw new CurseducaProviderSafetyError('CURSEDUCA_PROVIDER_PAGINATION_CONFLICT', `${resource} cursor contraditório`)
  }

  const totalAliases = ['totalCount', 'total_count', 'total', 'count']
    .flatMap(alias => valuesFor([alias]))
  if (totalAliases.some(value => typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    || (totalAliases.length > 1 && !equalAliasValues(totalAliases))) {
    throw new CurseducaProviderSafetyError('CURSEDUCA_PROVIDER_PAGINATION_CONFLICT', `${resource} total contraditório`)
  }

  const hasMore = hasMoreAliases.length > 0 ? hasMoreAliases[0] as boolean : undefined
  const nextCursor = cursorAliases.length > 0 ? asOptionalString(cursorAliases[0]) : undefined
  if (hasMore === false && nextCursor) {
    throw new CurseducaProviderSafetyError('CURSEDUCA_PROVIDER_PAGINATION_CONFLICT', `${resource} continua após hasMore=false`)
  }
  return {
    items: payload[presentContainers[0]] as T[],
    meta: {
      hasMore,
      nextCursor,
      total: totalAliases.length > 0 ? totalAliases[0] as number : undefined,
      explicitContinuation: hasMore !== undefined || cursorAliases.length > 0,
    },
  }
}

export interface CurseducaPageRequest<T> {
  resource: string
  request(params: Record<string, unknown>): Promise<unknown>
  identityOf?: (item: T) => string | undefined
  baseParams?: Record<string, unknown>
  phaseHooks?: CronExecutionPhaseHooks
  budget?: CurseducaProviderReadBudget
  retries?: number
}

export async function fetchCurseducaPages<T>({
  resource,
  request,
  identityOf,
  baseParams = {},
  phaseHooks,
  budget,
  retries = 1,
}: CurseducaPageRequest<T>): Promise<T[]> {
  const aggregate: T[] = []
  const seenIdentities = new Set<string>()
  const seenCursors = new Set<string>()
  let offset = 0
  let cursor: string | undefined

  for (let page = 0; page < CURSEDUCA_PROVIDER_MAX_PAGES; page++) {
    let parsed: { items: T[]; meta: PageMeta } | undefined
    let lastError: unknown
    for (let attempt = 0; attempt < Math.max(1, retries); attempt++) {
      try {
        phaseHooks?.providerStarted()
        const payload = await request({
          ...baseParams,
          limit: CURSEDUCA_PROVIDER_PAGE_SIZE,
          ...(cursor ? { cursor } : { offset }),
        })
        parsed = readEnvelope<T>(payload, resource)
        phaseHooks?.providerSucceeded()
        break
      } catch (error: unknown) {
        if (error instanceof CurseducaProviderSafetyError
          || error instanceof Error && error.name === 'ActiveCampaignExecutionOwnershipError') throw error
        lastError = error
      }
    }
    if (!parsed) {
      if (lastError instanceof CurseducaProviderSafetyError) throw lastError
      throw new CurseducaProviderSafetyError('CURSEDUCA_PROVIDER_READ_FAILED', `${resource} não disponível`, 502)
    }

    const { items, meta } = parsed
    if (items.length > CURSEDUCA_PROVIDER_PAGE_SIZE) {
      throw new CurseducaProviderSafetyError('CURSEDUCA_PROVIDER_PAGE_SIZE_EXCEEDED', `${resource} excede ${CURSEDUCA_PROVIDER_PAGE_SIZE} itens`)
    }
    if (aggregate.length + items.length > CURSEDUCA_PROVIDER_MAX_ITEMS) {
      throw new CurseducaProviderSafetyError('CURSEDUCA_PROVIDER_ITEM_LIMIT_EXCEEDED', `${resource} excede ${CURSEDUCA_PROVIDER_MAX_ITEMS} itens`)
    }
    budget?.reserve(items.length, resource)
    for (const item of items) {
      if (!identityOf) continue
      const identity = identityOf(item)
      if (!identity) {
        throw new CurseducaProviderSafetyError('CURSEDUCA_PROVIDER_IDENTITY_INVALID', `${resource} sem identidade estável`)
      }
      if (seenIdentities.has(identity)) {
        throw new CurseducaProviderSafetyError('CURSEDUCA_PROVIDER_IDENTITY_REPEATED', `${resource} identidade repetida`)
      }
      seenIdentities.add(identity)
    }
    aggregate.push(...items)

    if (meta.total !== undefined && meta.total > CURSEDUCA_PROVIDER_MAX_ITEMS) {
      throw new CurseducaProviderSafetyError('CURSEDUCA_PROVIDER_ITEM_LIMIT_EXCEEDED', `${resource} total excede ${CURSEDUCA_PROVIDER_MAX_ITEMS}`)
    }
    if (meta.total !== undefined && aggregate.length > meta.total) {
      throw new CurseducaProviderSafetyError('CURSEDUCA_PROVIDER_PAGINATION_INVALID', `${resource} total contradiz itens recebidos`)
    }
    const inferredMore = items.length === CURSEDUCA_PROVIDER_PAGE_SIZE
      && (meta.total === undefined || aggregate.length < meta.total)
    const hasMore = meta.hasMore ?? inferredMore
    if (items.length === 0 && hasMore) {
      throw new CurseducaProviderSafetyError('CURSEDUCA_PROVIDER_PAGINATION_INVALID', `${resource} continua sem itens`)
    }
    if (!hasMore) {
      if (meta.total !== undefined && aggregate.length !== meta.total) {
        throw new CurseducaProviderSafetyError('CURSEDUCA_PROVIDER_PAGINATION_INVALID', `${resource} total não corresponde aos itens recebidos`)
      }
      return aggregate
    }
    if (meta.nextCursor) {
      if (seenCursors.has(meta.nextCursor)) {
        throw new CurseducaProviderSafetyError('CURSEDUCA_PROVIDER_CURSOR_REPEATED', `${resource} cursor repetido`)
      }
      seenCursors.add(meta.nextCursor)
      cursor = meta.nextCursor
    } else if (cursor && meta.hasMore === true) {
      throw new CurseducaProviderSafetyError('CURSEDUCA_PROVIDER_PAGINATION_INVALID', `${resource} continua sem cursor`)
    } else if (meta.explicitContinuation && meta.hasMore === true) {
      offset += CURSEDUCA_PROVIDER_PAGE_SIZE
    } else {
      offset += CURSEDUCA_PROVIDER_PAGE_SIZE
    }
  }

  throw new CurseducaProviderSafetyError('CURSEDUCA_PROVIDER_PAGE_LIMIT_EXCEEDED', `${resource} excede ${CURSEDUCA_PROVIDER_MAX_PAGES} páginas`)
}
