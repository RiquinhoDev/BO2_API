import logger from '../utils/logger'
// ════════════════════════════════════════════════════════════════════════════
// 📁 src/jobs/evaluateRules.job.ts
// ✅ NOVO SISTEMA: Usa DecisionEngine por UserProduct
// ════════════════════════════════════════════════════════════════════════════

import { Product, UserProduct } from '../models'
import decisionEngine from '../services/activeCampaign/decisionEngine.service'
import tagOrchestrator from '../services/activeCampaign/tagOrchestrator.service'

logger.info('⚠️ EvaluateRules: DESATIVADO hardcoded (gerido pelo wizard)')

export async function executeEvaluateRules() {
  logger.info('🕐 Iniciando avaliação diária automática...')
  logger.info('✅ NOVO SISTEMA: DecisionEngine por UserProduct\n')

  const startTime = Date.now()

  try {
    // ═══════════════════════════════════════════════════════════
    // 1. BUSCAR PRODUTOS ATIVOS
    // ═══════════════════════════════════════════════════════════

    const products = await Product.find({ isActive: true }).populate('courseId')

    logger.info(`📦 Encontrados ${products.length} produtos ativos`)

    let totalUserProducts = 0
    let totalDecisions = 0
    let totalExecutions = 0
    const errors: any[] = []

    // ═══════════════════════════════════════════════════════════
    // 2. PROCESSAR CADA PRODUTO
    // ═══════════════════════════════════════════════════════════

    for (const product of products) {
      try {
        const course = product.courseId as any

        logger.info(`\n📦 Processando produto: ${product.name} (${product.code})`)
        logger.info(`   📚 Course: ${course?.name || 'N/A'} (${course?.trackingType || 'N/A'})`)

        // ═══════════════════════════════════════════════════════════
        // 3. BUSCAR USERPRODUCTS ATIVOS DESTE PRODUTO
        // ═══════════════════════════════════════════════════════════

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
        // 4. AVALIAR CADA USERPRODUCT COM DECISIONENGINE
        // ═══════════════════════════════════════════════════════════

        for (const up of userProducts) {
          try {
            const result = await tagOrchestrator.orchestrateUserProduct(
              up.userId.toString(),
              product._id.toString()
            )

            totalDecisions++
            totalExecutions += result.tagsApplied.length + result.tagsRemoved.length

          } catch (userError: any) {
            logger.error(`   ❌ Erro UserProduct ${up._id}:`, userError.message)
            errors.push({
              userProductId: up._id,
              productId: product._id,
              error: userError.message
            })
          }
        }

        logger.info(`   ✅ ${product.code}: ${userProducts.length} UserProducts avaliados`)

      } catch (productError: any) {
        logger.error(`❌ Erro ao processar produto ${product._id}:`, productError.message)
        errors.push({
          productId: product._id,
          error: productError.message
        })
      }
    }

    // ═══════════════════════════════════════════════════════════
    // 5. RESULTADO FINAL
    // ═══════════════════════════════════════════════════════════

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

    // ✅ RETORNAR RESULTADO PARA O SCHEDULER
    return {
      success: true,
      totalCourses: products.length,
      totalStudents: totalUserProducts,
      decisionsEvaluated: totalDecisions,
      actionsExecuted: totalExecutions,
      errors: errors.length,
      duration: Math.round(duration / 1000)
    }

  } catch (error: any) {
    logger.error('❌ Erro na avaliação diária:', error)
    throw new Error(`Erro na avaliação de regras: ${error.message}`)
  }
}

// ═══════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════

export default {
  run: executeEvaluateRules
}