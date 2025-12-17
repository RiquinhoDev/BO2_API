// ════════════════════════════════════════════════════════════
// 📁 src/controllers/acReader.controller.ts
// Controller para Contact Tag Reader endpoints
// ════════════════════════════════════════════════════════════

import { Request, Response } from 'express'
import { ACContactState } from '../../models'
import User from '../../models/user'
import contactTagReaderService, {
  ContactTagInfo,
  SyncResult
} from '../../services/ac/contactTagReader.service'

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

const syncByEmail = async (email: string): Promise<{
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
export const getContactTags = async (req: Request, res: Response) => {
  try {
    const { email } = req.params
    const forceRefresh = isTruthyQuery(req.query.forceRefresh)

    console.log(`🔍 GET contact tags: ${email} (forceRefresh=${forceRefresh})`)

    // Cache (1h) se não forçar refresh
    if (!forceRefresh) {
      const cached = await ACContactState.findOne({ email })
      if (cached && cached.lastSyncAt > new Date(Date.now() - 60 * 60 * 1000)) {
        console.log(`✅ Retornando do cache: ${email}`)
        return res.json({ success: true, data: cached, fromCache: true })
      }
    }

    // Buscar do AC via service
    const contactInfo = await contactTagReaderService.getContactTags(email)

    if (!contactInfo) {
      return res.status(404).json({
        success: false,
        error: 'Contacto não encontrado no Active Campaign'
      })
    }

    // Normalizar + guardar no cache (ACContactState) para analytics/consistência
    const payload = normalizeToACContactState(contactInfo)

    const saved = await ACContactState.findOneAndUpdate(
      { email },
      { $set: payload },
      { upsert: true, new: true }
    )

    return res.json({
      success: true,
      data: saved ?? payload,
      fromCache: false
    })
  } catch (error: any) {
    console.error('❌ Erro ao buscar tags do contacto:', error)
    return res.status(500).json({
      success: false,
      error: error.message || 'Erro interno do servidor'
    })
  }
}

/**
 * POST /api/ac/contact/:email/sync
 * Sincronizar tags AC → BO para um contacto (por email)
 */
export const syncContactTags = async (req: Request, res: Response) => {
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

    return res.json({
      success: syncResult.action === 'synced' || syncResult.action === 'no_changes',
      data: syncResult
    })
  } catch (error: any) {
    console.error('❌ Erro ao sincronizar contacto:', error)
    return res.status(500).json({
      success: false,
      error: error.message || 'Erro interno do servidor'
    })
  }
}

/**
 * POST /api/ac/contacts/batch-tags
 * Buscar tags de múltiplos contactos
 */
