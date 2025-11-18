// ════════════════════════════════════════════════════════════
// 📁 src/controllers/acReader.controller.ts
// Controller para Contact Tag Reader endpoints
// ════════════════════════════════════════════════════════════

import { Request, Response } from 'express'
import contactTagReader from '../services/ac/contactTagReader.service'
import ACContactState from '../models/ACContactState'

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
    const { forceRefresh } = req.query

    console.log(`🔍 GET contact tags: ${email}`)

    // Verificar cache se não forçar refresh
    if (!forceRefresh) {
      const cached = await ACContactState.findOne({ email })
      if (cached && cached.lastSyncAt > new Date(Date.now() - 60 * 60 * 1000)) { // 1h cache
        console.log(`✅ Retornando do cache: ${email}`)
        return res.json({
          success: true,
          data: cached,
          fromCache: true
        })
      }
    }

    // Buscar do AC
    const contactInfo = await contactTagReader.getContactTags(email)
    
    if (!contactInfo) {
      return res.status(404).json({
        success: false,
        error: 'Contacto não encontrado no Active Campaign'
      })
    }

    res.json({
      success: true,
      data: contactInfo,
      fromCache: false
    })

  } catch (error: any) {
    console.error('❌ Erro ao buscar tags do contacto:', error)
    res.status(500).json({
      success: false,
      error: error.message || 'Erro interno do servidor'
    })
  }
}

/**
 * POST /api/ac/contact/:email/sync
 * Sincronizar tags AC → BO para um contacto
 */
export const syncContactTags = async (req: Request, res: Response) => {
  try {
    const { email } = req.params
    
    console.log(`🔄 Sync contact tags: ${email}`)

    const result = await contactTagReader.syncUserTagsFromAC(email)

    res.json({
      success: result.success,
      data: result
    })

  } catch (error: any) {
    console.error('❌ Erro ao sincronizar contacto:', error)
    res.status(500).json({
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
    const { emails } = req.body

    if (!Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Array de emails é obrigatório'
      })
    }

    if (emails.length > 50) {
      return res.status(400).json({
        success: false,
        error: 'Máximo de 50 emails por batch'
      })
    }

    console.log(`🔍 Batch contact tags: ${emails.length} emails`)

    const results = await contactTagReader.getMultipleContactTags(emails)

    res.json({
      success: true,
      data: results,
      summary: {
        requested: emails.length,
        found: results.length,
        notFound: emails.length - results.length
      }
    })

  } catch (error: any) {
    console.error('❌ Erro batch contact tags:', error)
    res.status(500).json({
      success: false,
      error: error.message || 'Erro interno do servidor'
    })
  }
}

/**
 * POST /api/ac/contacts/batch-sync
 * Sincronizar múltiplos contactos AC → BO
 */
