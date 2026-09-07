import User from '../../../models/user'
import { Product, UserProduct } from '../../../models'
import { Class } from '../../../models/Class'
import UserSnapshot from '../../../models/UserSnapshot'
import type { UniversalSourceItem } from '../../../types/universalSync.types'
import type { HotmartSyncPlan } from '../../../types/cron.types'
import type { CronExecutionPhaseHooks } from '../../cron/scheduler/executionPhases'
import { HotmartExpirationPolicy } from './hotmartExpiration'
import { toDateOrNull } from './fieldUtils'

export const HOTMART_SYNC_LIMIT = 20_000

export interface HotmartExecutionPlan {
  sourceKeys: string[]
  usersByEmail: Record<string, Record<string, unknown> | null>
  products: Record<string, unknown>[]
  classes: Record<string, unknown>[]
  userProducts: Record<string, unknown>[]
  snapshots: Record<string, unknown>[]
  reactivationTargetsByUser: Record<string, number>
  renewalTargetsByUser: Record<string, number>
  projectedEffects: number
  consumedEffects: number
  consumeMutation(count?: number): void
}

const executionClock = { now: () => new Date() }
const expirationPolicy = new HotmartExpirationPolicy(executionClock)

export function governHotmartExecution(
  plan: HotmartExecutionPlan,
  hooks?: CronExecutionPhaseHooks,
): CronExecutionPhaseHooks | undefined {
  if (!hooks) return undefined
  return {
    ...hooks,
    consumeMutation: (count = 1) => plan.consumeMutation(count),
  }
}

const safetyError = (code: string, message: string, status = 422): Error => {
  const error = new Error(`${code}: ${message}`)
  Object.assign(error, { code, status })
  return error
}

const boundedCollectionRead = async (
  model: unknown,
  query: unknown,
  projection: Record<string, number>,
): Promise<unknown[]> => {
  const collection = (model as { collection: { find: (query: never, options?: never) => { sort: (value: never) => { limit: (value: number) => { toArray: () => Promise<unknown[]> } } } } }).collection
  return collection.find(query as never, { projection } as never).sort({ _id: 1 } as never).limit(HOTMART_SYNC_LIMIT + 1).toArray()
}

const normalizeKey = (value: unknown): string => String(value ?? '').trim().toLowerCase()

const documentId = (value: Record<string, unknown>): string => String(value._id ?? '')

const stableValue = (value: unknown): unknown => {
  if (value === null || typeof value !== 'object') return value
  if (value instanceof Date) return value.toISOString()
  if ('_bsontype' in value) return String(value)
  if (Array.isArray(value)) return value.map(stableValue)
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, stableValue(nested)]),
  )
}

export const hotmartUserFingerprint = (value: unknown): string => {
  const source = typeof value === 'object' && value !== null && 'toObject' in value
    && typeof (value as { toObject?: unknown }).toObject === 'function'
    ? (value as { toObject: () => unknown }).toObject()
    : value
  const user = (source && typeof source === 'object' ? source : {}) as Record<string, unknown>
  const hotmart = (user.hotmart && typeof user.hotmart === 'object' ? user.hotmart : {}) as Record<string, unknown>
  const curseduca = (user.curseduca && typeof user.curseduca === 'object' ? user.curseduca : {}) as Record<string, unknown>
  const combined = (user.combined && typeof user.combined === 'object' ? user.combined : {}) as Record<string, unknown>
  const inactivation = (user.inactivation && typeof user.inactivation === 'object' ? user.inactivation : {}) as Record<string, unknown>
  return JSON.stringify(stableValue({
    _id: user._id,
    email: user.email,
    name: user.name,
    classId: user.classId,
    hotmartEnrolledClasses: hotmart.enrolledClasses,
    curseducaEnrolledClasses: curseduca.enrolledClasses,
    combinedStatus: combined.status,
    manuallyInactivated: inactivation.isManuallyInactivated,
  }))
}

export const assertHotmartUserMatchesPlan = (
  plannedUser: Record<string, unknown> | null,
  currentUser: unknown,
): void => {
  if ((plannedUser === null) !== (currentUser === null)) {
    throw new Error('HOTMART_SYNC_PLAN_CONCURRENCY_CONFLICT')
  }
  if (!plannedUser || !currentUser) return
  if (String(plannedUser._id ?? '') !== String((currentUser as { _id?: unknown })._id ?? '')) {
    throw new Error('HOTMART_SYNC_PLAN_CONCURRENCY_CONFLICT')
  }
  if (hotmartUserFingerprint(plannedUser) !== hotmartUserFingerprint(currentUser)) {
    throw new Error('HOTMART_SYNC_PLAN_CONCURRENCY_CONFLICT')
  }
}

