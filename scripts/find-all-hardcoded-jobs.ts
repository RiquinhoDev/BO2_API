// ════════════════════════════════════════════════════════════
// 📁 scripts/find-all-hardcoded-jobs.ts
// Procurar jobs hardcoded em TODO o projeto (não só jobs/)
// ════════════════════════════════════════════════════════════

import fs from 'fs'
import path from 'path'

interface JobFound {
  file: string
  relativePath: string
  line: number
  code: string
  type: 'cron.schedule' | 'schedule.scheduleJob'
}

function scanDirectory(dir: string, baseDir: string, results: JobFound[]) {
  const files = fs.readdirSync(dir)
  
  for (const file of files) {
    const filepath = path.join(dir, file)
    const stat = fs.statSync(filepath)
    
    // Ignorar node_modules, dist, build, etc
    if (file === 'node_modules' || file === 'dist' || file === 'build' || file === '.git') {
      continue
    }
    
    if (stat.isDirectory()) {
      // Recursivo
      scanDirectory(filepath, baseDir, results)
    } else if (file.endsWith('.ts') || file.endsWith('.js')) {
      // Scan ficheiro
      const content = fs.readFileSync(filepath, 'utf-8')
      const lines = content.split('\n')
      
      lines.forEach((line, index) => {
        const trimmed = line.trim()
        
        // Ignorar linhas comentadas
        if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
          return
        }
        
        // Ignorar dentro de blocos de comentários /* ... */
        // (simplificado - pode ter falsos negativos)
        
        // Procurar por cron.schedule(
        if (line.includes('cron.schedule(') && !trimmed.startsWith('//')) {
          const relativePath = path.relative(baseDir, filepath)
          results.push({
            file: path.basename(filepath),
            relativePath: relativePath.replace(/\\/g, '/'),
            line: index + 1,
            code: trimmed.substring(0, 80),
            type: 'cron.schedule'
          })
        }
        
        // Procurar por schedule.scheduleJob(
        if (line.includes('schedule.scheduleJob(') && !trimmed.startsWith('//')) {
          const relativePath = path.relative(baseDir, filepath)
          results.push({
            file: path.basename(filepath),
            relativePath: relativePath.replace(/\\/g, '/'),
            line: index + 1,
            code: trimmed.substring(0, 80),
            type: 'schedule.scheduleJob'
          })
        }
      })
    }
  }
}

// ═══════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════

console.clear()
console.log('═'.repeat(70))
console.log('🔍 PROCURAR JOBS HARDCODED EM TODO O PROJETO')
console.log('═'.repeat(70))
console.log()
console.log('📂 Procurando em: src/')
console.log('🔎 Padrões: cron.schedule() e schedule.scheduleJob()')
console.log()

const SRC_DIR = path.join(process.cwd(), 'src')
const jobs: JobFound[] = []

scanDirectory(SRC_DIR, SRC_DIR, jobs)

if (jobs.length === 0) {
  console.log('✅ NENHUM JOB HARDCODED ENCONTRADO EM TODO O PROJETO!')
  console.log()
  console.log('🎉 Sistema 100% migrado para wizard!')
  console.log()
} else {
  console.log(`❌ ENCONTRADOS ${jobs.length} JOBS HARDCODED:\n`)
  
  // Agrupar por directório
  const byDir = new Map<string, JobFound[]>()
  
  jobs.forEach(job => {
    const dir = path.dirname(job.relativePath)
    if (!byDir.has(dir)) {
      byDir.set(dir, [])
    }
    byDir.get(dir)!.push(job)
  })
  
  // Mostrar agrupado por directório
  byDir.forEach((jobs, dir) => {
    console.log(`📁 ${dir}/`)
    jobs.forEach(job => {
      console.log(`   ${job.file} (linha ${job.line})`)
      console.log(`   ${job.type}`)
      console.log(`   ${job.code}${job.code.length >= 80 ? '...' : ''}`)
      console.log()
    })
  })
  
  console.log('═'.repeat(70))
  console.log('📋 RESUMO POR LOCALIZAÇÃO:')
  console.log('═'.repeat(70))
  console.log()
  
  // Contar por directório
  const counts = new Map<string, number>()
  jobs.forEach(job => {
    const dir = path.dirname(job.relativePath).split('/')[0]
    counts.set(dir, (counts.get(dir) || 0) + 1)
  })
  
  counts.forEach((count, dir) => {
    console.log(`   ${dir}/: ${count} job(s)`)
  })
  
  console.log()
  console.log('═'.repeat(70))
  console.log('📋 LISTA COMPLETA DE FICHEIROS:')
  console.log('═'.repeat(70))
  console.log()
  
  const uniqueFiles = new Set(jobs.map(j => j.relativePath))
  Array.from(uniqueFiles).sort().forEach((file, index) => {
    console.log(`${index + 1}. src/${file}`)
  })
  
  console.log()
  console.log('💡 SOLUÇÃO: Comentar todos os cron.schedule() e schedule.scheduleJob()')
  console.log()
}

console.log('═'.repeat(70))