export const getBatchContactTags = async (req: Request, res: Response) => {
  try {
    const { emails } = req.body as { emails?: unknown }

    if (!Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({ success: false, error: 'Array de emails é obrigatório' })
    }

    if (emails.length > 50) {
      return res.status(400).json({ success: false, error: 'Máximo de 50 emails por batch' })
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

    return res.json({
      success: true,
      data: found,
      summary: {
        requested: normalizedEmails.length,
        found: found.length,
        notFound: normalizedEmails.length - found.length
      }
    })
  } catch (error: any) {
    console.error('❌ Erro batch contact tags:', error)
    return res.status(500).json({
      success: false,
      error: error.message || 'Erro interno do servidor'
    })
  }
}

/**
 * POST /api/ac/contacts/batch-sync
 * Sincronizar múltiplos contactos AC → BO (por email)
 */
export const batchSyncContacts = async (req: Request, res: Response) => {
  try {
    const { emails } = req.body as { emails?: unknown }

    if (!Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({ success: false, error: 'Array de emails é obrigatório' })
    }

    if (emails.length > 20) {
      return res.status(400).json({ success: false, error: 'Máximo de 20 emails por batch sync' })
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

    return res.json({ success: true, data: results, summary })
  } catch (error: any) {
    console.error('❌ Erro batch sync contacts:', error)
    return res.status(500).json({
      success: false,
      error: error.message || 'Erro interno do servidor'
    })
  }
}

// ─────────────────────────────────────────────────────────────
// ENDPOINTS DE ANÁLISE
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/ac/analytics/overview
 * Overview geral de contactos e tags AC
 */
export const getACOverview = async (req: Request, res: Response) => {
  try {
    console.log(`📊 Get AC overview`)

    const [
      totalContactsWithTags,
      totalSystemTagsAgg,
      totalProductsAgg,
      oldSyncs,
      contactsWithInconsistencies
    ] = await Promise.all([
      ACContactState.countDocuments(),
      ACContactState.aggregate([
        { $unwind: '$tags' },
        { $match: { 'tags.isSystemTag': true } },
        { $count: 'count' }
      ]),
      ACContactState.aggregate([
        { $unwind: '$detectedProducts' },
        { $match: { 'detectedProducts.confidence': { $gte: 70 } } },
        { $group: { _id: '$detectedProducts.code' } },
        { $count: 'count' }
      ]),
      (ACContactState as any).findOldSyncs(7),
      (ACContactState as any).findWithInconsistencies()
    ])

    const systemTagsCount = (totalSystemTagsAgg as Array<{ count: number }>)[0]?.count || 0
    const detectedProductsCount = (totalProductsAgg as Array<{ count: number }>)[0]?.count || 0

    const oldSyncsCount = Array.isArray(oldSyncs) ? oldSyncs.length : 0
    const inconsistenciesCount = Array.isArray(contactsWithInconsistencies)
      ? contactsWithInconsistencies.length
      : 0

    const overview = {
      contactsWithTags: totalContactsWithTags,
      systemTagsCount,
      detectedProductsCount,
      oldSyncsCount,
      inconsistenciesCount,
      lastSyncHealth: {
        needsRefresh: oldSyncsCount,
        hasIssues: inconsistenciesCount,
        healthScore: Math.max(0, 100 - oldSyncsCount - inconsistenciesCount)
      }
    }

    return res.json({ success: true, data: overview })
  } catch (error: any) {
    console.error('❌ Erro AC overview:', error)
    return res.status(500).json({
      success: false,
      error: error.message || 'Erro interno do servidor'
    })
  }
}

/**
 * GET /api/ac/analytics/product/:code
 * Analytics de um produto específico
 */
export const getProductACAnalytics = async (req: Request, res: Response) => {
  try {
    const { code } = req.params

    console.log(`📊 Get AC analytics for product: ${code}`)

    const productContacts: any[] = await (ACContactState as any).findByProduct(code)

    const averageConfidence =
      productContacts.reduce((sum: number, c: any) => {
        const product = c.detectedProducts?.find((p: any) => p.code === code)
        return sum + (product?.confidence || 0)
      }, 0) / Math.max(productContacts.length, 1)

    const analytics = {
      productCode: code,
      totalContacts: productContacts.length,
      averageConfidence,
      levelDistribution: {} as Record<string, number>,
      tagDistribution: {} as Record<string, number>,
      lastActivity: productContacts.reduce((latest: Date, c: any) => {
        const dt = c.lastSyncAt ? new Date(c.lastSyncAt) : new Date(0)
        return dt > latest ? dt : latest
      }, new Date(0))
    }

    // Distribuição de níveis
    productContacts.forEach((contact: any) => {
      const product = contact.detectedProducts?.find((p: any) => p.code === code)
      if (product?.currentLevel) {
        const levelKey = `Level ${product.currentLevel}`
        analytics.levelDistribution[levelKey] = (analytics.levelDistribution[levelKey] || 0) + 1
      }
    })

    // Distribuição de tags
    productContacts.forEach((contact: any) => {
      ;(contact.tags || []).forEach((tag: any) => {
        const name = tag?.name
        if (typeof name === 'string' && name.toUpperCase().startsWith(code.toUpperCase())) {
          analytics.tagDistribution[name] = (analytics.tagDistribution[name] || 0) + 1
        }
      })
    })

    return res.json({ success: true, data: analytics })
  } catch (error: any) {
    console.error('❌ Erro product AC analytics:', error)
    return res.status(500).json({
      success: false,
      error: error.message || 'Erro interno do servidor'
    })
  }
}

/**
 * GET /api/ac/inconsistencies
 * Listar inconsistências BO vs AC
 *
 * Nota: depende de (ACContactState as any).findWithInconsistencies()
 * e de existir lógica de inconsistências no teu estado/cache.
 */
export const getInconsistencies = async (req: Request, res: Response) => {
  try {
    const severity = typeof req.query.severity === 'string' ? req.query.severity : undefined
    const limitRaw = typeof req.query.limit === 'string' ? req.query.limit : '50'
    const limit = Number.isNaN(parseInt(limitRaw, 10)) ? 50 : parseInt(limitRaw, 10)

    console.log(`⚠️ Get inconsistencies (severity: ${severity || 'any'}) limit=${limit}`)

    const contactsWithIssues: any[] = await (ACContactState as any)
      .findWithInconsistencies()
      .limit(limit)
      .lean()

    const inconsistencies: Array<{
      email: string
      lastSync: Date
      issues: any[]
    }> = []

    for (const contact of contactsWithIssues) {
      // "freshInfo" pode variar conforme a tua implementação real do service
      const freshInfo = (await contactTagReaderService.getContactTags(contact.email)) as any

      const issues = Array.isArray(freshInfo?.inconsistencies)
        ? freshInfo.inconsistencies.filter((i: any) => !severity || i.severity === severity)
        : []

      if (issues.length > 0) {
        inconsistencies.push({
          email: contact.email,
          lastSync: contact.lastSyncAt,
          issues
        })
      }
    }

    const totalIssues = inconsistencies.reduce((sum: number, i: { issues: any[] }) => {
      return sum + i.issues.length
    }, 0)

    return res.json({
      success: true,
      data: inconsistencies,
      summary: {
        totalContacts: inconsistencies.length,
        totalIssues
      }
    })
  } catch (error: any) {
    console.error('❌ Erro get inconsistencies:', error)
    return res.status(500).json({
      success: false,
      error: error.message || 'Erro interno do servidor'
    })
  }
}

// ─────────────────────────────────────────────────────────────
// ENDPOINTS DE MANUTENÇÃO
// ─────────────────────────────────────────────────────────────

/**
 * POST /api/ac/maintenance/refresh-old
 * Refresh de contactos com sync antigo
 */
export const refreshOldSyncs = async (req: Request, res: Response) => {
  try {
    const daysOld = typeof req.body.daysOld === 'number' ? req.body.daysOld : 7
    const limit = typeof req.body.limit === 'number' ? req.body.limit : 20

    console.log(`🔧 Refresh old syncs (${daysOld} days, limit ${limit})`)

    const oldContacts: any[] = await (ACContactState as any).findOldSyncs(daysOld).limit(limit)
    const emails = oldContacts.map((c: any) => c.email).filter((e: any) => typeof e === 'string') as string[]

    const results = await Promise.all(emails.map(email => syncByEmail(email)))

    const summary = {
      processed: results.length,
      updated: results.filter(r => r.action === 'synced').length
    }

    return res.json({ success: true, data: results, summary })
  } catch (error: any) {
    console.error('❌ Erro refresh old syncs:', error)
    return res.status(500).json({
      success: false,
      error: error.message || 'Erro interno do servidor'
    })
  }
}

/**
 * DELETE /api/ac/cache/clear
 * Limpar cache de contactos AC
 */
export const clearACCache = async (req: Request, res: Response) => {
  try {
    const olderThanDays =
      typeof req.body.olderThanDays === 'number' ? req.body.olderThanDays : 30

    console.log(`🗑️ Clear AC cache (older than ${olderThanDays} days)`)

    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000)

    const result = await ACContactState.deleteMany({
      lastSyncAt: { $lt: cutoff }
    })

    return res.json({
      success: true,
      data: {
        deletedCount: result.deletedCount,
        cutoffDate: cutoff
      }
    })
  } catch (error: any) {
    console.error('❌ Erro clear AC cache:', error)
    return res.status(500).json({
      success: false,
      error: error.message || 'Erro interno do servidor'
    })
  }
}