export const batchSyncContacts = async (req: Request, res: Response) => {
  try {
    const { emails } = req.body

    if (!Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Array de emails é obrigatório'
      })
    }

    if (emails.length > 20) {
      return res.status(400).json({
        success: false,
        error: 'Máximo de 20 emails por batch sync'
      })
    }

    console.log(`🔄 Batch sync contacts: ${emails.length} emails`)

    const results = await contactTagReader.syncMultipleUsersFromAC(emails)

    const summary = {
      total: results.length,
      synced: results.filter(r => r.action === 'synced').length,
      noChanges: results.filter(r => r.action === 'no_changes').length,
      errors: results.filter(r => r.action === 'error').length,
      totalConflicts: results.reduce((sum, r) => sum + r.conflictsCount, 0)
    }

    res.json({
      success: true,
      data: results,
      summary
    })

  } catch (error: any) {
    console.error('❌ Erro batch sync contacts:', error)
    res.status(500).json({
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
      totalSystemTags,
      totalProducts,
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

    const overview = {
      contactsWithTags: totalContactsWithTags,
      systemTagsCount: totalSystemTags[0]?.count || 0,
      detectedProductsCount: totalProducts[0]?.count || 0,
      oldSyncsCount: oldSyncs.length,
      inconsistenciesCount: contactsWithInconsistencies.length,
      lastSyncHealth: {
        needsRefresh: oldSyncs.length,
        hasIssues: contactsWithInconsistencies.length,
        healthScore: Math.max(0, 100 - oldSyncs.length - contactsWithInconsistencies.length)
      }
    }

    res.json({
      success: true,
      data: overview
    })

  } catch (error: any) {
    console.error('❌ Erro AC overview:', error)
    res.status(500).json({
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

    const productContacts = await (ACContactState as any).findByProduct(code)

    const analytics = {
      productCode: code,
      totalContacts: productContacts.length,
      averageConfidence: productContacts.reduce((sum: number, c: any) => {
        const product = c.detectedProducts.find((p: any) => p.code === code)
        return sum + (product?.confidence || 0)
      }, 0) / Math.max(productContacts.length, 1),
      levelDistribution: {} as Record<string, number>,
      tagDistribution: {} as Record<string, number>,
      lastActivity: productContacts.reduce((latest: Date, c: any) => {
        return c.lastSyncAt > latest ? c.lastSyncAt : latest
      }, new Date(0))
    }

    // Calcular distribuição de níveis
    productContacts.forEach((contact: any) => {
      const product = contact.detectedProducts.find((p: any) => p.code === code)
      if (product?.currentLevel) {
        const level = `Level ${product.currentLevel}`
        analytics.levelDistribution[level] = (analytics.levelDistribution[level] || 0) + 1
      }
    })

    // Calcular distribuição de tags
    productContacts.forEach((contact: any) => {
      contact.tags.forEach((tag: any) => {
        if (tag.name.toUpperCase().startsWith(code.toUpperCase())) {
          analytics.tagDistribution[tag.name] = (analytics.tagDistribution[tag.name] || 0) + 1
        }
      })
    })

    res.json({
      success: true,
      data: analytics
    })

  } catch (error: any) {
    console.error('❌ Erro product AC analytics:', error)
    res.status(500).json({
      success: false,
      error: error.message || 'Erro interno do servidor'
    })
  }
}

/**
 * GET /api/ac/inconsistencies
 * Listar inconsistências BO vs AC
 */
export const getInconsistencies = async (req: Request, res: Response) => {
  try {
    const { severity, limit = 50 } = req.query

    console.log(`⚠️ Get inconsistencies (severity: ${severity})`)

    const contactsWithIssues = await (ACContactState as any).findWithInconsistencies()
      .limit(parseInt(limit as string))
      .lean()

    // Processar inconsistências
    const inconsistencies = []
    for (const contact of contactsWithIssues) {
      // Re-verificar inconsistências atuais
      const freshInfo = await contactTagReader.getContactTags(contact.email)
      if (freshInfo?.inconsistencies) {
        inconsistencies.push({
          email: contact.email,
          lastSync: contact.lastSyncAt,
          issues: freshInfo.inconsistencies.filter((i: any) => 
            !severity || i.severity === severity
          )
        })
      }
    }

    res.json({
      success: true,
      data: inconsistencies.filter((i: any) => i.issues.length > 0),
      summary: {
        totalContacts: inconsistencies.length,
        totalIssues: inconsistencies.reduce((sum: number, i: any) => sum + i.issues.length, 0)
      }
    })

  } catch (error: any) {
    console.error('❌ Erro get inconsistencies:', error)
    res.status(500).json({
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
    const { daysOld = 7, limit = 20 } = req.body

    console.log(`🔧 Refresh old syncs (${daysOld} days, limit ${limit})`)

    const oldContacts = await (ACContactState as any).findOldSyncs(daysOld).limit(limit)
    const emails = oldContacts.map((c: any) => c.email)

    const results = await contactTagReader.syncMultipleUsersFromAC(emails)

    res.json({
      success: true,
      data: results,
      summary: {
        processed: results.length,
        updated: results.filter(r => r.action === 'synced').length
      }
    })

  } catch (error: any) {
    console.error('❌ Erro refresh old syncs:', error)
    res.status(500).json({
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
    const { olderThanDays = 30 } = req.body

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

  } catch (error: any) {
    console.error('❌ Erro clear AC cache:', error)
    res.status(500).json({
      success: false,
      error: error.message || 'Erro interno do servidor'
    })
  }
}

