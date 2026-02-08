// src/controllers/guru.webhook.controller.ts - Controller para webhooks da Guru
import { Request, Response } from 'express'
import User from '../models/user'
import GuruWebhook from '../models/GuruWebhook'
import { GuruWebhookPayload, GuruSubscriptionStatus } from '../types/guru.types'

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
  const requestId = (req.headers['x-request-id'] as string) || `guru_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

  console.log(`\n💰 [GURU WEBHOOK] Recebido - RequestID: ${requestId}`)

  try {
    const payload = req.body as GuruWebhookPayload

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
    const webhookDoc = await GuruWebhook.create({
      requestId,
      subscriptionCode: payload.subscription_code,
      email: payload.email?.toLowerCase().trim(),
      guruContactId: payload.guru_contact_id,
      event: payload.event,
      status: payload.status,
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
    // 6. MARCAR WEBHOOK COMO PROCESSADO
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
      event
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
