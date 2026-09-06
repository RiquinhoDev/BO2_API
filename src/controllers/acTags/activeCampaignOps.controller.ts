import type { NextFunction, RequestHandler, Response } from 'express'
import type { Types } from 'mongoose'

import User from '../../models/user'
import Product from '../../models/product/Product'
import UserProduct from '../../models/UserProduct'
import CronExecutionLog from '../../models/cron/CronExecutionLog'
import decisionEngine from '../../services/activeCampaign/decisionEngine.service'
import type { ActiveCampaignEmptyInput } from '../../security/activeCampaignDestructiveInput'
import { MAX_BULK_OPERATION_ITEMS } from '../../security/bulkOperationPolicy'
import {
  ActiveCampaignExecutionDisabledError,
  ActiveCampaignExecutionInProgressError,
  ActiveCampaignExecutionLimitError,
  claimActiveCampaignExecution,
  completeActiveCampaignExecution,
  failActiveCampaignExecution,
  requestIdFrom,
} from '../../services/activeCampaign/activeCampaignExecution.service'
import { isActiveCampaignTagMutationEnabled } from '../../services/requestDrivenRuntimeConfig'
import { HttpError, internalError } from '../../security/errorHandling'
import { successResponse } from '../../contracts/responseContract'
import type { ValidatedRequest } from '../../security/validatedInput'
import logger from '../../utils/logger'

