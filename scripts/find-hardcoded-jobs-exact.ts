// ════════════════════════════════════════════════════════════
// 📁 scripts/find-hardcoded-jobs-exact.ts
// Encontrar EXATAMENTE quais ficheiros têm jobs hardcoded
// ════════════════════════════════════════════════════════════

import fs from 'fs'
import path from 'path'

const JOBS_DIR = path.join(process.cwd(), 'src', 'jobs')

interface JobFound {
  file: string
  line: number
  code: string
  type: 'cron.schedule' | 'schedule.scheduleJob'
}

function findHardcodedJobs(): JobFound[] {
  const found: JobFound[] = []
  
  // Listar todos os ficheiros .ts em src/jobs/
  const files = fs.readdirSync(JOBS_DIR).filter(f => f.endsWith('.ts'))
  
  for (const file of files) {
    const filepath = path.join(JOBS_DIR, file)
    const content = fs.readFileSync(filepath, 'utf-8')
    const lines = content.split('\n')
    
    lines.forEach((line, index) => {
      const trimmed = line.trim()
      
      // Ignorar linhas comentadas
      if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
        return
      }
      
      // Procurar por cron.schedule(
      if (line.includes('cron.schedule(') && !trimmed.startsWith('//')) {
        found.push({
          file,
          line: index + 1,
          code: trimmed.substring(0, 80),
          type: 'cron.schedule'
        })
      }
      
      // Procurar por schedule.scheduleJob(
      if (line.includes('schedule.scheduleJob(') && !trimmed.startsWith('//')) {
        found.push({
          file,
          line: index + 1,
          code: trimmed.substring(0, 80),
          type: 'schedule.scheduleJob'
        })
      }
    })
  }
  
  return found
}

// ═══════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════

console.clear()
console.log('═'.repeat(70))
console.log('🔍 PROCURAR JOBS HARDCODED ATIVOS')
console.log('═'.repeat(70))
console.log()

const jobs = findHardcodedJobs()

if (jobs.length === 0) {
  console.log('✅ NENHUM JOB HARDCODED ENCONTRADO!')
  console.log()
  console.log('🎉 Sistema 100% migrado para wizard!')
  console.log()
} else {
  console.log(`❌ ENCONTRADOS ${jobs.length} JOBS HARDCODED:\n`)
  
  // Agrupar por ficheiro
  const byFile = new Map<string, JobFound[]>()
  
  jobs.forEach(job => {
    if (!byFile.has(job.file)) {
      byFile.set(job.file, [])
    }
    byFile.get(job.file)!.push(job)
  })
  
  // Mostrar agrupado
  byFile.forEach((jobs, file) => {
    console.log(`📁 ${file}`)
    jobs.forEach(job => {
      console.log(`   Linha ${job.line}: ${job.type}`)
      console.log(`   ${job.code}${job.code.length >= 80 ? '...' : ''}`)
      console.log()
    })
  })
  
  console.log('═'.repeat(70))
  console.log('📋 FICHEIROS A CORRIGIR:')
  console.log('═'.repeat(70))
  console.log()
  
  Array.from(byFile.keys()).forEach((file, index) => {
    console.log(`${index + 1}. src/jobs/${file}`)
  })
  
  console.log()
  console.log('💡 SOLUÇÃO: Comentar cron.schedule() e schedule.scheduleJob() em cada ficheiro')
  console.log()
}

console.log('═'.repeat(70))