// ═══════════════════════════════════════════════════════════
// 🔄 CRON JOB V2: Avaliação de Engagement por Produto
// Objetivo: Avaliar engagement POR UserProduct (não por User global)
// Executa: Diariamente às 2 AM
// ═══════════════════════════════════════════════════════════

import cron from 'node-cron'
import UserProduct from '../models/UserProduct'
import Product from '../models/Product'
import User from '../models/user'
import activeCampaignService from '../services/ac/activeCampaignService'
import { decisionEngine } from '../services/ac/decisionEngine.service'

// ═══════════════════════════════════════════════════════════
// INTERFACES
// ═══════════════════════════════════════════════════════════

interface EngagementEvaluation {
  userId: string
  productId: string
  email: string
  productCode: string
  daysSinceLastActivity: number
  currentLevel: number
  tagsToApply: string[]
  tagsToRemove: string[]
  action: 'APPLY' | 'REMOVE' | 'NONE'
}

interface JobResult {
  totalEvaluated: number
  totalActionsApplied: number
  totalErrors: number
  byProduct: Record<string, {
    evaluated: number
    actionsApplied: number
    errors: number
  }>
  errors: Array<{
    userId: string
    productId: string
    error: string
  }>
}

// ═══════════════════════════════════════════════════════════
// FUNÇÕES PRINCIPAIS
// ═══════════════════════════════════════════════════════════

/**
 * Avaliar engagement de um UserProduct específico
 */
async function evaluateUserProductEngagement(
  userProduct: any
): Promise<EngagementEvaluation> {
  const user = await User.findById(userProduct.userId)
  const product = await Product.findById(userProduct.productId)

  if (!user || !product) {
    throw new Error('User ou Product não encontrado')
  }

  // Calcular dias desde última atividade
  const lastActivity = userProduct.engagement?.lastActivity || 
                       userProduct.engagement?.lastLogin ||
                       userProduct.engagement?.lastAction

  let daysSinceLastActivity = 999 // Default: muitos dias (inativo)
  
  if (lastActivity) {
    daysSinceLastActivity = Math.floor(
      (Date.now() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24)
    )
  }

  // Determinar nível atual baseado em dias
  let currentLevel = 0
  let tagsToApply: string[] = []
  let tagsToRemove: string[] = []
  let action: 'APPLY' | 'REMOVE' | 'NONE' = 'NONE'

  // Lógica de engajamento baseada em níveis
  if (daysSinceLastActivity >= 30) {
    currentLevel = 30
    tagsToApply = ['INATIVO_30D']
    tagsToRemove = ['INATIVO_7D', 'INATIVO_14D', 'ATIVO']
    action = 'APPLY'
  } else if (daysSinceLastActivity >= 14) {
    currentLevel = 14
    tagsToApply = ['INATIVO_14D']
    tagsToRemove = ['INATIVO_7D', 'INATIVO_30D', 'ATIVO']
    action = 'APPLY'
  } else if (daysSinceLastActivity >= 7) {
    currentLevel = 7
    tagsToApply = ['INATIVO_7D']
    tagsToRemove = ['INATIVO_14D', 'INATIVO_30D', 'ATIVO']
    action = 'APPLY'
  } else {
    // Ativo (< 7 dias)
    currentLevel = 0
    tagsToApply = ['ATIVO']
    tagsToRemove = ['INATIVO_7D', 'INATIVO_14D', 'INATIVO_30D']
    action = 'APPLY'
  }

  return {
    userId: user._id.toString(),
    productId: product._id.toString(),
    email: user.email,
    productCode: product.code,
    daysSinceLastActivity,
    currentLevel,
    tagsToApply,
    tagsToRemove,
    action
  }
}

/**
 * Aplicar tags baseado na avaliação
 */
async function applyEngagementTags(
  evaluation: EngagementEvaluation
): Promise<boolean> {
  try {
    // Remover tags antigas
    for (const tag of evaluation.tagsToRemove) {
      await activeCampaignService.removeTagFromUserProduct(
        evaluation.userId,
        evaluation.productId,
        tag
      )
    }

    // Aplicar novas tags
    for (const tag of evaluation.tagsToApply) {
      await activeCampaignService.applyTagToUserProduct(
        evaluation.userId,
        evaluation.productId,
        tag
      )
    }

    console.log(
      `[Engagement V2] ✅ Tags atualizadas: ${evaluation.email} (${evaluation.productCode})`
    )

    return true
  } catch (error: any) {
    console.error(
      `[Engagement V2] ❌ Erro ao aplicar tags: ${evaluation.email}`,
      error.message
    )
    return false
  }
}

