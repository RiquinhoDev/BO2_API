import User from '../../../models/user'
import { Product, UserProduct } from '../../../models'
import { Class } from '../../../models/Class'
import UserHistory from '../../../models/UserHistory'
import UserSnapshot from '../../../models/UserSnapshot'
import StudentClassHistory from '../../../models/StudentClassHistory'
import type { UniversalSourceItem } from '../../../types/universalSync.types'
import type { HotmartSyncPlan } from '../../../types/cron.types'

export const HOTMART_SYNC_LIMIT = 20_000

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
): Promise<{ sourceData: UniversalSourceItem[]; plan: HotmartSyncPlan }> {
  const source = normalizeSource(sourceData)
  if (source.length === 0) {
    return {
      sourceData: source,
      plan: { operation: 'hotmart-sync', dryRun, truncated: false, anomaly: false, limit: HOTMART_SYNC_LIMIT, total: 0, inserted: 0, updated: 0, errors: 0, skipped: 0, remaining: 0 },
    }
  }
  const emails = source.map(item => item.email as string)
  const existing = await User.collection.find(
    { email: { $in: emails } },
    { projection: { _id: 1, email: 1 } },
  )
    .sort({ email: 1, _id: 1 })
    .limit(HOTMART_SYNC_LIMIT + 1)
    .toArray()
  if (existing.length > HOTMART_SYNC_LIMIT) {
    throw safetyError('HOTMART_SYNC_LOCAL_LIMIT_EXCEEDED', `leitura local excede ${HOTMART_SYNC_LIMIT} itens`, 413)
  }
  const existingEmails = new Set(existing.map(item => String(item.email).trim().toLowerCase()))
  const updated = source.filter(item => existingEmails.has(item.email as string)).length

  const classIds = [...new Set(source.map(item => item.classId).filter((value): value is string => typeof value === 'string' && value.trim() !== ''))]
  const productCodes = [...new Set(source.map(item => item.productCode || 'OGI_V1'))]
  const existingIds = existing
    .map(item => item._id)
    .filter(value => value !== undefined && value !== null)
  const classEffects = source.filter(item => typeof item.classId === 'string' && item.classId.trim() !== '').length
  const minimumProjectedMutations = 6 + source.length * 4 + classEffects * 2
  if (minimumProjectedMutations > HOTMART_SYNC_LIMIT) {
    throw safetyError(
      'HOTMART_SYNC_EFFECTIVE_MUTATION_LIMIT_EXCEEDED',
      `efeitos projectados excedem ${HOTMART_SYNC_LIMIT}`,
      413,
    )
  }

  // The normal one-item preview has no referenced local documents and therefore
  // needs only the User bounded read above. Once references exist, every local
  // planning input is sampled with the same cap+1 sentinel before any effect.
  const referencedLocalReads = source.length > 1 || existingIds.length > 0 || classIds.length > 0
  let reactivationTargets = 0
  if (referencedLocalReads) {
    const products = assertBoundedRows(await boundedCollectionRead(
      Product,
      { platform: 'hotmart', code: { $in: productCodes } },
      { _id: 1, code: 1 },
    ), 'HOTMART_SYNC_PRODUCT_READ_LIMIT_EXCEEDED')
    const classes = classIds.length === 0 ? [] : assertBoundedRows(await boundedCollectionRead(
      Class,
      { classId: { $in: classIds } },
      { _id: 1, classId: 1 },
    ), 'HOTMART_SYNC_CLASS_READ_LIMIT_EXCEEDED')
    const userProducts = existingIds.length === 0 ? [] : assertBoundedRows(await boundedCollectionRead(
      UserProduct,
      { userId: { $in: existingIds } },
      { _id: 1, userId: 1, status: 1, platform: 1 },
    ), 'HOTMART_SYNC_USER_PRODUCT_READ_LIMIT_EXCEEDED')
    const history = existingIds.length === 0 ? [] : assertBoundedRows(await boundedCollectionRead(
      UserHistory,
      { userId: { $in: existingIds } },
      { _id: 1, userId: 1 },
    ), 'HOTMART_SYNC_HISTORY_READ_LIMIT_EXCEEDED')
    const snapshots = existingIds.length === 0 ? [] : assertBoundedRows(await boundedCollectionRead(
      UserSnapshot,
      { userId: { $in: existingIds } },
      { _id: 1, userId: 1 },
    ), 'HOTMART_SYNC_SNAPSHOT_READ_LIMIT_EXCEEDED')
    const classHistory = existingIds.length === 0 ? [] : assertBoundedRows(await boundedCollectionRead(
      StudentClassHistory,
      { studentId: { $in: existingIds } },
      { _id: 1, studentId: 1 },
    ), 'HOTMART_SYNC_CLASS_HISTORY_READ_LIMIT_EXCEEDED')
    reactivationTargets = userProducts.filter((row) => {
      const value = row as { platform?: unknown; status?: unknown }
      return value.platform === 'hotmart' && (value.status === 'INACTIVE' || value.status === 'PARA_INATIVAR')
    }).length
    // Keep these bounded planning reads observable and intentional. They are
    // not used as public fields and never escape the sanitized plan.
    void products.length
    void classes.length
    void history.length
    void snapshots.length
    void classHistory.length
  }

  const projectedMutations = 6 + source.length * 4 + classEffects * 2 + reactivationTargets
  if (projectedMutations > HOTMART_SYNC_LIMIT) {
    throw safetyError(
      'HOTMART_SYNC_EFFECTIVE_MUTATION_LIMIT_EXCEEDED',
      `efeitos projectados excedem ${HOTMART_SYNC_LIMIT}`,
      413,
    )
  }
  return {
    sourceData: source,
    plan: {
      operation: 'hotmart-sync', dryRun, truncated: false, anomaly: false,
      limit: HOTMART_SYNC_LIMIT, total: source.length, inserted: source.length - updated,
      updated, errors: 0, skipped: 0, remaining: 0,
    },
  }
}
