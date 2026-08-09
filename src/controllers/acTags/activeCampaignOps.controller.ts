import type { RequestHandler, Response } from 'express'
import type { Types } from 'mongoose'

import User from '../../models/user'
import Product from '../../models/product/Product'
import UserProduct from '../../models/UserProduct'
import CronExecutionLog from '../../models/cron/CronExecutionLog'
import decisionEngine from '../../services/activeCampaign/decisionEngine.service'
import type { ActiveCampaignEmptyInput } from '../../security/activeCampaignDestructiveInput'
import logger from '../../utils/logger'

type EvaluationError = {
  productId: Types.ObjectId
  userProductId?: Types.ObjectId
  error: string
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

export const testCron = async (_input: ActiveCampaignEmptyInput, res: Response): Promise<void> => {
  const startTime = Date.now()
  const executionId = `MANUAL_${Date.now()}`

  try {
    logger.info('🧪 Iniciando avaliação manual (novo sistema)...')

    // ═══════════════════════════════════════════════════════════
    // 1. BUSCAR PRODUTOS ATIVOS
    // ═══════════════════════════════════════════════════════════
    const products = await Product.find({ isActive: true }).populate('courseId')
    logger.info(`📦 Encontrados ${products.length} produtos ativos`)

    let totalUserProducts = 0
    let totalDecisions = 0
    let totalExecutions = 0
    const errors: EvaluationError[] = []

    // ═══════════════════════════════════════════════════════════
    // 2. PROCESSAR CADA PRODUTO
    // ═══════════════════════════════════════════════════════════
    for (const product of products) {
      try {
        logger.info(`\n📦 Processando produto: ${product.name} (${product.code})`)

        // ✅ BUSCAR USERPRODUCTS ATIVOS DESTE PRODUTO
        const userProducts = await UserProduct.find({
          productId: product._id,
          status: 'ACTIVE'
        })

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
              product._id.toString()
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

    logger.info(`\n✅ Avaliação manual concluída (novo sistema)`)
    logger.info(`⏱️  Duração: ${(duration / 1000).toFixed(2)}s`)
    logger.info(`📦 Produtos: ${products.length}`)
    logger.info(`👥 UserProducts: ${totalUserProducts}`)
    logger.info(`🎯 Decisões: ${totalDecisions}`)
    logger.info(`⚡ Ações executadas: ${totalExecutions}`)

    // ═══════════════════════════════════════════════════════════
    // 5. RESPOSTA
    // ═══════════════════════════════════════════════════════════
    res.json({
      success: true,
      executionId,
      duration: `${(duration / 1000).toFixed(2)}s`,
      results: {
        totalProducts: products.length,
        totalUserProducts,
        decisionsEvaluated: totalDecisions,
        actionsExecuted: totalExecutions,
        errors: errors.length
      }
    })
    return
  } catch (error: unknown) {
    logger.error('❌ Erro na avaliação manual:', error)

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

    res.status(500).json({
      success: false,
      error: errorMessage(error, 'Erro na avaliação manual')
    })
    return
  }
}

/**
 * GET /api/activecampaign/cron-logs
 * Retorna histórico das últimas 20 execuções
 */
export const getCronLogs: RequestHandler = async (_req, res) => {
  try {
    const logs = await CronExecutionLog.find().sort({ startedAt: -1 }).limit(20)
    res.json({ success: true, logs })
    return
  } catch (error: unknown) {
    res.status(500).json({ success: false, message: errorMessage(error, 'Erro ao buscar cron logs') })
    return
  }
}

/**
 * GET /api/activecampaign/stats
 * Estatísticas gerais do Active Campaign
 */
export const getStats: RequestHandler = async (_req, res) => {
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
      stats: {
        totalMonitored,
        tagsAppliedToday,
        emailsSent,
        openRate
      }
    })
    return
  } catch (error: unknown) {
    logger.error('❌ Erro ao buscar stats:', error)
    res.status(500).json({
      success: false,
      error: errorMessage(error, 'Erro ao buscar estatísticas')
    })
    return
  }
}

/**
 * GET /api/tag-rules
 */
