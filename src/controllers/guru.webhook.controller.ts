// src/controllers/guru.webhook.controller.ts - Controller para webhooks da Guru
import { NextFunction, Request, Response } from 'express'
import { internalError } from '../security/errorHandling'
import User from '../models/user'
import GuruWebhook from '../models/GuruWebhook'
import UserProduct from '../models/UserProduct'
import { GuruWebhookPayload, GuruSubscriptionStatus } from '../types/guru.types'
import { getGuruAccountToken } from '../services/requestDrivenRuntimeConfig'

export { listGuruWebhooks } from './guruWebhookList.controller'
export { debugToken, migrateWebhookSource } from './guruWebhookAdmin.controller'

// Status da Guru que indicam cancelamento
const GURU_CANCELED_STATUSES = ['canceled', 'expired', 'refunded']

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}


type GuruWebhookRequest = Pick<Request, 'body' | 'headers'>

// ═══════════════════════════════════════════════════════════
// WEBHOOK PRINCIPAL
// ═══════════════════════════════════════════════════════════

/**
 * Receber e processar webhooks da Guru
 * POST /guru/webhook
 */
export const handleGuruWebhook = async (req: GuruWebhookRequest, res: Response, next: NextFunction) => {
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
    const guruAccountToken = getGuruAccountToken()

    if (!payload.api_token || payload.api_token !== guruAccountToken) {
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
      // Atualizar user existente — usar updateOne para não tocar em campos de outras plataformas
      const updateFields: Record<string, any> = {
        'guru.guruContactId': payload.guru_contact_id,
        'guru.subscriptionCode': payload.subscription_code,
        'guru.status': payload.status,
        'guru.updatedAt': payload.updated_at ? new Date(payload.updated_at) : new Date(),
        'guru.nextCycleAt': payload.next_cycle_at ? new Date(payload.next_cycle_at) : undefined,
        'guru.offerId': payload.offer_id,
        'guru.productId': payload.product_id,
        'guru.paymentUrl': payload.payment_url,
        'guru.lastSyncAt': new Date(),
        'guru.syncVersion': '1.0',
        'guru.lastWebhookAt': new Date(),
        'metadata.sources.guru': { lastSync: new Date(), version: '1.0' },
        'metadata.updatedAt': new Date()
      }

      // Atualizar nome só se user não tinha nome próprio
      if (payload.name && (!user.name || user.name === email.split('@')[0])) {
        updateFields['name'] = payload.name
      }

      await User.updateOne(
        { _id: user._id },
        { $set: updateFields },
        { runValidators: false } // Não validar campos de outras plataformas (Hotmart, etc.)
      )
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

  } catch (error: unknown) {
    // Preservar a compensação antes de entregar a causa original ao handler final.
    try {
      await GuruWebhook.findOneAndUpdate(
        { requestId },
        {
          error: errorDetail(error),
          processed: true,
          processedAt: new Date()
        }
      )
    } catch (compensationError) {
      console.error('❌ [GURU] Erro ao guardar falha:', compensationError)
    }

    return next(internalError('Erro ao processar webhook Guru', 'GURU_WEBHOOK_PROCESSING_FAILED', error))
  }
}

// ═══════════════════════════════════════════════════════════
// LISTAR WEBHOOKS (DASHBOARD)
// ═══════════════════════════════════════════════════════════

/**
 * Listar webhooks agrupados por mês
 * GET /guru/webhooks/grouped-by-month
 */
export const listWebhooksGroupedByMonth = async (req: Request, res: Response, next: NextFunction) => {
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

  } catch (error: unknown) {
    return next(internalError('Erro ao agrupar webhooks Guru', 'GURU_WEBHOOK_GROUPING_FAILED', error))
  }
}

// ═══════════════════════════════════════════════════════════
// ESTATÍSTICAS (DASHBOARD)
// ═══════════════════════════════════════════════════════════

/**
 * Obter estatísticas dos webhooks e subscrições
 * GET /guru/stats
 */
export const getGuruStats = async (req: Request, res: Response, next: NextFunction) => {
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

  } catch (error: unknown) {
    return next(internalError('Erro ao obter estatísticas Guru', 'GURU_WEBHOOK_STATS_FAILED', error))
  }
}

// ═══════════════════════════════════════════════════════════
// DEBUG (VERIFICAR TOKEN)
// ═══════════════════════════════════════════════════════════

/**
 * Endpoint de debug para verificar configuração do token
 * GET /guru/debug/token
 */


// ═══════════════════════════════════════════════════════════
// REPROCESSAR WEBHOOK (ADMIN)
// ═══════════════════════════════════════════════════════════

/**
 * Reprocessar um webhook falhado
 * POST /guru/webhooks/:id/reprocess
 */
export const reprocessWebhook = async (req: Request, res: Response, next: NextFunction) => {
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
    }

    // Processar novamente
    await handleGuruWebhook(mockReq, res, next)

  } catch (error: unknown) {
    return next(internalError('Erro ao reprocessar webhook Guru', 'GURU_WEBHOOK_REPROCESS_FAILED', error))
  }
}

// ═══════════════════════════════════════════════════════════
// MIGRAÇÃO DE WEBHOOKS ANTIGOS
// ═══════════════════════════════════════════════════════════

/**
 * Migrar webhooks antigos sem campo 'source' para 'manual'
 * POST /guru/webhooks/migrate-source
 */
