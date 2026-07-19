// ════════════════════════════════════════════════════════════
// 📁 src/controllers/acReader.controller.ts
// Controller para Contact Tag Reader endpoints
// ════════════════════════════════════════════════════════════

import type { RequestHandler } from 'express'
import { ACContactState } from '../../models'
import User from '../../models/user'
import contactTagReaderService, {
  ContactTagInfo,
  SyncResult
} from '../../services/activeCampaign/contactTagReader.service'

type ContactEmailParams = {
  email: string
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

const isTruthyQuery = (value: unknown): boolean => {
  if (value === undefined || value === null) return false
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value === 1
  if (typeof value === 'string') return ['1', 'true', 'yes', 'y'].includes(value.toLowerCase())
  return false
}

type ACContactStateUpsertPayload = {
  email: string
  lastSyncAt: Date
  tags: Array<{
    id: string
    name: string
    appliedAt: Date
    isSystemTag: boolean
  }>
  detectedProducts: Array<{
    code: string
    name: string
    detectedFromTags: string[]
    currentLevel: number
    isActive: boolean
    confidence: number
  }>
}

const normalizeToACContactState = (info: ContactTagInfo): ACContactStateUpsertPayload => {
  return {
    email: info.email,
    lastSyncAt: new Date(),
    tags: info.tags.map(t => ({
      id: t.id,
      name: t.name,
      appliedAt: t.appliedAt,
      isSystemTag: t.appliedBy === 'system'
    })),
    detectedProducts: info.products.map(p => ({
      code: p.code,
      name: p.name,
      detectedFromTags: p.detectedFromTags,
      currentLevel: p.currentLevel,
      isActive: p.isActive,
      confidence: 100 // fallback (sem scoring no service atual)
    }))
  }
}

const syncByEmail = async (
  email: string
): Promise<{
  email: string
  userId?: string
  action: 'synced' | 'no_changes' | 'not_found' | 'error'
  productsUpdated?: number
  reason?: string
}> => {
  const user = await User.findOne({ email }).select('_id email').lean()

  if (!user?._id) {
    return { email, action: 'not_found', reason: 'User not found in BO' }
  }

  const userId = user._id.toString()
  const result: SyncResult = await contactTagReaderService.syncUserTagsFromAC(userId)

  if (!result.synced) {
    return { email, userId, action: 'error', reason: result.reason || 'Sync failed' }
  }

  const productsUpdated = result.productsUpdated ?? 0
  return {
    email,
    userId,
    action: productsUpdated > 0 ? 'synced' : 'no_changes',
    productsUpdated
  }
}

// ─────────────────────────────────────────────────────────────
// ENDPOINTS PRINCIPAIS
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/ac/contact/:email/tags
 * Buscar todas as tags de um contacto
 */
export const getContactTags: RequestHandler<ContactEmailParams> = async (req, res) => {
  try {
    const { email } = req.params
    const forceRefresh = isTruthyQuery(req.query.forceRefresh)

    // Cache (1h) se não forçar refresh
    if (!forceRefresh) {
      const cached = await ACContactState.findOne({ email })
      if (cached && cached.lastSyncAt > new Date(Date.now() - 60 * 60 * 1000)) {
        res.json({ success: true, data: cached, fromCache: true })
        return
      }
    }

    // Buscar do AC via service
    const contactInfo = await contactTagReaderService.getContactTags(email)

    if (!contactInfo) {
      res.status(404).json({
        success: false,
        error: 'Contacto não encontrado no Active Campaign'
      })
      return
    }

    // Normalizar + guardar no cache (ACContactState) para analytics/consistência
    const payload = normalizeToACContactState(contactInfo)

    const saved = await ACContactState.findOneAndUpdate(
      { email },
      { $set: payload },
      { upsert: true, new: true }
    )

    res.json({
      success: true,
      data: saved ?? payload,
      fromCache: false
    })
    return
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error?.message || 'Erro interno do servidor'
    })
    return
  }
}

/**
 * POST /api/ac/contact/:email/sync
 * Sincronizar tags AC → BO para um contacto (por email)
 */
