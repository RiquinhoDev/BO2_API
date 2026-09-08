import User from '../../../models/user'
import { Product, UserProduct } from '../../../models'
import { Class } from '../../../models/Class'
import UserSnapshot from '../../../models/UserSnapshot'
import type { UniversalSourceItem } from '../../../types/universalSync.types'
import type { CurseducaSyncPlan } from '../../../types/cron.types'
import type { CronExecutionPhaseHooks } from '../../cron/scheduler/executionPhases'

export const CURSEDUCA_SYNC_LIMIT = 20_000

export interface CurseducaExecutionPlan {
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

const safetyError = (code: string, message: string, status = 422): Error => {
  const error = new Error(`${code}: ${message}`)
  Object.assign(error, { code, status })
  return error
}

const boundedRead = async (model: unknown, query: unknown, projection: Record<string, number>): Promise<unknown[]> => {
  const collection = (model as { collection: { find: (query: never, options?: never) => { sort: (value: never) => { limit: (value: number) => { toArray: () => Promise<unknown[]> } } } } }).collection
  const rows = await collection.find(query as never, { projection } as never).sort({ _id: 1 } as never).limit(CURSEDUCA_SYNC_LIMIT + 1).toArray()
  if (rows.length > CURSEDUCA_SYNC_LIMIT) throw safetyError('CURSEDUCA_SYNC_LOCAL_LIMIT_EXCEEDED', `leitura local excede ${CURSEDUCA_SYNC_LIMIT}`, 413)
  return rows
}

const key = (value: unknown): string => String(value ?? '').trim().toLowerCase()

const sourceIdentity = (item: UniversalSourceItem): string => {
  const aliases = [item.curseducaUserId, item.id, item.userId]
    .filter(value => typeof value === 'string' && value.trim() !== '')
    .map(value => (value as string).trim())
  if (new Set(aliases).size > 1) throw safetyError('CURSEDUCA_SYNC_IDENTITY_CONFLICT', 'identidades contraditórias')
  const email = key(item.email)
  if (aliases.length === 0 && !email) throw safetyError('CURSEDUCA_SYNC_IDENTITY_INVALID', 'item sem identidade estável')
  return aliases[0] ?? email
}

const normalizeSource = (sourceData: UniversalSourceItem | UniversalSourceItem[]): UniversalSourceItem[] => {
  const source = Array.isArray(sourceData) ? sourceData : [sourceData]
  if (source.length > CURSEDUCA_SYNC_LIMIT) throw safetyError('CURSEDUCA_SYNC_ITEM_LIMIT_EXCEEDED', `limite de ${CURSEDUCA_SYNC_LIMIT} itens excedido`, 413)
  const identities = new Set<string>()
  const emails = new Set<string>()
  return source.map(item => {
    if (!item || typeof item !== 'object') throw safetyError('CURSEDUCA_SYNC_ITEM_INVALID', 'item inválido')
    const identity = sourceIdentity(item)
    const email = key(item.email)
    if (!email) throw safetyError('CURSEDUCA_SYNC_EMAIL_INVALID', 'email obrigatório')
    if (identities.has(identity) || emails.has(email)) throw safetyError('CURSEDUCA_SYNC_DUPLICATE_IDENTITY', 'identidade repetida')
    identities.add(identity); emails.add(email)
    return { ...item, email }
  })
}

const unwrap = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object' && 'toObject' in value && typeof (value as { toObject?: unknown }).toObject === 'function') {
    return (value as { toObject: () => Record<string, unknown> }).toObject()
  }
  return (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
}

const observedFields = (planned: Record<string, unknown>): [string, unknown][] => {
  const curseduca = (planned.curseduca && typeof planned.curseduca === 'object' ? planned.curseduca : {}) as Record<string, unknown>
  const combined = (planned.combined && typeof planned.combined === 'object' ? planned.combined : {}) as Record<string, unknown>
  return [
    ['_id', planned._id], ['email', planned.email], ['name', planned.name],
    ['classId', planned.classId], ['curseduca.curseducaUserId', curseduca.curseducaUserId],
    ['curseduca.enrolledClasses', curseduca.enrolledClasses], ['combined.status', combined.status],
  ].filter((entry): entry is [string, unknown] => entry[1] !== undefined)
}

const same = (expected: unknown, actual: unknown): boolean => {
  if (Array.isArray(expected)) return Array.isArray(actual) && expected.length === actual.length && expected.every((value, index) => same(value, actual[index]))
  if (expected && typeof expected === 'object') return Boolean(actual && typeof actual === 'object') && Object.entries(expected as Record<string, unknown>).every(([path, value]) => same(value, (actual as Record<string, unknown>)[path]))
  return Object.is(expected, actual)
}

