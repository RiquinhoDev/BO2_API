// ════════════════════════════════════════════════════════════════════════════
// 📁 src/jobs/evaluateRules.job.ts
// ✅ NOVO SISTEMA: Usa DecisionEngine por UserProduct
// ════════════════════════════════════════════════════════════════════════════

import { Product, UserProduct } from '../models'
import decisionEngine from '../services/activeCampaign/decisionEngine.service'
import tagOrchestrator from '../services/activeCampaign/tagOrchestrator.service'

console.log('⚠️ EvaluateRules: DESATIVADO hardcoded (gerido pelo wizard)')

export async function executeEvaluateRules() {
  console.log('🕐 Iniciando avaliação diária automática...')
  console.log('✅ NOVO SISTEMA: DecisionEngine por UserProduct\n')

  const startTime = Date.now()

  try {
    // ═══════════════════════════════════════════════════════════
    // 1. BUSCAR PRODUTOS ATIVOS
    // ═══════════════════════════════════════════════════════════

    const products = await Product.find({ isActive: true }).populate('courseId')

    console.log(`📦 Encontrados ${products.length} produtos ativos`)

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

        console.log(`\n📦 Processando produto: ${product.name} (${product.code})`)
        console.log(`   📚 Course: ${course?.name || 'N/A'} (${course?.trackingType || 'N/A'})`)

        // ═══════════════════════════════════════════════════════════
        // 3. BUSCAR USERPRODUCTS ATIVOS DESTE PRODUTO
        // ═══════════════════════════════════════════════════════════

        const userProducts = await UserProduct.find({
          productId: product._id,
          status: 'ACTIVE'
        })

        if (userProducts.length === 0) {
          console.log(`   ⚠️  Nenhum UserProduct ativo`)
          continue
        }

        console.log(`   👥 ${userProducts.length} UserProduct(s) ativo(s)`)

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
            console.error(`   ❌ Erro UserProduct ${up._id}:`, userError.message)
            errors.push({
              userProductId: up._id,
              productId: product._id,
              error: userError.message
            })
          }
        }

        console.log(`   ✅ ${product.code}: ${userProducts.length} UserProducts avaliados`)

      } catch (productError: any) {
        console.error(`❌ Erro ao processar produto ${product._id}:`, productError.message)
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

    console.log(`\n${'═'.repeat(70)}`)
    console.log(`✅ AVALIAÇÃO CONCLUÍDA (NOVO SISTEMA)`)
    console.log(`${'═'.repeat(70)}`)
    console.log(`📦 Produtos processados: ${products.length}`)
    console.log(`👥 UserProducts avaliados: ${totalUserProducts}`)
    console.log(`🎯 Decisões avaliadas: ${totalDecisions}`)
    console.log(`⚡ Ações executadas: ${totalExecutions}`)
    console.log(`⏱️  Duração: ${(duration / 1000).toFixed(2)}s`)

    if (errors.length > 0) {
      console.log(`⚠️  Erros: ${errors.length}`)
    }

    console.log(`${'═'.repeat(70)}\n`)

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
    console.error('❌ Erro na avaliação diária:', error)
    throw new Error(`Erro na avaliação de regras: ${error.message}`)
  }
}

// ═══════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════

export default {
  run: executeEvaluateRules
}