export const syncContactTags: RequestHandler<ContactEmailParams> = async (req, res) => {
  try {
    const { email } = req.params

    console.log(`🔄 Sync contact tags: ${email}`)

    const syncResult = await syncByEmail(email)

    // opcional: refresh do cache após sync
    const contactInfo = await contactTagReaderService.getContactTags(email)
    if (contactInfo) {
      const payload = normalizeToACContactState(contactInfo)
      await ACContactState.findOneAndUpdate(
        { email },
        { $set: payload },
        { upsert: true, new: true }
      )
    }

    res.json({
      success: syncResult.action === 'synced' || syncResult.action === 'no_changes',
      data: syncResult
    })
    return
  } catch (error: any) {
    console.error('❌ Erro ao sincronizar contacto:', error)
    res.status(500).json({
      success: false,
      error: error?.message || 'Erro interno do servidor'
    })
    return
  }
}

/**
 * POST /api/ac/contacts/batch-tags
 * Buscar tags de múltiplos contactos
 */
export const getBatchContactTags: RequestHandler = async (req, res) => {
  try {
    const { emails } = req.body as { emails?: unknown }

    if (!Array.isArray(emails) || emails.length === 0) {
      res.status(400).json({ success: false, error: 'Array de emails é obrigatório' })
      return
    }

    if (emails.length > 50) {
      res.status(400).json({ success: false, error: 'Máximo de 50 emails por batch' })
      return
    }

    const normalizedEmails = emails.filter(e => typeof e === 'string') as string[]

    console.log(`🔍 Batch contact tags: ${normalizedEmails.length} emails`)

    const results = await Promise.all(
      normalizedEmails.map(async (email: string) => {
        const info = await contactTagReaderService.getContactTags(email)
        if (!info) return null

        // opcional: atualizar cache
        const payload = normalizeToACContactState(info)
        await ACContactState.findOneAndUpdate(
          { email },
          { $set: payload },
          { upsert: true, new: true }
        )

        return payload
      })
    )

    const found = results.filter(Boolean) as ACContactStateUpsertPayload[]

    res.json({
      success: true,
      data: found,
      summary: {
        requested: normalizedEmails.length,
        found: found.length,
        notFound: normalizedEmails.length - found.length
      }
    })
    return
  } catch (error: any) {
    console.error('❌ Erro batch contact tags:', error)
    res.status(500).json({
      success: false,
      error: error?.message || 'Erro interno do servidor'
    })
    return
  }
}

/**
 * POST /api/ac/contacts/batch-sync
 * Sincronizar múltiplos contactos AC → BO (por email)
 */
export const batchSyncContacts: RequestHandler = async (req, res) => {
  try {
    const { emails } = req.body as { emails?: unknown }

    if (!Array.isArray(emails) || emails.length === 0) {
      res.status(400).json({ success: false, error: 'Array de emails é obrigatório' })
      return
    }

    if (emails.length > 20) {
      res.status(400).json({ success: false, error: 'Máximo de 20 emails por batch sync' })
      return
    }

    const normalizedEmails = emails.filter(e => typeof e === 'string') as string[]

    console.log(`🔄 Batch sync contacts: ${normalizedEmails.length} emails`)

    const results = await Promise.all(normalizedEmails.map(email => syncByEmail(email)))

    const summary = {
      total: results.length,
      synced: results.filter(r => r.action === 'synced').length,
      noChanges: results.filter(r => r.action === 'no_changes').length,
      notFound: results.filter(r => r.action === 'not_found').length,
      errors: results.filter(r => r.action === 'error').length
    }

    res.json({ success: true, data: results, summary })
    return
  } catch (error: any) {
    console.error('❌ Erro batch sync contacts:', error)
    res.status(500).json({
      success: false,
      error: error?.message || 'Erro interno do servidor'
    })
    return
  }
}

/**
 * DELETE /api/ac/cache/clear
 * Limpar cache de contactos AC
 */
export const clearACCache: RequestHandler = async (req, res) => {
  try {
    const olderThanDays =
      typeof req.body.olderThanDays === 'number' ? req.body.olderThanDays : 30

    console.log(`🗑️ Clear AC cache (older than ${olderThanDays} days)`)

    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000)

    const result = await ACContactState.deleteMany({
      lastSyncAt: { $lt: cutoff }
    })

    res.json({
      success: true,
      data: {
        deletedCount: result.deletedCount,
        cutoffDate: cutoff
      }
    })
    return
  } catch (error: any) {
    console.error('❌ Erro clear AC cache:', error)
    res.status(500).json({
      success: false,
      error: error?.message || 'Erro interno do servidor'
    })
    return
  }
}