export const hotmartUserOptimisticFilter = (plannedUser: Record<string, unknown> | null): Record<string, unknown> => {
  if (!plannedUser) return {}
  const filter: Record<string, unknown> = { _id: plannedUser._id }
  const assignIfPresent = (key: string, value: unknown) => {
    if (value !== undefined) filter[key] = value
  }
  const hotmart = (plannedUser.hotmart && typeof plannedUser.hotmart === 'object' ? plannedUser.hotmart : {}) as Record<string, unknown>
  const curseduca = (plannedUser.curseduca && typeof plannedUser.curseduca === 'object' ? plannedUser.curseduca : {}) as Record<string, unknown>
  const combined = (plannedUser.combined && typeof plannedUser.combined === 'object' ? plannedUser.combined : {}) as Record<string, unknown>
  const inactivation = (plannedUser.inactivation && typeof plannedUser.inactivation === 'object' ? plannedUser.inactivation : {}) as Record<string, unknown>
  const metadata = (plannedUser.metadata && typeof plannedUser.metadata === 'object' ? plannedUser.metadata : {}) as Record<string, unknown>
  assignIfPresent('email', plannedUser.email)
  assignIfPresent('name', plannedUser.name)
  assignIfPresent('classId', plannedUser.classId)
  assignIfPresent('hotmart.enrolledClasses', hotmart.enrolledClasses)
  assignIfPresent('curseduca.enrolledClasses', curseduca.enrolledClasses)
  assignIfPresent('combined.status', combined.status)
  assignIfPresent('inactivation.isManuallyInactivated', inactivation.isManuallyInactivated)
  assignIfPresent('metadata.updatedAt', metadata.updatedAt)
  return filter
}

const assertBoundedRows = (rows: unknown[], code: string): unknown[] => {
  if (rows.length > HOTMART_SYNC_LIMIT) {
    throw safetyError(code, `leitura local excede ${HOTMART_SYNC_LIMIT} itens`, 413)
  }
  return rows
}

const identityOf = (item: UniversalSourceItem): string => {
  const values = [item.hotmartUserId, item.id, item.userId]
    .filter(value => typeof value === 'string' && value.trim() !== '')
    .map(value => (value as string).trim())
  if (new Set(values).size > 1) throw safetyError('HOTMART_SYNC_IDENTITY_CONFLICT', 'identidades contraditórias')
  const email = typeof item.email === 'string' ? item.email.trim().toLowerCase() : ''
  if (values.length === 0 && !email) throw safetyError('HOTMART_SYNC_IDENTITY_INVALID', 'item sem identidade estável')
  return values[0] ?? email
}

const normalizeSource = (sourceData: UniversalSourceItem | UniversalSourceItem[]): UniversalSourceItem[] => {
  const source = Array.isArray(sourceData) ? sourceData : [sourceData]
  if (source.length > HOTMART_SYNC_LIMIT) {
    throw safetyError('HOTMART_SYNC_ITEM_LIMIT_EXCEEDED', `limite de ${HOTMART_SYNC_LIMIT} itens excedido`, 413)
  }
  const seen = new Set<string>()
  const seenEmails = new Set<string>()
  return source.map(item => {
    if (typeof item !== 'object' || item === null) throw safetyError('HOTMART_SYNC_ITEM_INVALID', 'item inválido')
    const identity = identityOf(item)
    if (seen.has(identity)) throw safetyError('HOTMART_SYNC_DUPLICATE_IDENTITY', `identidade repetida: ${identity}`)
    seen.add(identity)
    if (typeof item.email !== 'string' || item.email.trim() === '') {
      throw safetyError('HOTMART_SYNC_EMAIL_INVALID', 'email obrigatório')
    }
    const email = item.email.trim().toLowerCase()
    if (seenEmails.has(email)) throw safetyError('HOTMART_SYNC_DUPLICATE_IDENTITY', `email repetido: ${email}`)
    seenEmails.add(email)
    return { ...item, email }
  })
}

