// src/controllers/guru.sso.controller.ts - Controller para SSO MyOrders da Guru
import logger from '../utils/logger'
import { NextFunction, Request, Response } from 'express'
import { internalError } from '../security/errorHandling'
import axios from 'axios'
import User from '../models/user'
import { GURU_SSO_ALLOWED_STATUSES } from '../types/guru.types'
import { createListSubscriptions } from './guruSubscriptionList.controller'
import { getGuruUserToken } from '../services/requestDrivenRuntimeConfig'
import { successResponse } from '../contracts/responseContract'

export const listSubscriptions = createListSubscriptions({ model: User })

// Configuração da API Guru
// NOTA: A API v2 é a atual, v1 foi descontinuada
// Endpoint SSO MyOrders: POST /api/v2/myorders/auth/sso/{email}
const GURU_API_BASE = 'https://digitalmanager.guru/api/v2'

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
export const ssoMyOrders = async (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now()

  try {
    const { email } = req.query

    // ═══════════════════════════════════════════════════════════
    // 1. VALIDAR EMAIL
    // ═══════════════════════════════════════════════════════════
    if (!email || typeof email !== 'string') {
      logger.warn('⚠️ [GURU SSO] Tentativa sem email')
      return res.status(400).json({
        success: false,
        message: 'Email é obrigatório'
      })
    }

    const normalizedEmail = email.toLowerCase().trim()
    logger.info(`🔐 [GURU SSO] Pedido de SSO para: ${normalizedEmail}`)

    // ═══════════════════════════════════════════════════════════
    // 2. VALIDAR USER NA BD
    // ═══════════════════════════════════════════════════════════
    const user = await User.findOne({ email: normalizedEmail })

    if (!user) {
      logger.warn(`⚠️ [GURU SSO] User não encontrado: ${normalizedEmail}`)
      return res.status(404).json({
        success: false,
        message: 'Utilizador não encontrado'
      })
    }

    if (!user.guru) {
      logger.warn(`⚠️ [GURU SSO] User sem subscrição Guru: ${normalizedEmail}`)
      return res.status(403).json({
        success: false,
        message: 'Utilizador não tem subscrição Guru'
      })
    }

    // ═══════════════════════════════════════════════════════════
    // 3. VERIFICAR STATUS PERMITIDO
    // ═══════════════════════════════════════════════════════════
    if (!GURU_SSO_ALLOWED_STATUSES.includes(user.guru.status)) {
      logger.warn(`⚠️ [GURU SSO] Status não permite SSO: ${user.guru.status} - ${normalizedEmail}`)
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
    const guruUserToken = getGuruUserToken()

    // ═══════════════════════════════════════════════════════════
    // 5. CHAMAR API GURU PARA SSO
    // ═══════════════════════════════════════════════════════════
    // Endpoint correto (v2): POST /api/v2/myorders/auth/sso/{email}
    const ssoEndpoint = `${GURU_API_BASE}/myorders/auth/sso/${encodeURIComponent(normalizedEmail)}`
    logger.info(`📡 [GURU SSO] Chamando API Guru: ${ssoEndpoint}`)

    const ssoResponse = await axios.post(
      ssoEndpoint,
      {},
      {
        headers: {
          'Authorization': `Bearer ${guruUserToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    )

    // A API Guru retorna 'redirect_url' (não 'url')
    const ssoUrl = ssoResponse.data?.redirect_url || ssoResponse.data?.url

    if (!ssoUrl) {
      return next(internalError('Erro ao gerar link SSO', 'GURU_SSO_LINK_FAILED', ssoResponse.data))
    }

    logger.info(`✅ [GURU SSO] URL obtida: ${ssoUrl}`)

    // ═══════════════════════════════════════════════════════════
    // 6. REDIRECIONAR
    // ═══════════════════════════════════════════════════════════
    const duration = Date.now() - startTime
    logger.info(`✅ [GURU SSO] Redirecionando ${normalizedEmail} (${duration}ms)`)

    return res.redirect(302, ssoUrl)

  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 404) {
        return res.status(404).json({
          success: false,
          message: 'Email não encontrado na plataforma Guru'
        })
      }

      if (error.response?.status === 401) {
        return next(internalError(
          'Erro de autenticação com a plataforma Guru',
          'GURU_SSO_AUTH_FAILED',
          error,
        ))
      }

      if (error.code === 'ECONNABORTED') {
        return res.status(504).json({
          success: false,
          message: 'Timeout na comunicação com a plataforma Guru'
        })
      }
    }

    return next(internalError('Erro ao processar SSO', 'GURU_SSO_FAILED', error))
  }
}

// ═══════════════════════════════════════════════════════════
// VERIFICAR STATUS
// ═══════════════════════════════════════════════════════════

/**
 * Verificar status de subscrição de um email
 * GET /guru/status?email=xxx
 */
export const getSubscriptionStatus = async (req: Request, res: Response, next: NextFunction) => {
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
      return res.json(successResponse({
        hasSubscription: false,
        email: user.email,
        name: user.name
      }))
    }

    return res.json(successResponse({
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
    }))

  } catch (error: unknown) {
    return next(internalError(
      'Erro ao verificar subscrição Guru',
      'GURU_SUBSCRIPTION_STATUS_FAILED',
      error,
    ))
  }
}

// ═══════════════════════════════════════════════════════════
// LISTAR SUBSCRIÇÕES
// ═══════════════════════════════════════════════════════════

/**
 * Listar todas as subscrições Guru
 * GET /guru/subscriptions
 */
// ═══════════════════════════════════════════════════════════
// DIAGNÓSTICO (ADMIN)
// ═══════════════════════════════════════════════════════════

/**
 * Endpoint de diagnóstico para debugging
 * GET /admin/guru/subscription?email=xxx
 */
export const diagnosSubscription = async (req: Request, res: Response, next: NextFunction) => {
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

    return res.json(successResponse({
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
        canAccessSSO: user.guru ? typeof user.guru.status === 'string' && GURU_SSO_ALLOWED_STATUSES.some(status => status === user.guru?.status) : false
      }
    }))

  } catch (error: unknown) {
    return next(internalError(
      'Erro ao diagnosticar subscrição Guru',
      'GURU_SUBSCRIPTION_DIAGNOSIS_FAILED',
      error,
    ))
  }
}
