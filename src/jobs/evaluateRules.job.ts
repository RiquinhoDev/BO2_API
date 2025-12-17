// =====================================================
// 📁 src/jobs/evaluateRules.job.ts
// CRON Job para avaliação diária automática de regras
// =====================================================

import cron from 'node-cron'
import Course from '../models/Course'
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
    // Buscar todos os cursos ativos
    const courses = await Course.find({ isActive: true })
    
    let totalStudents = 0
    let totalTagsApplied = 0
    let totalTagsRemoved = 0
    const errors: any[] = []
    
    // Processar cada curso
    for (const course of courses) {
      try {
        const courseKey = course.code
        const users = await User.find({
          [`communicationByCourse.${courseKey}`]: { $exists: true }
        })
        
        totalStudents += users.length
        
        // Avaliar regras para cada aluno
        for (const user of users) {
          try {
            const results = await tagRuleEngine.evaluateUserRules(user._id, course._id)
            
            results.forEach(result => {
              if (result.executed) {
                if (result.action === 'ADD_TAG') totalTagsApplied++
                if (result.action === 'REMOVE_TAG') totalTagsRemoved++
              }
            })
          } catch (userError: any) {
            errors.push({
              userId: user._id,
              error: userError.message
            })
          }
        }
        
        console.log(`✅ ${course.name}: ${users.length} alunos processados`)
      } catch (courseError: any) {
        errors.push({
          courseId: course._id,
          error: courseError.message
        })
      }
    }
    
    const duration = Date.now() - startTime
    
    // Registar execução
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
    
    console.log(`✅ Avaliação concluída: ${totalTagsApplied} tags aplicadas, ${totalTagsRemoved} removidas`)
    console.log(`⏱️  Duração: ${(duration / 1000).toFixed(2)}s`)
    
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