export const assertCurseducaUserMatchesPlan = (planned: Record<string, unknown> | null, current: unknown): void => {
  if ((planned === null) !== (current === null)) throw new Error('CURSEDUCA_SYNC_PLAN_CONCURRENCY_CONFLICT')
  if (!planned || !current) return
  const actual = unwrap(current)
  for (const [path, expected] of observedFields(planned)) {
    const value = path.split('.').reduce<unknown>((candidate, segment) => candidate && typeof candidate === 'object' ? (candidate as Record<string, unknown>)[segment] : undefined, actual)
    if (!same(expected, value)) throw new Error('CURSEDUCA_SYNC_PLAN_CONCURRENCY_CONFLICT')
  }
}

export const curseducaUserOptimisticFilter = (planned: Record<string, unknown> | null): Record<string, unknown> => {
  if (!planned) return {}
  const filter: Record<string, unknown> = {}
  for (const [path, value] of observedFields(planned)) filter[path] = value
  return filter
}

export const mergeCurseducaClassPlan = (plan: Pick<CurseducaExecutionPlan, 'classes'>, value: unknown): void => {
  const row = unwrap(value)
  const id = String(row.classId ?? '')
  if (!id) return
  const index = plan.classes.findIndex(item => String(item.classId ?? '') === id)
  if (index >= 0) plan.classes[index] = row
  else plan.classes.push(row)
}

export function governCurseducaExecution(plan: CurseducaExecutionPlan, hooks?: CronExecutionPhaseHooks): CronExecutionPhaseHooks {
  const fallbackHooks: CronExecutionPhaseHooks = {
    providerStarted: () => undefined,
    providerSucceeded: () => undefined,
    localMutationStarted: () => undefined,
  }
  return { ...(hooks ?? fallbackHooks), consumeMutation: (count = 1) => plan.consumeMutation(count) }
}

