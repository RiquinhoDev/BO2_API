// ════════════════════════════════════════════════════════════════════════════
// 📁 src/jobs/evaluateRules.job.ts
// ✅ VERSÃO CORRIGIDA: Avalia por PRODUTO não por COURSE
// ════════════════════════════════════════════════════════════════════════════

import Course from '../models/Course'
import { Product, UserProduct } from '../models'
import User from '../models/user'
import tagRuleEngine from '../services/ac/tagRuleEngine'

console.log('⚠️ EvaluateRules: DESATIVADO hardcoded (gerido pelo wizard)')

/**
 * ✅ VERSÃO OTIMIZADA: Avalia por produto
 * 
 * ANTES:
 * - Avaliava por COURSE
 * - Users Hotmart avaliados com regras Clareza
 * - Muitas regras incompatíveis
 * 
 * DEPOIS:
 * - Avalia por PRODUTO
 * - Cada user só com regras do SEU produto
 * - SEM regras incompatíveis!
 */
export async function executeEvaluateRules() {
  console.log('🕐 Iniciando avaliação diária automática...')
  console.log('✅ VERSÃO OTIMIZADA: Avaliação por produto\n')
  
  const startTime = Date.now()
  
  try {
    // ═══════════════════════════════════════════════════════════
    // 1. BUSCAR PRODUTOS ATIVOS (NÃO COURSES!)
    // ═══════════════════════════════════════════════════════════
    
    const products = await Product.find({ isActive: true }).populate('courseId')
    
    console.log(`📦 Encontrados ${products.length} produtos ativos`)
    
    let totalUserProducts = 0
    let totalTagsApplied = 0
    let totalTagsRemoved = 0
    const errors: any[] = []
    
    // ═══════════════════════════════════════════════════════════
    // 2. PROCESSAR CADA PRODUTO
    // ═══════════════════════════════════════════════════════════
    
    for (const product of products) {
      try {
        const course = product.courseId as any
        
        console.log(`\n📖 Processando produto: ${product.name} (${product.code})`)
        console.log(`   📚 Course: ${course.name} (${course.trackingType})`)
        
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
        // 4. BUSCAR USERS (BATCH PARA PERFORMANCE)
        // ═══════════════════════════════════════════════════════════
        
        const userIds = userProducts.map(up => up.userId)
        
        const users = await User.find({
          _id: { $in: userIds }
        })
        
        console.log(`   🔍 ${users.length} user(s) encontrado(s)`)
        
        // ═══════════════════════════════════════════════════════════
        // 5. AVALIAR REGRAS PARA CADA USER
        // ✅ AGORA: Passa COURSE._ID do produto correto!
        // ═══════════════════════════════════════════════════════════
        
        for (const user of users) {
          try {
            // ✅ CORRIGIDO: Avalia com course do produto
            // Cada user só é avaliado com regras do seu produto!
            const results = await tagRuleEngine.evaluateUserRules(
              user.id, 
              course._id  // ← Course do PRODUTO, não course aleatório!
            )
            
            results.forEach(result => {
              if (result.executed) {
                if (result.action === 'ADD_TAG') totalTagsApplied++
                if (result.action === 'REMOVE_TAG') totalTagsRemoved++
              }
            })
            
          } catch (userError: any) {
            console.error(`   ❌ Erro ao avaliar user ${user._id}:`, userError.message)
            errors.push({
              userId: user._id,
              productId: product._id,
              error: userError.message
            })
          }
        }
        
        console.log(`   ✅ ${product.code}: ${users.length} users processados`)
        
      } catch (productError: any) {
        console.error(`❌ Erro ao processar produto ${product._id}:`, productError.message)
        errors.push({
          productId: product._id,
          error: productError.message
        })
      }
    }
    
    // ═══════════════════════════════════════════════════════════
    // 6. RESULTADO FINAL
    // ═══════════════════════════════════════════════════════════
    
    const duration = Date.now() - startTime
    
    console.log(`\n${'═'.repeat(70)}`)
    console.log(`✅ AVALIAÇÃO CONCLUÍDA`)
    console.log(`${'═'.repeat(70)}`)
    console.log(`📊 Produtos processados: ${products.length}`)
    console.log(`👥 UserProducts avaliados: ${totalUserProducts}`)
    console.log(`🏷️  Tags aplicadas: ${totalTagsApplied}`)
    console.log(`🗑️  Tags removidas: ${totalTagsRemoved}`)
    console.log(`⏱️  Duração: ${(duration / 1000).toFixed(2)}s`)
    
    if (errors.length > 0) {
      console.log(`⚠️  Erros: ${errors.length}`)
    }
    
    console.log(`${'═'.repeat(70)}\n`)
    
    // ✅ RETORNAR RESULTADO PARA O SCHEDULER
    return {
      success: true,
      totalCourses: products.length,  // Na verdade são produtos
      totalStudents: totalUserProducts,
      tagsApplied: totalTagsApplied,
      tagsRemoved: totalTagsRemoved,
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