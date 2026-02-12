// src/controllers/guru.webhook.controller.ts - Controller para webhooks da Guru
import { Request, Response } from 'express'
import User from '../models/user'
import GuruWebhook from '../models/GuruWebhook'
import UserProduct from '../models/UserProduct'
import { GuruWebhookPayload, GuruSubscriptionStatus } from '../types/guru.types'

// Status da Guru que indicam cancelamento
const GURU_CANCELED_STATUSES = ['canceled', 'expired', 'refunded']

// Token para validar webhooks (guardado em env vars)
const GURU_ACCOUNT_TOKEN = process.env.GURU_ACCOUNT_TOKEN

// ═══════════════════════════════════════════════════════════
// WEBHOOK PRINCIPAL
// ═══════════════════════════════════════════════════════════

/**
 * Receber e processar webhooks da Guru
 * POST /guru/webhook
 */
export const handleGuruWebhook = async (req: Request, res: Response) => {
  const startTime = Date.now()
  const requestId = (req.headers['x-request-id'] as string) || req.body.request_id || `guru_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

  console.log(`\n💰 [GURU WEBHOOK] Recebido - RequestID: ${requestId}`)

  try {
    // ═══════════════════════════════════════════════════════════
    // NORMALIZAR PAYLOAD (aceitar formato real da Guru OU formato simples)
    // ═══════════════════════════════════════════════════════════
    let rawPayload = req.body

    // Se o webhook veio da Guru (com estrutura payload), extrair os dados
    if (req.body.payload) {
      const p = req.body.payload

      // Mapear last_status para evento válido
      const statusToEvent: Record<string, string> = {
        'active': 'subscription.activated',
        'canceled': 'subscription.canceled',
        'expired': 'subscription.expired',
        'pastdue': 'subscription.pastdue',
        'refunded': 'subscription.refunded',
        'suspended': 'subscription.suspended',
        'pending': 'subscription.created'
      }

      const event = statusToEvent[p.last_status] || 'subscription.updated'

      rawPayload = {
        api_token: p.api_token,
        email: p.subscriber?.email || p.last_transaction?.contact?.email,
        name: p.subscriber?.name || p.last_transaction?.contact?.name,
        subscription_code: p.subscription_code || p.id,
        guru_contact_id: p.subscriber?.id || p.last_transaction?.contact?.id,
        status: p.last_status,
        event,
        product_id: p.product?.id,
        offer_id: p.product?.offer?.id,
        updated_at: p.dates?.last_status_at,
        next_cycle_at: p.dates?.next_cycle_at,
        value: p.product?.offer?.value || p.next_cycle_value,
        currency: p.payment?.currency || 'EUR',
        phone: p.subscriber?.phone_number || p.last_transaction?.contact?.phone_number,
        payment_url: p.last_transaction?.checkout_url
      }
    }

    const payload = rawPayload as GuruWebhookPayload

    // ═══════════════════════════════════════════════════════════
    // 1. VALIDAR API TOKEN
    // ═══════════════════════════════════════════════════════════
    if (!GURU_ACCOUNT_TOKEN) {
      console.error('❌ [GURU] GURU_ACCOUNT_TOKEN não configurado')
      return res.status(500).json({
        success: false,
        message: 'Configuração do servidor incompleta'
      })
    }

    if (!payload.api_token || payload.api_token !== GURU_ACCOUNT_TOKEN) {
      console.error('❌ [GURU] Token inválido')
      return res.status(401).json({
        success: false,
        message: 'Token inválido'
      })
    }

    // ═══════════════════════════════════════════════════════════
    // 2. VERIFICAR IDEMPOTÊNCIA
    // ═══════════════════════════════════════════════════════════
    const existingWebhook = await GuruWebhook.findOne({ requestId })
    if (existingWebhook) {
      console.log(`⚠️ [GURU] Webhook duplicado ignorado: ${requestId}`)
      return res.status(200).json({
        success: true,
        message: 'Webhook já processado',
        duplicate: true,
        requestId
      })
    }

    // ═══════════════════════════════════════════════════════════
    // 3. GUARDAR WEBHOOK RAW
    // ═══════════════════════════════════════════════════════════
    // Detectar origem: se veio com estrutura 'payload', é da Guru; caso contrário, é manual
    const webhookSource = req.body.payload ? 'guru' : 'manual'

    const webhookDoc = await GuruWebhook.create({
      requestId,
      subscriptionCode: payload.subscription_code,
      email: payload.email?.toLowerCase().trim(),
      guruContactId: payload.guru_contact_id,
      event: payload.event,
      status: payload.status,
      source: webhookSource,
      rawData: payload,
      processed: false
    })

    console.log(`📥 [GURU] Webhook guardado: ${payload.event} - ${payload.email}`)

    // ═══════════════════════════════════════════════════════════
    // 4. VALIDAR DADOS OBRIGATÓRIOS
    // ═══════════════════════════════════════════════════════════
    const email = payload.email?.toLowerCase().trim()
    if (!email) {
      await GuruWebhook.findByIdAndUpdate(webhookDoc._id, {
        processed: true,
        processedAt: new Date(),
        error: 'Email ausente no payload'
      })
      console.warn('⚠️ [GURU] Webhook sem email - ignorado')
      return res.status(200).json({
        success: true,
        message: 'Webhook processado (sem email)',
        requestId
      })
    }

    // ═══════════════════════════════════════════════════════════
    // 5. ENCONTRAR OU CRIAR USER
    // ═══════════════════════════════════════════════════════════
    let user = await User.findOne({ email })
    const isNewUser = !user

    if (!user) {
      // Criar novo user com dados da Guru
      user = new User({
        email,
        name: payload.name || email.split('@')[0],
        guru: {
          guruContactId: payload.guru_contact_id,
          subscriptionCode: payload.subscription_code,
          status: payload.status,
          updatedAt: payload.updated_at ? new Date(payload.updated_at) : new Date(),
          nextCycleAt: payload.next_cycle_at ? new Date(payload.next_cycle_at) : undefined,
          offerId: payload.offer_id,
          productId: payload.product_id,
          paymentUrl: payload.payment_url,
          lastSyncAt: new Date(),
          syncVersion: '1.0',
          lastWebhookAt: new Date()
        },
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          sources: {
            guru: { lastSync: new Date(), version: '1.0' }
          }
        }
      })

      await user.save()
      console.log(`✅ [GURU] Novo user criado: ${email}`)
    } else {
      // Atualizar user existente
      user.guru = {
        guruContactId: payload.guru_contact_id,
        subscriptionCode: payload.subscription_code,
        status: payload.status as GuruSubscriptionStatus,
        updatedAt: payload.updated_at ? new Date(payload.updated_at) : new Date(),
        nextCycleAt: payload.next_cycle_at ? new Date(payload.next_cycle_at) : undefined,
        offerId: payload.offer_id,
        productId: payload.product_id,
        paymentUrl: payload.payment_url,
        lastSyncAt: new Date(),
        syncVersion: '1.0',
        lastWebhookAt: new Date()
      }

      // Atualizar metadata
      if (!user.metadata) {
        user.metadata = {
          createdAt: new Date(),
          updatedAt: new Date(),
          sources: {}
        }
      }
      user.metadata.sources = user.metadata.sources || {}
      user.metadata.sources.guru = { lastSync: new Date(), version: '1.0' }
      user.metadata.updatedAt = new Date()

      // Atualizar nome se fornecido e user não tinha nome
      if (payload.name && (!user.name || user.name === email.split('@')[0])) {
        user.name = payload.name
      }

      await user.save()
      console.log(`✅ [GURU] User atualizado: ${email}`)
    }

    // ═══════════════════════════════════════════════════════════
    // 6. VERIFICAR SE DEVE MARCAR USERPRODUCT PARA INATIVAR
    // ═══════════════════════════════════════════════════════════
    let markedForInactivation = false

    if (GURU_CANCELED_STATUSES.includes(payload.status)) {
      // Buscar UserProducts do CursEduca (Clareza) que estejam ACTIVE
      const userProductsToMark = await UserProduct.find({
        userId: user._id,
        platform: 'curseduca',
        status: 'ACTIVE'
      })

      if (userProductsToMark.length > 0) {
        // Marcar como PARA_INATIVAR
        await UserProduct.updateMany(
          {
            userId: user._id,
            platform: 'curseduca',
            status: 'ACTIVE'
          },
          {
            $set: {
              status: 'PARA_INATIVAR',
              'metadata.markedForInactivationAt': new Date(),
              'metadata.markedForInactivationReason': `Guru status: ${payload.status}`,
              'metadata.guruWebhookId': requestId
            }
          }
        )

        markedForInactivation = true
        console.log(`⚠️ [GURU] ${userProductsToMark.length} UserProduct(s) marcado(s) PARA_INATIVAR: ${email}`)
      }
    }

    // ═══════════════════════════════════════════════════════════
    // 7. MARCAR WEBHOOK COMO PROCESSADO
    // ═══════════════════════════════════════════════════════════
    await GuruWebhook.findByIdAndUpdate(webhookDoc._id, {
      processed: true,
      processedAt: new Date()
    })

    const duration = Date.now() - startTime
    console.log(`✅ [GURU] Webhook processado em ${duration}ms`)

    return res.status(200).json({
      success: true,
      message: isNewUser ? 'Novo utilizador criado' : 'Utilizador atualizado',
      requestId,
      email,
      event: payload.event,
      status: payload.status,
      markedForInactivation,
      duration
    })

  } catch (error: any) {
    const duration = Date.now() - startTime
    console.error(`❌ [GURU] Erro no webhook (${duration}ms):`, error.message)

    // Tentar guardar erro no webhook
    try {
      await GuruWebhook.findOneAndUpdate(
        { requestId },
        {
          error: error.message,
          processed: true,
          processedAt: new Date()
        }
      )
    } catch (e) {
      console.error('❌ [GURU] Erro ao guardar falha:', e)
    }

    return res.status(500).json({
      success: false,
      message: error.message,
      requestId
    })
  }
}

// ═══════════════════════════════════════════════════════════
// LISTAR WEBHOOKS (DASHBOARD)
// ═══════════════════════════════════════════════════════════

/**
 * Listar webhooks recebidos
 * GET /guru/webhooks
 */
export const listGuruWebhooks = async (req: Request, res: Response) => {
  try {
    const {
      page = 1,
      limit = 10000,
      email,
      processed,
      status,
      event,
      source,
      year,
      month
    } = req.query

    const query: any = {}

    // Filtros
    if (email) {
      query.email = (email as string).toLowerCase().trim()
    }
    if (processed !== undefined) {
      query.processed = processed === 'true'
    }
    if (status) {
      query.status = status
    }
    if (event) {
      query.event = event
    }
    if (source) {
      query.source = source
    }

    // Filtro por ano/mês
    if (year && month) {
      const startDate = new Date(Number(year), Number(month) - 1, 1)
      const endDate = new Date(Number(year), Number(month), 0, 23, 59, 59, 999)
      query.receivedAt = { $gte: startDate, $lte: endDate }
    } else if (year) {
      const startDate = new Date(Number(year), 0, 1)
      const endDate = new Date(Number(year), 11, 31, 23, 59, 59, 999)
      query.receivedAt = { $gte: startDate, $lte: endDate }
    }

    const [webhooks, total] = await Promise.all([
      GuruWebhook
        .find(query)
        .sort({ receivedAt: -1 })
        .limit(Number(limit))
        .skip((Number(page) - 1) * Number(limit))
        .lean(),
      GuruWebhook.countDocuments(query)
    ])

    return res.json({
      success: true,
      webhooks,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    })

  } catch (error: any) {
    console.error('❌ [GURU] Erro ao listar webhooks:', error.message)
    return res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

/**
 * Listar webhooks agrupados por mês
 * GET /guru/webhooks/grouped-by-month
 */
export const listWebhooksGroupedByMonth = async (req: Request, res: Response) => {
  try {
    const { source } = req.query

    const matchQuery: any = {}
    if (source) {
      matchQuery.source = source
    }

    // Agrupar por ano e mês
    const grouped = await GuruWebhook.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: {
            year: { $year: '$receivedAt' },
            month: { $month: '$receivedAt' },
            source: '$source'
          },
          count: { $sum: 1 },
          processed: {
            $sum: { $cond: [{ $eq: ['$processed', true] }, 1, 0] }
          },
          failed: {
            $sum: { $cond: [{ $ne: ['$error', null] }, 1, 0] }
          }
        }
      },
      { $sort: { '_id.year': -1, '_id.month': -1 } }
    ])

    // Reorganizar dados por ano > mês > origem
    const byYear: Record<number, any> = {}

    grouped.forEach((item: any) => {
      const year = item._id.year
      const month = item._id.month
      const source = item._id.source

      if (!byYear[year]) {
        byYear[year] = {}
      }
      if (!byYear[year][month]) {
        byYear[year][month] = { guru: null, manual: null, total: 0 }
      }

      byYear[year][month][source] = {
        count: item.count,
        processed: item.processed,
        failed: item.failed
      }
      byYear[year][month].total += item.count
    })

    return res.json({
      success: true,
      groupedByMonth: byYear
    })

  } catch (error: any) {
    console.error('❌ [GURU] Erro ao agrupar webhooks:', error.message)
    return res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

// ═══════════════════════════════════════════════════════════
// ESTATÍSTICAS (DASHBOARD)
// ═══════════════════════════════════════════════════════════

/**
 * Obter estatísticas dos webhooks e subscrições
 * GET /guru/stats
 */
export const getGuruStats = async (req: Request, res: Response) => {
  try {
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    // Estatísticas de webhooks
    const [
      webhookTotal,
      webhooksToday,
      webhooksProcessed,
      webhooksFailed
    ] = await Promise.all([
      GuruWebhook.countDocuments(),
      GuruWebhook.countDocuments({ receivedAt: { $gte: todayStart } }),
      GuruWebhook.countDocuments({ processed: true, error: { $exists: false } }),
      GuruWebhook.countDocuments({ error: { $exists: true, $ne: null } })
    ])

    // Estatísticas de subscrições (users com guru)
    const subscriptionStats = await User.aggregate([
      { $match: { guru: { $exists: true } } },
      {
        $group: {
          _id: '$guru.status',
          count: { $sum: 1 }
        }
      }
    ])

    const byStatus = subscriptionStats.reduce((acc: any, item: any) => {
      acc[item._id] = item.count
      return acc
    }, {
      active: 0,
      pastdue: 0,
      canceled: 0,
      expired: 0,
      pending: 0,
      refunded: 0,
      suspended: 0
    })

    const totalSubscriptions = Object.values(byStatus).reduce((sum: number, val: any) => sum + val, 0)

    // Último webhook
    const lastWebhook = await GuruWebhook.findOne().sort({ receivedAt: -1 }).lean()

    return res.json({
      success: true,
      stats: {
        subscriptions: {
          total: totalSubscriptions,
          byStatus
        },
        webhooks: {
          total: webhookTotal,
          today: webhooksToday,
          processed: webhooksProcessed,
          failed: webhooksFailed
        },
        lastWebhookAt: lastWebhook?.receivedAt || null
      }
    })

  } catch (error: any) {
    console.error('❌ [GURU] Erro ao obter estatísticas:', error.message)
    return res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

// ═══════════════════════════════════════════════════════════
// DEBUG (VERIFICAR TOKEN)
// ═══════════════════════════════════════════════════════════

/**
 * Endpoint de debug para verificar configuração do token
 * GET /guru/debug/token
 */
export const debugToken = async (req: Request, res: Response) => {
  try {
    const tokenFromEnv = GURU_ACCOUNT_TOKEN
    const tokenLength = tokenFromEnv ? tokenFromEnv.length : 0
    const hasQuotes = tokenFromEnv ? tokenFromEnv.startsWith('"') || tokenFromEnv.startsWith("'") : false

    return res.json({
      success: true,
      debug: {
        hasToken: !!tokenFromEnv,
        tokenLength,
        hasQuotes,
        firstChar: tokenFromEnv ? tokenFromEnv[0] : null,
        lastChar: tokenFromEnv ? tokenFromEnv[tokenFromEnv.length - 1] : null,
        // Mostrar apenas primeiros e últimos 4 caracteres (segurança)
        preview: tokenFromEnv
          ? `${tokenFromEnv.substring(0, 4)}...${tokenFromEnv.substring(tokenFromEnv.length - 4)}`
          : null
      }
    })
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

// ═══════════════════════════════════════════════════════════
// REPROCESSAR WEBHOOK (ADMIN)
// ═══════════════════════════════════════════════════════════

/**
 * Reprocessar um webhook falhado
 * POST /guru/webhooks/:id/reprocess
 */
export const reprocessWebhook = async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const webhook = await GuruWebhook.findById(id)
    if (!webhook) {
      return res.status(404).json({
        success: false,
        message: 'Webhook não encontrado'
      })
    }

    // Criar nova request simulada
    const mockReq = {
      body: webhook.rawData,
      headers: { 'x-request-id': `reprocess_${webhook.requestId}` }
    } as Request

    // Processar novamente
    await handleGuruWebhook(mockReq, res)

  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

// ═══════════════════════════════════════════════════════════
// MIGRAÇÃO DE WEBHOOKS ANTIGOS
// ═══════════════════════════════════════════════════════════

/**
 * Migrar webhooks antigos sem campo 'source' para 'manual'
 * POST /guru/webhooks/migrate-source
 */
export const migrateWebhookSource = async (req: Request, res: Response) => {
  try {
    console.log('🔄 [GURU] Iniciando migração de webhooks antigos...')

    // Buscar todos os webhooks que não têm o campo 'source' definido
    // ou que têm source como null/undefined
    const webhooksToMigrate = await GuruWebhook.find({
      $or: [
        { source: { $exists: false } },
        { source: null }
      ]
    })

    console.log(`   📊 Webhooks encontrados para migração: ${webhooksToMigrate.length}`)

    if (webhooksToMigrate.length === 0) {
      return res.json({
        success: true,
        message: 'Nenhum webhook precisa de migração',
        migrated: 0
      })
    }

    // Atualizar todos para source: 'manual'
    const result = await GuruWebhook.updateMany(
      {
        $or: [
          { source: { $exists: false } },
          { source: null }
        ]
      },
      {
        $set: { source: 'manual' }
      }
    )

    console.log(`   ✅ Webhooks migrados: ${result.modifiedCount}`)

    return res.json({
      success: true,
      message: `${result.modifiedCount} webhooks migrados para source: 'manual'`,
      migrated: result.modifiedCount,
      matched: result.matchedCount
    })

  } catch (error: any) {
    console.error('❌ [GURU] Erro ao migrar webhooks:', error.message)
    return res.status(500).json({
      success: false,
      message: error.message
    })
  }
}
