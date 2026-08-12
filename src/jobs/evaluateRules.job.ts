import logger from '../utils/logger'
import { errorMessage } from '../services/syncUtilizadoresServices/universalSync/fieldUtils'
// ════════════════════════════════════════════════════════════════════════════
// 📁 src/jobs/evaluateRules.job.ts
// ✅ NOVO SISTEMA: Usa DecisionEngine por UserProduct
// ════════════════════════════════════════════════════════════════════════════

import { Product, UserProduct } from '../models'
import decisionEngine from '../services/activeCampaign/decisionEngine.service'
import tagOrchestrator from '../services/activeCampaign/tagOrchestrator.service'

interface PopulatedCourseSummary {
  name?: string
  trackingType?: string
}

function populatedCourseSummary(value: unknown): PopulatedCourseSummary | null {
  if (!value || typeof value !== 'object') return null

  return {
    name: 'name' in value && typeof value.name === 'string' ? value.name : undefined,
    trackingType: 'trackingType' in value && typeof value.trackingType === 'string'
      ? value.trackingType
      : undefined,
  }
}

logger.info('⚠️ EvaluateRules: DESATIVADO hardcoded (gerido pelo wizard)')

export async function executeEvaluateRules() {
  logger.info('🕐 Iniciando avaliação diária automática...')
  logger.info('✅ NOVO SISTEMA: DecisionEngine por UserProduct\n')

  const startTime = Date.now()

  try {
    const products = await Product.find({ isActive: true }).populate('courseId')

    logger.info(`📦 Encontrados ${products.length} produtos ativos`)

    let totalUserProducts = 0
    let totalDecisions = 0
    let totalExecutions = 0
    const errors: Array<Record<string, unknown>> = []

    for (const product of products) {
      try {
        const course = populatedCourseSummary(product.courseId)

        logger.info(`\n📦 Processando produto: ${product.name} (${product.code})`)
        logger.info(`   📚 Course: ${course?.name || 'N/A'} (${course?.trackingType || 'N/A'})`)

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

        for (const up of userProducts) {
          try {
            const result = await tagOrchestrator.orchestrateUserProduct(
              up.userId.toString(),
              product._id.toString()
            )

            totalDecisions++
            totalExecutions += result.tagsApplied.length + result.tagsRemoved.length
          } catch (userError: unknown) {
            logger.error(`   ❌ Erro UserProduct ${up._id}:`, errorMessage(userError))
            errors.push({
              userProductId: up._id,
              productId: product._id,
              error: errorMessage(userError)
            })
          }
        }

        logger.info(`   ✅ ${product.code}: ${userProducts.length} UserProducts avaliados`)
      } catch (productError: unknown) {
        logger.error(`❌ Erro ao processar produto ${product._id}:`, errorMessage(productError))
        errors.push({
          productId: product._id,
          error: errorMessage(productError)
        })
      }
    }

    const duration = Date.now() - startTime

    logger.info(`\n${'═'.repeat(70)}`)
    logger.info(`✅ AVALIAÇÃO CONCLUÍDA (NOVO SISTEMA)`)
    logger.info(`${'═'.repeat(70)}`)
    logger.info(`📦 Produtos processados: ${products.length}`)
    logger.info(`👥 UserProducts avaliados: ${totalUserProducts}`)
    logger.info(`🎯 Decisões avaliadas: ${totalDecisions}`)
    logger.info(`⚡ Ações executadas: ${totalExecutions}`)
    logger.info(`⏱️  Duração: ${(duration / 1000).toFixed(2)}s`)

    if (errors.length > 0) {
      logger.info(`⚠️  Erros: ${errors.length}`)
    }

    logger.info(`${'═'.repeat(70)}\n`)

    return {
      success: true,
      totalCourses: products.length,
      totalStudents: totalUserProducts,
      decisionsEvaluated: totalDecisions,
      actionsExecuted: totalExecutions,
      errors: errors.length,
      duration: Math.round(duration / 1000)
    }
  } catch (error: unknown) {
    logger.error('❌ Erro na avaliação diária:', error)
    throw new Error(`Erro na avaliação de regras: ${errorMessage(error)}`)
  }
}

export default {
  run: executeEvaluateRules
}