/**
 * Executar job de avaliação de engagement
 */
export async function runEngagementEvaluationV2(): Promise<JobResult> {
  console.log('\n==========================================================')
  console.log('🔄 INICIANDO AVALIAÇÃO DE ENGAGEMENT V2')
  console.log('==========================================================\n')

  const startTime = Date.now()

  const result: JobResult = {
    totalEvaluated: 0,
    totalActionsApplied: 0,
    totalErrors: 0,
    byProduct: {},
    errors: []
  }

  try {
    // 1. Buscar todos os produtos ativos
    const products = await Product.find({ isActive: true })
    console.log(`📦 ${products.length} produtos ativos encontrados\n`)

    // 2. Para cada produto, avaliar UserProducts
    for (const product of products) {
      console.log(`\n📊 Avaliando produto: ${product.code} (${product.name})`)
      console.log('─'.repeat(60))

      // Inicializar stats do produto
      result.byProduct[product.code] = {
        evaluated: 0,
        actionsApplied: 0,
        errors: 0
      }

      // Buscar UserProducts deste produto
      const userProducts = await UserProduct.find({
        productId: product._id,
        status: 'ACTIVE'
      })

      console.log(`   ${userProducts.length} users encontrados`)

      // 3. Avaliar cada UserProduct
      for (const userProduct of userProducts) {
        result.totalEvaluated++
        result.byProduct[product.code].evaluated++

        try {
          // Avaliar engagement
          const evaluation = await evaluateUserProductEngagement(userProduct)

          // Aplicar tags
          const success = await applyEngagementTags(evaluation)

          if (success) {
            result.totalActionsApplied++
            result.byProduct[product.code].actionsApplied++
          } else {
            result.totalErrors++
            result.byProduct[product.code].errors++
            result.errors.push({
              userId: evaluation.userId,
              productId: evaluation.productId,
              error: 'Failed to apply tags'
            })
          }
        } catch (error: any) {
          result.totalErrors++
          result.byProduct[product.code].errors++
          result.errors.push({
            userId: userProduct.userId.toString(),
            productId: userProduct.productId.toString(),
            error: error.message
          })
        }
      }

      console.log(`   ✅ Avaliados: ${result.byProduct[product.code].evaluated}`)
      console.log(`   ✅ Ações aplicadas: ${result.byProduct[product.code].actionsApplied}`)
      console.log(`   ❌ Erros: ${result.byProduct[product.code].errors}`)
    }

    // 4. Sumário final
    const duration = ((Date.now() - startTime) / 1000).toFixed(2)

    console.log('\n==========================================================')
    console.log('📊 SUMÁRIO DA AVALIAÇÃO V2')
    console.log('==========================================================')
    console.log(`Total avaliados:      ${result.totalEvaluated}`)
    console.log(`Ações aplicadas:      ${result.totalActionsApplied}`)
    console.log(`Erros:                ${result.totalErrors}`)
    console.log(`Duração:              ${duration}s`)
    console.log('==========================================================\n')

    if (result.totalErrors > 0) {
      console.log('❌ ERROS ENCONTRADOS:')
      result.errors.slice(0, 10).forEach((err, i) => {
        console.log(`   ${i + 1}. UserID ${err.userId}: ${err.error}`)
      })
      if (result.errors.length > 10) {
        console.log(`   ... e mais ${result.errors.length - 10} erros`)
      }
    }

    return result

  } catch (error: any) {
    console.error('\n❌ ERRO FATAL no job de engagement:', error.message)
    throw error
  }
}

/**
 * Agendar job para execução diária
 */
export function scheduleEngagementEvaluationV2() {
  // Executar todos os dias às 2 AM
  cron.schedule('0 2 * * *', async () => {
    console.log('\n⏰ CRON Job: Avaliação de Engagement V2 iniciada')
    
    try {
      await runEngagementEvaluationV2()
      console.log('✅ CRON Job: Avaliação de Engagement V2 completa')
    } catch (error: any) {
      console.error('❌ CRON Job: Erro na avaliação de engagement V2:', error.message)
    }
  })

  console.log('✅ CRON Job agendado: Avaliação de Engagement V2 (diário às 2 AM)')
}

// ═══════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════

export default {
  run: runEngagementEvaluationV2,
  schedule: scheduleEngagementEvaluationV2
}

