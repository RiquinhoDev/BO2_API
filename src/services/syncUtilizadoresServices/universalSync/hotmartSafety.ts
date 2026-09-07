import User from '../../../models/user'
import type { UniversalSourceItem } from '../../../types/universalSync.types'
import type { HotmartSyncPlan } from '../../../types/cron.types'

export const HOTMART_SYNC_LIMIT = 20_000

const safetyError = (code: string, message: string, status = 422): Error => {
  const error = new Error(`${code}: ${message}`)
  Object.assign(error, { code, status })
  return error
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
  return {
    sourceData: source,
    plan: {
      operation: 'hotmart-sync', dryRun, truncated: false, anomaly: false,
      limit: HOTMART_SYNC_LIMIT, total: source.length, inserted: source.length - updated,
      updated, errors: 0, skipped: 0, remaining: 0,
    },
  }
}
