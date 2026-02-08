// src/controllers/guru.sync.controller.ts - Controller para sincronização com Guru (APENAS LEITURA)
import { Request, Response } from 'express'
import guruSyncService from '../services/guru/guruSync.service'
import User from '../models/user'

// ═══════════════════════════════════════════════════════════
// SYNC COMPLETO
// ═══════════════════════════════════════════════════════════

/**
 * Sincronizar TODAS as subscrições da Guru
 * GET /guru/sync/all
 *
 * IMPORTANTE: Esta função APENAS LÊ da Guru.
 * Nunca escreve, atualiza ou modifica dados na plataforma Guru.
 * Todos os dados são guardados apenas na nossa BD.
 */
export const syncAllFromGuru = async (req: Request, res: Response) => {
  console.log('\n💰 [GURU SYNC] Pedido de sincronização completa recebido')

  try {
    // Verificar se já está a decorrer um sync
    const lockKey = 'guru_sync_running'
    const globalAny = global as any
    if (globalAny[lockKey]) {
      return res.status(409).json({
        success: false,
        message: 'Já existe uma sincronização em curso. Aguarde.'
      })
    }

    // Marcar como em execução
    globalAny[lockKey] = true

    try {
      const result = await guruSyncService.syncAllSubscriptions()

      return res.json({
        success: true,
        message: 'Sincronização completa',
        result: {
          total: result.total,
          created: result.created,
          updated: result.updated,
          skipped: result.skipped,
          errors: result.errors
        }
      })

    } finally {
      // Libertar lock
      globalAny[lockKey] = false
    }

  } catch (error: any) {
    console.error('❌ [GURU SYNC] Erro na sincronização:', error.message)
    return res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

/**
 * Sincronizar um email específico (útil para debug ou sync individual)
 * GET /guru/sync/email/:email
 */
export const syncEmailFromGuru = async (req: Request, res: Response) => {
  const { email } = req.params

  if (!email) {
    return res.status(400).json({
      success: false,
      message: 'Email é obrigatório'
    })
  }

  console.log(`\n💰 [GURU SYNC] Sincronizando email: ${email}`)

  try {
    const result = await guruSyncService.checkEmailInGuru(email.toLowerCase().trim())

    if (!result.exists) {
      return res.status(404).json({
        success: false,
        message: 'Email não encontrado na Guru',
        email
      })
    }

    if (!result.subscription) {
      return res.json({
        success: true,
        message: 'Contacto existe na Guru mas sem subscrições ativas',
        email,
        hasSubscription: false
      })
    }

    // Guardar na BD
    const saveResult = await guruSyncService.saveSubscriptionToDb(result.subscription)

    return res.json({
      success: true,
      message: `Email sincronizado (${saveResult.action})`,
      email,
      action: saveResult.action,
      subscription: {
        code: result.subscription.subscription_code,
        status: result.subscription.last_status,
        product: result.subscription.product?.name,
        value: result.subscription.product?.offer?.value
      }
    })

  } catch (error: any) {
    console.error(`❌ [GURU SYNC] Erro ao sincronizar ${email}:`, error.message)
    return res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

// ═══════════════════════════════════════════════════════════
// ESTATÍSTICAS
// ═══════════════════════════════════════════════════════════

/**
 * Obter estatísticas de sync
 * GET /guru/sync/stats
 */
export const getSyncStats = async (req: Request, res: Response) => {
  try {
    // Contar users com guru
    const usersWithGuru = await User.countDocuments({ guru: { $exists: true } })

    // Contar por status
    const byStatus = await User.aggregate([
      { $match: { guru: { $exists: true } } },
      { $group: { _id: '$guru.status', count: { $sum: 1 } } }
    ])

    // Último sync
    const lastSynced = await User.findOne({ guru: { $exists: true } })
      .sort({ 'guru.lastSyncAt': -1 })
      .select('guru.lastSyncAt')
      .lean()

    // Contar por produto
    const byProduct = await User.aggregate([
      { $match: { guru: { $exists: true } } },
      { $group: { _id: '$guru.productId', count: { $sum: 1 } } }
    ])

    const statusCounts = byStatus.reduce((acc: any, item: any) => {
      acc[item._id || 'unknown'] = item.count
      return acc
    }, {})

    const productCounts = byProduct.reduce((acc: any, item: any) => {
      acc[item._id || 'unknown'] = item.count
      return acc
    }, {})

    return res.json({
      success: true,
      stats: {
        totalUsersWithGuru: usersWithGuru,
        byStatus: statusCounts,
        byProduct: productCounts,
        lastSyncAt: lastSynced?.guru?.lastSyncAt || null
      }
    })

  } catch (error: any) {
    console.error('❌ [GURU SYNC] Erro ao obter stats:', error.message)
    return res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

// ═══════════════════════════════════════════════════════════
// PREVIEW (VER O QUE SERIA SINCRONIZADO SEM GUARDAR)
// ═══════════════════════════════════════════════════════════

/**
 * Preview do sync (não guarda, apenas mostra o que seria importado)
 * GET /guru/sync/preview
 */
export const previewSync = async (req: Request, res: Response) => {
  console.log('\n💰 [GURU SYNC] Executando preview (não guarda dados)')

  try {
    const limit = Number(req.query.limit) || 10

    // Buscar apenas algumas subscrições para preview
    const subscriptions = await guruSyncService.fetchAllSubscriptions({ limit })

    const preview = subscriptions.map(sub => ({
      email: sub.subscriber?.email,
      name: sub.subscriber?.name,
      subscriptionCode: sub.subscription_code,
      status: sub.last_status,
      product: {
        id: sub.product?.id,
        name: sub.product?.name,
        offer: sub.product?.offer?.name,
        value: sub.product?.offer?.value
      },
      dates: {
        started: sub.dates?.started_at,
        nextCycle: sub.dates?.next_cycle_at,
        canceled: sub.dates?.canceled_at
      }
    }))

    return res.json({
      success: true,
      message: `Preview de ${preview.length} subscrições (limite: ${limit})`,
      preview,
      note: 'Este é apenas um preview. Nenhum dado foi guardado. Use GET /guru/sync/all para sincronizar.'
    })

  } catch (error: any) {
    console.error('❌ [GURU SYNC] Erro no preview:', error.message)
    return res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

// ═══════════════════════════════════════════════════════════
// LISTAR USERS COM GURU (PARA DASHBOARD)
// ═══════════════════════════════════════════════════════════

/**
 * Listar todos os users com dados Guru
 * GET /guru/sync/users
 */
export const listUsersWithGuru = async (req: Request, res: Response) => {
  try {
    const {
      page = 1,
      limit = 50,
      status,
      productId
    } = req.query

    const query: any = { guru: { $exists: true } }

    if (status) {
      query['guru.status'] = status
    }
    if (productId) {
      query['guru.productId'] = productId
    }

    const [users, total] = await Promise.all([
      User.find(query)
        .select('email name guru curseduca hotmart')
        .sort({ 'guru.updatedAt': -1 })
        .limit(Number(limit))
        .skip((Number(page) - 1) * Number(limit))
        .lean(),
      User.countDocuments(query)
    ])

    // Enriquecer com info de cruzamento
    const enrichedUsers = users.map(user => ({
      email: user.email,
      name: user.name,
      guru: {
        status: user.guru?.status,
        subscriptionCode: user.guru?.subscriptionCode,
        productId: user.guru?.productId,
        offerId: user.guru?.offerId,
        nextCycleAt: user.guru?.nextCycleAt,
        updatedAt: user.guru?.updatedAt,
        lastSyncAt: user.guru?.lastSyncAt
      },
      // Info de cruzamento
      hasCurseduca: !!user.curseduca,
      hasHotmart: !!user.hotmart,
      curseducaStatus: user.curseduca?.platformData?.situation,
      hotmartStatus: user.hotmart?.status
    }))

    return res.json({
      success: true,
      users: enrichedUsers,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    })

  } catch (error: any) {
    console.error('❌ [GURU SYNC] Erro ao listar users:', error.message)
    return res.status(500).json({
      success: false,
      message: error.message
    })
  }
}
