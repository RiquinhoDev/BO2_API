// ════════════════════════════════════════════════════════════════════════════
// 📁 src/jobs/evaluateRules.job.ts
// CRON Job para avaliação diária automática de regras
// ════════════════════════════════════════════════════════════════════════════
//
// ⚠️ SCHEDULE DESATIVADO: Job migrado para wizard CRON
// Gestão: http://localhost:3000/activecampaign
//
// Este job é executado AUTOMATICAMENTE pelo wizard às horas que definiste no BO
// NÃO precisas executar manualmente - o sistema chama a função sozinho!
//
// ════════════════════════════════════════════════════════════════════════════

import Course from '../models/Course'
import { Product, UserProduct } from '../models'
import User from '../models/user'
import tagRuleEngine from '../services/ac/tagRuleEngine'

console.log('⚠️ EvaluateRules: DESATIVADO hardcoded (gerido pelo wizard)')

/**
 * Função executada AUTOMATICAMENTE pelo wizard CRON
 * Tu apenas defines o horário no BO - o sistema chama isto sozinho!
 */
export async function executeEvaluateRules() {
  console.log('🕐 Iniciando avaliação diária automática...')
  
  const startTime = Date.now()
  
  try {
    // ═══════════════════════════════════════════════════════════
    // 1. BUSCAR TODOS OS CURSOS ATIVOS
    // ═══════════════════════════════════════════════════════════
    const courses = await Course.find({ isActive: true })
    console.log(`📚 Encontrados ${courses.length} courses ativos`)
    
    let totalStudents = 0
    let totalTagsApplied = 0
    let totalTagsRemoved = 0
    const errors: any[] = []
    
    // ═══════════════════════════════════════════════════════════
    // 2. PROCESSAR CADA CURSO
    // ═══════════════════════════════════════════════════════════
    for (const course of courses) {
      try {
        console.log(`\n📖 Processando course: ${course.name} (${course.code})`)
        
        // ✅ BUSCAR PRODUTOS DO CURSO
        const products = await Product.find({
          courseId: course._id,
          isActive: true
        })
        
        if (products.length === 0) {
          console.log(`   ⚠️  Nenhum produto encontrado para ${course.code}`)
          continue
        }
        
        console.log(`   📦 ${products.length} produto(s) encontrado(s)`)
        
        const productIds = products.map(p => p._id)
        
        // ✅ BUSCAR USERPRODUCTS ATIVOS
        const userProducts = await UserProduct.find({
          productId: { $in: productIds },
          status: 'ACTIVE'
        }).distinct('userId')
        
        console.log(`   👥 ${userProducts.length} aluno(s) ativo(s)`)
        
        if (userProducts.length === 0) {
          console.log(`   ⚠️  Nenhum aluno ativo`)
          continue
        }
        
        totalStudents += userProducts.length
        
        // ✅ BUSCAR USERS
        const users = await User.find({
          _id: { $in: userProducts }
        })
        
        console.log(`   🔍 ${users.length} user(s) encontrado(s) na BD`)
        
        // ═══════════════════════════════════════════════════════════
        // 3. AVALIAR REGRAS PARA CADA ALUNO
        // ═══════════════════════════════════════════════════════════
        for (const user of users) {
          try {
            const results = await tagRuleEngine.evaluateUserRules(user.id, course._id)
            
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
              courseId: course._id,
              error: userError.message
            })
          }
        }
        
        console.log(`   ✅ ${course.name}: ${users.length} alunos processados`)
        
      } catch (courseError: any) {
        console.error(`❌ Erro ao processar course ${course._id}:`, courseError.message)
        errors.push({
          courseId: course._id,
          error: courseError.message
        })
      }
    }
    
    // ═══════════════════════════════════════════════════════════
    // 4. RESULTADO FINAL
    // ═══════════════════════════════════════════════════════════
    const duration = Date.now() - startTime
    
    console.log(`\n✅ Avaliação concluída: ${totalTagsApplied} tags aplicadas, ${totalTagsRemoved} removidas`)
    console.log(`⏱️  Duração: ${(duration / 1000).toFixed(2)}s`)
    console.log(`👥 Alunos processados: ${totalStudents}`)
    
    if (errors.length > 0) {
      console.log(`⚠️  ${errors.length} erro(s) encontrado(s)`)
    }
    
    // ✅ RETORNAR RESULTADO PARA O WIZARD REGISTAR
    return {
      success: true,
      totalCourses: courses.length,
      totalStudents,
      tagsApplied: totalTagsApplied,
      tagsRemoved: totalTagsRemoved,
      errors: errors.length,
      duration: Math.round(duration / 1000)
    }
    
  } catch (error: any) {
    console.error('❌ Erro na avaliação diária:', error)
    
    // ✅ LANÇAR ERRO PARA O WIZARD REGISTAR COMO FALHA
    throw new Error(`Erro na avaliação de regras: ${error.message}`)
  }
}

// ═══════════════════════════════════════════════════════════
// EXPORT PARA O WIZARD CHAMAR AUTOMATICAMENTE
// ═══════════════════════════════════════════════════════════

export default {
  run: executeEvaluateRules  // ← Wizard chama isto às horas que TU definiste no BO!
}