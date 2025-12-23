// ════════════════════════════════════════════════════════════════════════════
// 📁 SUBSTITUIR: src/jobs/evaluateRules.job.ts
// CRON Job CORRIGIDO para avaliação diária automática de regras
// ════════════════════════════════════════════════════════════════════════════

import cron from 'node-cron'
import Course from '../models/Course'
import { Product, UserProduct } from '../models'
import User from '../models/user'
import tagRuleEngine from '../services/ac/tagRuleEngine'
import CronExecutionLog from '../models/CronExecutionLog'

const CRON_SCHEDULE = '0 2 * * *' // Todos os dias às 2h da manhã

console.log('✅ CRON Job de avaliação diária configurado (todos os dias às 2h)')

cron.schedule(CRON_SCHEDULE, async () => {
  console.log('🕐 Iniciando avaliação diária automática...')
  
  const startTime = Date.now()
  const executionId = `EVAL_${Date.now()}`
  
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
    // 4. REGISTAR EXECUÇÃO
    // ═══════════════════════════════════════════════════════════
    const duration = Date.now() - startTime
    
    await CronExecutionLog.create({
      executionId,
      type: 'daily-evaluation',
      status: 'success',
      startedAt: new Date(startTime),
      finishedAt: new Date(),
      duration,
      results: {
        totalCourses: courses.length,
        totalStudents,
        tagsApplied: totalTagsApplied,
        tagsRemoved: totalTagsRemoved,
        errors
      }
    })
    
    console.log(`\n✅ Avaliação concluída: ${totalTagsApplied} tags aplicadas, ${totalTagsRemoved} removidas`)
    console.log(`⏱️  Duração: ${(duration / 1000).toFixed(2)}s`)
    console.log(`👥 Alunos processados: ${totalStudents}`)
    
    if (errors.length > 0) {
      console.log(`⚠️  ${errors.length} erro(s) encontrado(s)`)
    }
    
  } catch (error: any) {
    console.error('❌ Erro na avaliação diária:', error)
    
    await CronExecutionLog.create({
      executionId,
      type: 'daily-evaluation',
      status: 'failed',
      startedAt: new Date(startTime),
      finishedAt: new Date(),
      duration: Date.now() - startTime,
      results: {
        error: error.message
      }
    })
  }
})

export default {}