export async function prepareCurseducaSync(sourceData: UniversalSourceItem | UniversalSourceItem[], dryRun: boolean, requestedBatchSize = 50): Promise<{ sourceData: UniversalSourceItem[]; plan: CurseducaSyncPlan; executionPlan: CurseducaExecutionPlan }> {
  const source = normalizeSource(sourceData)
  const batchSize = Number.isSafeInteger(requestedBatchSize) && requestedBatchSize > 0 ? requestedBatchSize : 50
  const emails = source.map(item => item.email as string)
  const existing = await boundedRead(User, { email: { $in: emails } }, { _id: 1, email: 1, name: 1, classId: 1, hotmart: 1, curseduca: 1, combined: 1, metadata: 1 }) as Record<string, unknown>[]
  const existingEmails = new Set(existing.map(item => key(item.email)))
  const updated = source.filter(item => existingEmails.has(key(item.email))).length
  const groupIds = [...new Set(source.map(item => item.groupId).filter(value => value !== undefined && value !== null).map(String))]
  const batchCount = Math.ceil(source.length / batchSize)
  const ids = existing.map(item => item._id).filter(value => value !== undefined && value !== null)
  const groupNames = [...new Set(source
    .map(item => typeof item.groupName === 'string' ? item.groupName.trim() : '')
    .filter(name => name !== ''))]
  const productSelectors: Record<string, unknown>[] = [
    { curseducaGroupId: { $in: groupIds } },
    { code: { $in: ['CLAREZA_MENSAL', 'CLAREZA_ANUAL'] } },
    ...groupNames.map(name => ({ name: { $regex: name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } })),
    ...(source.some(item => item.groupId === undefined || item.groupId === null)
      ? [{ platform: 'curseduca', isActive: true }]
      : []),
  ]
  const products = await boundedRead(Product, { platform: 'curseduca', isActive: true, $or: productSelectors }, { _id: 1, code: 1, platform: 1, curseducaGroupId: 1, name: 1, platformData: 1 }) as Record<string, unknown>[]
  const classes = groupIds.length === 0 ? [] : await boundedRead(Class, { classId: { $in: groupIds } }, { _id: 1, classId: 1, name: 1, updatedAt: 1 }) as Record<string, unknown>[]
  // Reactivation and snapshot helpers operate by userId and can affect every
  // platform row. The plan must therefore preload the complete fan-out.
  const userProducts = ids.length === 0 ? [] : await boundedRead(UserProduct, { userId: { $in: ids } }, { _id: 1, userId: 1, productId: 1, status: 1, platform: 1, progress: 1, engagement: 1, classes: 1, isPrimary: 1, enrolledAt: 1, updatedAt: 1 }) as Record<string, unknown>[]
  const snapshots = ids.length === 0 ? [] : await boundedRead(UserSnapshot, { userId: { $in: ids }, syncType: 'curseduca' }, { _id: 1, userId: 1, snapshotDate: 1, userState: 1, products: 1, stats: 1 }) as Record<string, unknown>[]
  const usersByEmail: Record<string, Record<string, unknown> | null> = {}
  for (const item of source) usersByEmail[key(item.email)] = existing.find(row => key(row.email) === key(item.email)) ?? null
  const latestSnapshotByUser = new Map<string, Record<string, unknown>>()
  for (const snapshot of snapshots) {
    const userId = String(snapshot.userId ?? '')
    const previous = latestSnapshotByUser.get(userId)
    if (!previous || String(snapshot.snapshotDate ?? '') > String(previous.snapshotDate ?? '')) latestSnapshotByUser.set(userId, snapshot)
  }
  const historyUpperBound = source.reduce((total, item) => {
    const plannedUser = existing.find(row => key(row.email) === key(item.email))
    const userId = String(plannedUser?._id ?? '')
    const plannedProducts = userProducts.filter(row => String(row.userId ?? '') === userId)
    const afterProductCount = plannedProducts.length + 1
    const afterClassCount = plannedProducts.reduce((count, product) => count + (Array.isArray(product.classes) ? product.classes.length : 0), 0) + (item.groupId ? 1 : 0)
    const before = latestSnapshotByUser.get(userId)
    if (!before) return total + 1 + afterProductCount

    const beforeProducts = Array.isArray(before.products) ? before.products : []
    const beforeClassCount = beforeProducts.reduce((count, product) => {
      const classes = product && typeof product === 'object' && Array.isArray((product as Record<string, unknown>).classes)
        ? (product as Record<string, unknown>).classes as unknown[]
        : []
      return count + classes.length
    }, 0)
    const matchedProductCount = Math.min(beforeProducts.length, afterProductCount)
    return total + 2 + beforeProducts.length + afterProductCount + matchedProductCount * 6 + beforeClassCount + afterClassCount
  }, 0)
  const reactivationTargetsByUser: Record<string, number> = {}
  const renewalTargetsByUser: Record<string, number> = {}
  for (const row of userProducts) {
    if (row.status !== 'INACTIVE' && row.status !== 'PARA_INATIVAR') continue
    const userId = String(row.userId ?? '')
    renewalTargetsByUser[userId] = (renewalTargetsByUser[userId] ?? 0) + 1
    reactivationTargetsByUser[userId] = (reactivationTargetsByUser[userId] ?? 0) + 1
  }
  const reactivationTargets = Object.values(reactivationTargetsByUser).reduce((sum, count) => sum + count, 0)
  const renewalTargets = Object.values(renewalTargetsByUser).reduce((sum, count) => sum + count, 0)
  const reportEffects = 8 + batchCount
  const baseItemEffects = source.length * 4
  const classEffects = source.filter(item => (
    typeof item.groupId === 'string' && item.groupId.trim() !== ''
    || typeof item.groupId === 'number' && Number.isSafeInteger(item.groupId)
  )).length
  const projected = reportEffects + baseItemEffects + historyUpperBound + classEffects + reactivationTargets + renewalTargets
  if (projected > CURSEDUCA_SYNC_LIMIT) throw safetyError('CURSEDUCA_SYNC_EFFECTIVE_MUTATION_LIMIT_EXCEEDED', `efeitos projectados excedem ${CURSEDUCA_SYNC_LIMIT}`, 413)
  let consumedEffects = 0
  const executionPlan: CurseducaExecutionPlan = {
    sourceKeys: source.map(item => key(item.email)), usersByEmail, products, classes, userProducts, snapshots,
    reactivationTargetsByUser, renewalTargetsByUser, projectedEffects: projected,
    get consumedEffects() { return consumedEffects },
    consumeMutation(count = 1) {
      if (!Number.isSafeInteger(count) || count < 1 || consumedEffects + count > projected) throw safetyError('CURSEDUCA_SYNC_EFFECTIVE_MUTATION_LIMIT_EXCEEDED', 'efeitos reais excedem o plano', 413)
      consumedEffects += count
    },
  }
  return { sourceData: source, executionPlan, plan: { operation: 'curseduca-sync', dryRun, truncated: false, anomaly: false, limit: CURSEDUCA_SYNC_LIMIT, total: source.length, inserted: source.length - updated, updated, errors: 0, skipped: 0, remaining: 0 } }
}
