// src/controllers/guru.sso.controller.ts - Controller para SSO MyOrders da Guru
import { Request, Response } from 'express'
import axios from 'axios'
import User from '../models/user'
import { GURU_SSO_ALLOWED_STATUSES } from '../types/guru.types'

// Configuração da API Guru
// NOTA: A API v2 é a atual, v1 foi descontinuada
// Endpoint SSO MyOrders: POST /api/v2/myorders/auth/sso/{email}
const GURU_API_BASE = 'https://digitalmanager.guru/api/v2'
const GURU_USER_TOKEN = process.env.GURU_USER_TOKEN

// ═══════════════════════════════════════════════════════════
// SSO MYORDERS
// ═══════════════════════════════════════════════════════════

/**
 * Redirecionar utilizador para o MyOrders via SSO
 * GET /guru/myorders?email=xxx
 *
 * Fluxo:
 * 1. Receber email (do link no Curseduca)
 * 2. Validar que email existe na BD e tem subscrição Guru
 * 3. Verificar status permitido (active, pastdue)
 * 4. Chamar API Guru para gerar SSO
 * 5. Redirecionar (302) para URL retornada
 */
export const ssoMyOrders = async (req: Request, res: Response) => {
  const startTime = Date.now()

  try {
    const { email } = req.query

    // ═══════════════════════════════════════════════════════════
    // 1. VALIDAR EMAIL
    // ═══════════════════════════════════════════════════════════
    if (!email || typeof email !== 'string') {
      console.warn('⚠️ [GURU SSO] Tentativa sem email')
      return res.status(400).json({
        success: false,
        message: 'Email é obrigatório'
      })
    }

    const normalizedEmail = email.toLowerCase().trim()
    console.log(`🔐 [GURU SSO] Pedido de SSO para: ${normalizedEmail}`)

    // ═══════════════════════════════════════════════════════════
    // 2. VALIDAR USER NA BD
    // ═══════════════════════════════════════════════════════════
    const user = await User.findOne({ email: normalizedEmail })

    if (!user) {
      console.warn(`⚠️ [GURU SSO] User não encontrado: ${normalizedEmail}`)
      return res.status(404).json({
        success: false,
        message: 'Utilizador não encontrado'
      })
    }

    if (!user.guru) {
      console.warn(`⚠️ [GURU SSO] User sem subscrição Guru: ${normalizedEmail}`)
      return res.status(403).json({
        success: false,
        message: 'Utilizador não tem subscrição Guru'
      })
    }

    // ═══════════════════════════════════════════════════════════
    // 3. VERIFICAR STATUS PERMITIDO
    // ═══════════════════════════════════════════════════════════
    if (!GURU_SSO_ALLOWED_STATUSES.includes(user.guru.status)) {
      console.warn(`⚠️ [GURU SSO] Status não permite SSO: ${user.guru.status} - ${normalizedEmail}`)
      return res.status(403).json({
        success: false,
        message: `Status de subscrição não permite acesso: ${user.guru.status}`,
        status: user.guru.status,
        allowedStatuses: GURU_SSO_ALLOWED_STATUSES
      })
    }

    // ═══════════════════════════════════════════════════════════
    // 4. VERIFICAR CONFIGURAÇÃO
    // ═══════════════════════════════════════════════════════════
    if (!GURU_USER_TOKEN) {
      console.error('❌ [GURU SSO] GURU_USER_TOKEN não configurado')
      return res.status(500).json({
        success: false,
        message: 'Configuração SSO incompleta'
      })
    }

    // ═══════════════════════════════════════════════════════════
    // 5. CHAMAR API GURU PARA SSO
    // ═══════════════════════════════════════════════════════════
    // Endpoint correto (v2): POST /api/v2/myorders/auth/sso/{email}
    const ssoEndpoint = `${GURU_API_BASE}/myorders/auth/sso/${encodeURIComponent(normalizedEmail)}`
    console.log(`📡 [GURU SSO] Chamando API Guru: ${ssoEndpoint}`)

    const ssoResponse = await axios.post(
      ssoEndpoint,
      {},
      {
        headers: {
          'Authorization': `Bearer ${GURU_USER_TOKEN}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    )

    // A API Guru retorna 'redirect_url' (não 'url')
    const ssoUrl = ssoResponse.data?.redirect_url || ssoResponse.data?.url

    if (!ssoUrl) {
      console.error('❌ [GURU SSO] URL não retornada pela API:', ssoResponse.data)
      return res.status(500).json({
        success: false,
        message: 'Erro ao gerar link SSO'
      })
    }

    console.log(`✅ [GURU SSO] URL obtida: ${ssoUrl}`)

    // ═══════════════════════════════════════════════════════════
    // 6. REDIRECIONAR
    // ═══════════════════════════════════════════════════════════
    const duration = Date.now() - startTime
    console.log(`✅ [GURU SSO] Redirecionando ${normalizedEmail} (${duration}ms)`)

    return res.redirect(302, ssoUrl)

  } catch (error: any) {
    const duration = Date.now() - startTime
    console.error(`❌ [GURU SSO] Erro (${duration}ms):`, error.response?.data || error.message)

    // Tratar erros específicos da API Guru
    if (error.response?.status === 404) {
      return res.status(404).json({
        success: false,
        message: 'Email não encontrado na plataforma Guru'
      })
    }

    if (error.response?.status === 401) {
      return res.status(500).json({
        success: false,
        message: 'Erro de autenticação com a plataforma Guru'
      })
    }

    if (error.code === 'ECONNABORTED') {
      return res.status(504).json({
        success: false,
        message: 'Timeout na comunicação com a plataforma Guru'
      })
    }

    return res.status(500).json({
      success: false,
      message: 'Erro ao processar SSO'
    })
  }
}

// ═══════════════════════════════════════════════════════════
// VERIFICAR STATUS
// ═══════════════════════════════════════════════════════════

/**
 * Verificar status de subscrição de um email
 * GET /guru/status?email=xxx
 */
export const getSubscriptionStatus = async (req: Request, res: Response) => {
  try {
    const { email } = req.query

    if (!email || typeof email !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Email é obrigatório'
      })
    }

    const normalizedEmail = email.toLowerCase().trim()

    const user = await User.findOne({ email: normalizedEmail })
      .select('email name guru')
      .lean()

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilizador não encontrado'
      })
    }

    if (!user.guru) {
      return res.json({
        success: true,
        hasSubscription: false,
        email: user.email,
        name: user.name
      })
    }

    return res.json({
      success: true,
      hasSubscription: true,
      email: user.email,
      name: user.name,
      subscription: {
        status: user.guru.status,
        subscriptionCode: user.guru.subscriptionCode,
        productId: user.guru.productId,
        offerId: user.guru.offerId,
        nextCycleAt: user.guru.nextCycleAt,
        updatedAt: user.guru.updatedAt,
        paymentUrl: user.guru.paymentUrl
      },
      canAccessSSO: GURU_SSO_ALLOWED_STATUSES.includes(user.guru.status)
    })

  } catch (error: any) {
    console.error('❌ [GURU] Erro ao verificar status:', error.message)
    return res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

// ═══════════════════════════════════════════════════════════
// LISTAR SUBSCRIÇÕES
// ═══════════════════════════════════════════════════════════

/**
 * Listar todas as subscrições Guru
 * GET /guru/subscriptions
 */
export const listSubscriptions = async (req: Request, res: Response) => {
  try {
    const {
      page = 1,
      limit = 10000,
      status,
      productId
    } = req.query

    const query: any = { guru: { $exists: true } }

    // Filtros
    if (status) {
      query['guru.status'] = status
    }
    if (productId) {
      query['guru.productId'] = productId
    }

    const [users, total] = await Promise.all([
      User
        .find(query)
        .select('email name guru')
        .sort({ 'guru.updatedAt': -1 })
        .limit(Number(limit))
        .skip((Number(page) - 1) * Number(limit))
        .lean(),
      User.countDocuments(query)
    ])

    const subscriptions = users.map(user => ({
      email: user.email,
      name: user.name,
      ...user.guru,
      canAccessSSO: GURU_SSO_ALLOWED_STATUSES.includes(user.guru?.status as any)
    }))

    return res.json({
      success: true,
      subscriptions,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    })

  } catch (error: any) {
    console.error('❌ [GURU] Erro ao listar subscrições:', error.message)
    return res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

// ═══════════════════════════════════════════════════════════
// DIAGNÓSTICO (ADMIN)
// ═══════════════════════════════════════════════════════════

/**
 * Endpoint de diagnóstico para debugging
 * GET /admin/guru/subscription?email=xxx
 */
export const diagnosSubscription = async (req: Request, res: Response) => {
  try {
    const { email } = req.query

    if (!email || typeof email !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Email é obrigatório'
      })
    }

    const normalizedEmail = email.toLowerCase().trim()

    // Buscar user completo
    const user = await User.findOne({ email: normalizedEmail }).lean()

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilizador não encontrado'
      })
    }

    // Buscar webhooks relacionados
    const webhooks = await (await import('../models/GuruWebhook')).default
      .find({ email: normalizedEmail })
      .sort({ receivedAt: -1 })
      .limit(10)
      .lean()

    return res.json({
      success: true,
      user: {
        email: user.email,
        name: user.name,
        guru: user.guru || null,
        hasGuru: !!user.guru,
        hasCurseduca: !!user.curseduca,
        hasHotmart: !!user.hotmart,
        hasDiscord: !!user.discord
      },
      webhooks: webhooks.map(w => ({
        requestId: w.requestId,
        event: w.event,
        status: w.status,
        receivedAt: w.receivedAt,
        processed: w.processed,
        error: w.error
      })),
      config: {
        ssoAllowedStatuses: GURU_SSO_ALLOWED_STATUSES,
        canAccessSSO: user.guru ? GURU_SSO_ALLOWED_STATUSES.includes(user.guru.status as any) : false
      }
    })

  } catch (error: any) {
    console.error('❌ [GURU] Erro no diagnóstico:', error.message)
    return res.status(500).json({
      success: false,
      message: error.message
    })
  }
}