export async function prepareHotmartSync(
  sourceData: UniversalSourceItem | UniversalSourceItem[],
  dryRun: boolean,
  requestedBatchSize = 50,
): Promise<{ sourceData: UniversalSourceItem[]; plan: HotmartSyncPlan; executionPlan: HotmartExecutionPlan }> {
  const source = normalizeSource(sourceData)
  const batchSize = Number.isSafeInteger(requestedBatchSize) && requestedBatchSize > 0
    ? requestedBatchSize
    : 50
  if (source.length === 0) {
    const executionPlan = createExecutionPlan([], [], [], [], [], [], 8)
    return {
      sourceData: source,
      plan: { operation: 'hotmart-sync', dryRun, truncated: false, anomaly: false, limit: HOTMART_SYNC_LIMIT, total: 0, inserted: 0, updated: 0, errors: 0, skipped: 0, remaining: 0 },
      executionPlan,
    }
  }
  const emails = source.map(item => item.email as string)
  const existing = assertBoundedRows(await boundedCollectionRead(
    User,
    { email: { $in: emails } },
    { _id: 1, email: 1, name: 1, classId: 1, hotmart: 1, curseduca: 1, status: 1, inactivation: 1, combined: 1, metadata: 1 },
  ), 'HOTMART_SYNC_LOCAL_LIMIT_EXCEEDED') as Record<string, unknown>[]
  const existingEmails = new Set(existing.map(item => normalizeKey(item.email)))
  const updated = source.filter(item => existingEmails.has(item.email as string)).length

  const classIds = [...new Set(source.map(item => item.classId).filter((value): value is string => typeof value === 'string' && value.trim() !== ''))]
  const productCodes = [...new Set(source.map(item => item.productCode || 'OGI_V1'))]
  const existingIds = existing
    .map(item => documentId(item))
    .filter(Boolean)

  // Every source item can write a User (create + canonical update), one
  // UserProduct, one snapshot and two UserHistory records. Class writes and
  // class-history writes are per source item, not per distinct class: the
  // executor reconciles Class for every item. Report/history writes are
  // counted with the actual configured batch size.
  const batchCount = Math.ceil(source.length / batchSize)
  const reportEffects = 8 + batchCount
  const itemEffects = source.length * 6
  const classEffects = source.filter(item => typeof item.classId === 'string' && item.classId.trim() !== '').length
  const classHistoryEffects = source.filter(item => typeof item.classId === 'string' && item.classId.trim() !== '').length
  const reactivationUserEffects = source.reduce((count, item) => {
    const current = existing.find(row => normalizeKey(row.email) === normalizeKey(item.email))
    const combined = current?.combined
    const currentStatus = typeof combined === 'object' && combined !== null && 'status' in combined
      ? (combined as { status?: unknown }).status
      : undefined
    if (currentStatus !== 'INACTIVE') return count

    const purchaseDate = toDateOrNull(item.purchaseDate)
    const hasExecutableEvidence = expirationPolicy.evaluate(purchaseDate, item.className).canEvaluate
    return hasExecutableEvidence && !expirationPolicy.evaluate(purchaseDate, item.className).isExpired
      // The canonical User update is already part of the six per-item writes;
      // renewal adds one updateMany operation, with affected rows counted
      // separately from this fixed cost.
      ? count + 1
      : count
  }, 0)
  const minimumProjectedMutations = reportEffects + itemEffects + classEffects + classHistoryEffects + reactivationUserEffects
  if (minimumProjectedMutations > HOTMART_SYNC_LIMIT) {
    throw safetyError(
      'HOTMART_SYNC_EFFECTIVE_MUTATION_LIMIT_EXCEEDED',
      `efeitos projectados excedem ${HOTMART_SYNC_LIMIT}`,
      413,
    )
  }

  // These are the executable local snapshots. Live execution consumes them for
  // scoped product/class lookups and optimistic identity checks; no sentinel
  // read is performed only to be discarded.
  const products = assertBoundedRows(await boundedCollectionRead(
    Product,
    { platform: 'hotmart', code: { $in: productCodes }, isActive: true },
    { _id: 1, code: 1, platform: 1, name: 1, platformData: 1 },
  ), 'HOTMART_SYNC_PRODUCT_READ_LIMIT_EXCEEDED') as Record<string, unknown>[]
  const classes = classIds.length === 0 ? [] : assertBoundedRows(await boundedCollectionRead(
    Class,
    { classId: { $in: classIds } },
    { _id: 1, classId: 1, name: 1, updatedAt: 1 },
  ), 'HOTMART_SYNC_CLASS_READ_LIMIT_EXCEEDED') as Record<string, unknown>[]
  const userProducts = existingIds.length === 0 ? [] : assertBoundedRows(await boundedCollectionRead(
    UserProduct,
    { userId: { $in: existingIds } },
    { _id: 1, userId: 1, productId: 1, status: 1, platform: 1, progress: 1, engagement: 1, classes: 1, isPrimary: 1, enrolledAt: 1, updatedAt: 1 },
  ), 'HOTMART_SYNC_USER_PRODUCT_READ_LIMIT_EXCEEDED') as Record<string, unknown>[]
  const snapshots = existingIds.length === 0 ? [] : assertBoundedRows(await boundedCollectionRead(
    UserSnapshot,
    { userId: { $in: existingIds }, syncType: 'hotmart' },
    { _id: 1, userId: 1, snapshotDate: 1, userState: 1, products: 1, stats: 1 },
  ), 'HOTMART_SYNC_SNAPSHOT_READ_LIMIT_EXCEEDED') as Record<string, unknown>[]
  const reactivationTargetsByUser: Record<string, number> = {}
  const renewalTargetsByUser: Record<string, number> = {}
  for (const row of userProducts) {
    const value = row as { userId?: unknown; platform?: unknown; status?: unknown }
    if (value.status === 'INACTIVE' || value.status === 'PARA_INATIVAR') {
      const key = String(value.userId ?? '')
      renewalTargetsByUser[key] = (renewalTargetsByUser[key] ?? 0) + 1
    }
    if (value.platform === 'hotmart' && (value.status === 'INACTIVE' || value.status === 'PARA_INATIVAR')) {
      const key = String(value.userId ?? '')
      reactivationTargetsByUser[key] = (reactivationTargetsByUser[key] ?? 0) + 1
    }
  }
  const reactivationTargets = Object.values(reactivationTargetsByUser).reduce((sum, count) => sum + count, 0)
  const renewalTargets = Object.values(renewalTargetsByUser).reduce((sum, count) => sum + count, 0)
  const projectedMutations = minimumProjectedMutations + reactivationTargets + renewalTargets
  if (projectedMutations > HOTMART_SYNC_LIMIT) {
    throw safetyError(
      'HOTMART_SYNC_EFFECTIVE_MUTATION_LIMIT_EXCEEDED',
      `efeitos projectados excedem ${HOTMART_SYNC_LIMIT}`,
      413,
    )
  }
  const usersByEmail: Record<string, Record<string, unknown> | null> = {}
  for (const item of source) {
    usersByEmail[normalizeKey(item.email)] = existing.find(row => normalizeKey(row.email) === normalizeKey(item.email)) ?? null
  }
  const executionPlan = createExecutionPlan(
    source,
    existing,
    products,
    classes,
    userProducts,
    snapshots,
    projectedMutations,
    usersByEmail,
    reactivationTargetsByUser,
    renewalTargetsByUser,
  )
  return {
    sourceData: source,
    plan: {
      operation: 'hotmart-sync', dryRun, truncated: false, anomaly: false,
      limit: HOTMART_SYNC_LIMIT, total: source.length, inserted: source.length - updated,
      updated, errors: 0, skipped: 0, remaining: 0,
    },
    executionPlan,
  }
}