type EvaluationError = {
  productId: Types.ObjectId
  userProductId?: Types.ObjectId
  error: string
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

type TestCronResponse = {
  success: true
  data: {
    executionId: string
    dryRun: boolean
    results: {
      totalProducts: number
      totalUserProducts: number
      decisionsEvaluated: number
      actionsExecuted: number
      errors: number
    }
  }
  meta?: { duration: string }
}

function sendTestCronReplay(
  send: (body: unknown) => Response,
  payload: TestCronResponse,
): void {
  send(successResponse(payload.data, payload.meta))
}

type ProductReadResult<T> =
  | { ok: true; userProducts: T[] }
  | { ok: false; error: unknown }

export function loadActiveUserProductsBounded<P extends { _id: { toString(): string } | string }, T>(
  products: P[],
  loader: (productId: string) => Promise<T[]>,
  concurrency = 10,
): Array<Promise<ProductReadResult<T>>> {
  if (!Number.isFinite(concurrency) || concurrency < 1) {
    throw new Error('concurrency must be a finite positive number')
  }
  const resolvers: Array<(result: ProductReadResult<T>) => void> = []
  const results = products.map(() => new Promise<ProductReadResult<T>>(resolve => {
    resolvers.push(resolve)
  }))
  let nextIndex = 0
  const workerCount = Math.min(products.length, Math.floor(concurrency), 10)
  async function worker(): Promise<void> {
    while (true) {
      const index = nextIndex++
      if (index >= products.length) return
      try {
        resolvers[index]({
          ok: true,
          userProducts: await loader(products[index]._id.toString()),
        })
      } catch (error) {
        resolvers[index]({ ok: false, error })
      }
    }
  }
  void Promise.all(Array.from({ length: workerCount }, worker))
  return results
}

export const testCron = async (
  input: ActiveCampaignEmptyInput,
  req: ValidatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const dryRun = input.body.dryRun !== false
  if (!dryRun && !isActiveCampaignTagMutationEnabled()) {
    next(new ActiveCampaignExecutionDisabledError())
    return
  }

  const startTime = Date.now()
  const executionId = `MANUAL_${Date.now()}`
  let ownerId: string | undefined

  try {
    if (!dryRun) {
      const claim = await claimActiveCampaignExecution<TestCronResponse>(
        'test-cron',
        requestIdFrom(req.get('x-request-id') || res.locals.correlationId),
      )
      if (claim.kind === 'replay') {
        sendTestCronReplay(res.json.bind(res), claim.result)
        return
      }
      if (claim.kind === 'in-progress') {
        next(new ActiveCampaignExecutionInProgressError())
        return
      }
      ownerId = claim.ownerId
    }

    logger.info('🧪 Iniciando avaliação manual (novo sistema)...')

    // ═══════════════════════════════════════════════════════════
    // 1. BUSCAR PRODUTOS ATIVOS
    // ═══════════════════════════════════════════════════════════
    const products = await Product.find({ isActive: true })
      .limit(MAX_BULK_OPERATION_ITEMS + 1)
      .populate('courseId')
    if (products.length > MAX_BULK_OPERATION_ITEMS) {
      throw new ActiveCampaignExecutionLimitError()
    }
    logger.info(`📦 Encontrados ${products.length} produtos ativos`)

    let totalUserProducts = 0
    let totalDecisions = 0
    const productReads = loadActiveUserProductsBounded(
      products,
      productId => UserProduct.find({ productId, status: 'ACTIVE' })
        .limit(MAX_BULK_OPERATION_ITEMS + 1),
      10,
    )

    const resolvedProductReads = await Promise.all(productReads)
    const loadedUserProducts = resolvedProductReads.reduce(
      (total, read) => total + (read.ok ? read.userProducts.length : 0),
      0,
    )
    if (loadedUserProducts > MAX_BULK_OPERATION_ITEMS) {
      throw new ActiveCampaignExecutionLimitError()
    }

    let totalExecutions = 0
    const errors: EvaluationError[] = []

    // ═══════════════════════════════════════════════════════════
    // 2. PROCESSAR CADA PRODUTO
    // ═══════════════════════════════════════════════════════════
    for (const [productIndex, product] of products.entries()) {
      try {
        logger.info(`\n📦 Processando produto: ${product.name} (${product.code})`)

        // ✅ BUSCAR USERPRODUCTS ATIVOS DESTE PRODUTO
        const productRead = resolvedProductReads[productIndex]
        if (!productRead.ok) throw productRead.error
        const userProducts = productRead.userProducts

        if (userProducts.length === 0) {
          logger.info(`   ⚠️  Nenhum UserProduct ativo`)
          continue
        }

        logger.info(`   👥 ${userProducts.length} UserProduct(s) ativo(s)`)
        totalUserProducts += userProducts.length

        // ═══════════════════════════════════════════════════════════
        // 3. AVALIAR CADA USERPRODUCT COM DECISIONENGINE
        // ═══════════════════════════════════════════════════════════
        for (const up of userProducts) {
          try {
            const result = await decisionEngine.evaluateUserProduct(
              up.userId.toString(),
              product._id.toString(),
              dryRun,
            )

            totalDecisions++
            totalExecutions += result.actionsExecuted || 0

            if (result.errors && result.errors.length > 0) {
              logger.error(`   ⚠️  Erros:`, result.errors)
            }
          } catch (userError: unknown) {
            const message = errorMessage(userError, 'Erro ao avaliar UserProduct')
            logger.error(`   ❌ Erro UserProduct ${up._id}:`, message)
            errors.push({
              userProductId: up._id,
              productId: product._id,
              error: message
            })
          }
        }

        logger.info(`   ✅ ${userProducts.length} UserProducts avaliados`)

      } catch (productError: unknown) {
        const message = errorMessage(productError, 'Erro ao avaliar produto')
        logger.error(`❌ Erro produto ${product._id}:`, message)
        errors.push({
          productId: product._id,
          error: message
        })
      }
    }

    // ═══════════════════════════════════════════════════════════
    // 4. REGISTAR EXECUÇÃO
    // ═══════════════════════════════════════════════════════════
    const duration = Date.now() - startTime

    if (!dryRun) {
      await CronExecutionLog.create({
        executionId,
        type: 'manual-trigger',
        status: 'success',
        startedAt: new Date(startTime),
        finishedAt: new Date(),
        duration,
        results: {
          totalProducts: products.length,
          totalUserProducts,
          decisionsEvaluated: totalDecisions,
          actionsExecuted: totalExecutions,
          errors
        }
      })
    }

    logger.info(`\n✅ Avaliação manual concluída (novo sistema)`)
    logger.info(`⏱️  Duração: ${(duration / 1000).toFixed(2)}s`)
    logger.info(`📦 Produtos: ${products.length}`)
    logger.info(`👥 UserProducts: ${totalUserProducts}`)
    logger.info(`🎯 Decisões: ${totalDecisions}`)
    logger.info(`⚡ Ações executadas: ${totalExecutions}`)

    // ═══════════════════════════════════════════════════════════
    // 5. RESPOSTA
    // ═══════════════════════════════════════════════════════════
    const responseMeta = { duration: `${(duration / 1000).toFixed(2)}s` }
    const responseData = { executionId, dryRun, results: {
      totalProducts: products.length,
      totalUserProducts,
      decisionsEvaluated: totalDecisions,
      actionsExecuted: totalExecutions,
      errors: errors.length
    } }
    if (!dryRun && ownerId) {
      await completeActiveCampaignExecution(
        'test-cron',
        ownerId,
        successResponse(responseData, responseMeta),
      )
    }
    res.json(successResponse({ executionId, results: responseData.results, dryRun }, responseMeta))
    return
  } catch (error: unknown) {

    if (!dryRun && ownerId) {
      await failActiveCampaignExecution('test-cron', ownerId).catch(() => undefined)
      try {
        await CronExecutionLog.create({
          executionId,
          type: 'manual-trigger',
          status: 'failed',
          startedAt: new Date(startTime),
          finishedAt: new Date(),
          duration: Date.now() - startTime,
          results: {
            error: errorMessage(error, 'Erro na avaliação manual')
          }
        })
      } catch {
        logger.error('Falha ao registar auditoria da avaliação manual', { executionId, status: 'failed' })
      }
    }

    next(error instanceof HttpError
      ? error
      : internalError('Erro na avaliação manual', 'AC_MANUAL_EVALUATION_FAILED', error))
    return
  }
}

/**
 * GET /api/activecampaign/cron-logs
 * Retorna histórico das últimas 20 execuções
 */
export const getCronLogs: RequestHandler = async (_req, res, next) => {
  try {
    const logs = await CronExecutionLog.find().sort({ startedAt: -1 }).limit(20)
    res.json(successResponse({ logs }))
    return
  } catch (error: unknown) {
    next(internalError('Erro ao buscar cron logs', 'AC_CRON_LOGS_READ_FAILED', error))
    return
  }
}

/**
 * GET /api/activecampaign/stats
 * Estatísticas gerais do Active Campaign
 */
export const getStats: RequestHandler = async (_req, res, next) => {
  try {
    logger.info('📊 Buscando stats do Active Campaign...')

    const totalMonitored = await User.countDocuments({
      $or: [
        { 'hotmart.hotmartUserId': { $exists: true, $ne: null } },
        { 'curseduca.curseducaUserId': { $exists: true, $ne: null } }
      ]
    })

    const tagsAppliedToday = 0
    const emailsSent = 0
    const openRate = 0.65

    logger.info(`✅ Stats: ${totalMonitored} monitorizados`)

    res.json({
      success: true,
      data: {
        totalMonitored,
        tagsAppliedToday,
        emailsSent,
        openRate
      }
    })
    return
  } catch (error: unknown) {
    next(internalError('Erro ao buscar estatísticas', 'AC_STATS_READ_FAILED', error))
    return
  }
}

/**
 * GET /api/tag-rules
 */