function createExecutionPlan(
  source: UniversalSourceItem[],
  existing: Record<string, unknown>[],
  products: Record<string, unknown>[],
  classes: Record<string, unknown>[],
  userProducts: Record<string, unknown>[],
  snapshots: Record<string, unknown>[],
  projectedEffects: number,
  usersByEmail: Record<string, Record<string, unknown> | null> = Object.fromEntries(
    existing.map(user => [normalizeKey(user.email), user]),
  ),
  reactivationTargetsByUser: Record<string, number> = {},
  renewalTargetsByUser: Record<string, number> = {},
): HotmartExecutionPlan {
  let consumedEffects = 0
  return {
    sourceKeys: source.map(item => normalizeKey(item.email)),
    usersByEmail,
    products,
    classes,
    userProducts,
    snapshots,
    reactivationTargetsByUser,
    renewalTargetsByUser,
    projectedEffects,
    get consumedEffects() { return consumedEffects },
    consumeMutation(count = 1) {
      if (!Number.isSafeInteger(count) || count < 1 || consumedEffects + count > projectedEffects) {
        throw safetyError('HOTMART_SYNC_EFFECTIVE_MUTATION_LIMIT_EXCEEDED', 'efeitos reais excedem o plano', 413)
      }
      consumedEffects += count
    },
  }
}
