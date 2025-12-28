// ════════════════════════════════════════════════════════════════════════════
// 📁 scripts/list-all-cron-jobs.ts
// Script: Listar TODOS os jobs CRON do sistema
// VERSÃO CORRIGIDA: Lê ficheiros reais em vez de lista hardcoded
// ════════════════════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'

// Carregar .env
dotenv.config()

// ═══════════════════════════════════════════════════════════
// IMPORTS DOS MODELOS
// ═══════════════════════════════════════════════════════════

import '../src/models/SyncModels/CronJobConfig'
import '../src/models/CronConfig'
import '../src/models/CronExecution'

const CronJobConfig = mongoose.model('CronJobConfig')
const CronConfig = mongoose.model('CronConfig')
const CronExecution = mongoose.model('CronExecution')

// ═══════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════

interface JobInfo {
  source: string
  name: string
  schedule: string
  enabled: boolean
  lastRun?: Date
  nextRun?: string
  totalRuns?: number
  successRate?: string
  description?: string
}

// ═══════════════════════════════════════════════════════════
// FUNÇÕES AUXILIARES
// ═══════════════════════════════════════════════════════════

function formatDate(date?: Date): string {
  if (!date) return 'Nunca'
  return date.toLocaleString('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function calculateNextRun(cronExpression: string): string {
  try {
    if (cronExpression === '0 2 * * *') return 'Diariamente às 02:00'
    if (cronExpression === '0 1 * * 1') return 'Segundas às 01:00'
    if (cronExpression === '*/5 * * * *') return 'A cada 5 minutos'
    return cronExpression
  } catch {
    return cronExpression
  }
}

// ═══════════════════════════════════════════════════════════
// BUSCAR JOBS DE CADA FONTE
// ═══════════════════════════════════════════════════════════

async function getJobsFromCronJobConfig(): Promise<JobInfo[]> {
  console.log('📋 Buscando jobs de CronJobConfig (Sync Utilizadores FASE 1)...')
  
  const jobs = await CronJobConfig.find({}).lean()
  
  return jobs.map((job: any) => ({
    source: 'CronJobConfig',
    name: job.name,
    schedule: job.schedule?.cronExpression || 'N/A',
    enabled: job.schedule?.enabled || false,
    lastRun: job.lastRun?.completedAt,
    nextRun: calculateNextRun(job.schedule?.cronExpression || ''),
    totalRuns: job.totalRuns || 0,
    successRate: job.successfulRuns && job.totalRuns 
      ? `${((job.successfulRuns / job.totalRuns) * 100).toFixed(1)}%`
      : 'N/A',
    description: job.description || ''
  }))
}

async function getJobsFromCronConfig(): Promise<JobInfo[]> {
  console.log('📋 Buscando jobs de CronConfig (Tag Rules - Sistema Antigo)...')
  
  const jobs = await CronConfig.find({}).lean()
  
  return jobs.map((job: any) => ({
    source: 'CronConfig',
    name: job.name,
    schedule: job.cronExpression || 'N/A',
    enabled: job.isActive || false,
    lastRun: job.lastRun,
    nextRun: calculateNextRun(job.cronExpression || ''),
    totalRuns: 0,
    successRate: 'N/A',
    description: 'Sistema antigo Tag Rules'
  }))
}

// ✅ CORRIGIDO: Agora lê ficheiros REAIS!
async function getHardcodedJobs(): Promise<JobInfo[]> {
  console.log('📋 Procurando jobs hardcoded nos ficheiros...')
  
  const jobsDir = path.join(process.cwd(), 'src', 'jobs')
  const hardcodedJobs: JobInfo[] = []
  
  // Ler todos os ficheiros .ts em src/jobs/
  const files = fs.readdirSync(jobsDir).filter(f => f.endsWith('.ts'))
  
  for (const file of files) {
    const filepath = path.join(jobsDir, file)
    const content = fs.readFileSync(filepath, 'utf-8')
    const lines = content.split('\n')
    
    // Procurar por cron.schedule( ou schedule.scheduleJob( NÃO comentados
    let hasActiveSchedule = false
    let scheduleLine = ''
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const trimmed = line.trim()
      
      // Ignorar linhas comentadas
      if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
        continue
      }
      
      // Procurar cron.schedule( ou schedule.scheduleJob(
      if ((line.includes('cron.schedule(') || line.includes('schedule.scheduleJob(')) && !trimmed.startsWith('//')) {
        hasActiveSchedule = true
        scheduleLine = trimmed
        break
      }
    }
    
    if (hasActiveSchedule) {
      // Extrair nome do ficheiro
      const jobName = file.replace('.job.ts', '').replace('.ts', '')
      
      // Tentar extrair expressão cron
      let cronExpr = 'N/A'
      const match = scheduleLine.match(/['"`]([^'"`]+)['"`]/)
      if (match) {
        cronExpr = match[1]
      }
      
      hardcodedJobs.push({
        source: 'Hardcoded',
        name: jobName,
        schedule: cronExpr,
        enabled: true,
        nextRun: calculateNextRun(cronExpr),
        description: `Job hardcoded em ${file}`
      })
    }
  }
  
  console.log(`   ✅ Encontrados ${hardcodedJobs.length} jobs hardcoded ativos`)
  
  return hardcodedJobs
}

async function getJobExecutionStats(): Promise<Map<string, any>> {
  console.log('📊 Calculando estatísticas de execução...')
  
  const stats = new Map<string, any>()
  
  const since = new Date()
  since.setDate(since.getDate() - 30)
  
  const executions = await CronExecution.find({
    startTime: { $gte: since }
  }).lean()
  
  executions.forEach((exec: any) => {
    const name = exec.cronName
    
    if (!stats.has(name)) {
      stats.set(name, {
        total: 0,
        success: 0,
        error: 0,
        lastRun: null,
        avgDuration: 0
      })
    }
    
    const stat = stats.get(name)
    stat.total++
    
    if (exec.status === 'success') stat.success++
    if (exec.status === 'error') stat.error++
    
    if (!stat.lastRun || exec.startTime > stat.lastRun) {
      stat.lastRun = exec.startTime
    }
    
    if (exec.duration) {
      stat.avgDuration += exec.duration
    }
  })
  
  stats.forEach((stat, name) => {
    if (stat.total > 0) {
      stat.avgDuration = Math.round(stat.avgDuration / stat.total / 1000)
      stat.successRate = `${((stat.success / stat.total) * 100).toFixed(1)}%`
    }
  })
  
  return stats
}

// ═══════════════════════════════════════════════════════════
// GERAR RELATÓRIO MARKDOWN
// ═══════════════════════════════════════════════════════════

function generateMarkdownReport(
  allJobs: JobInfo[], 
  executionStats: Map<string, any>
): string {
  const now = new Date()
  
  let md = `# 📋 RELATÓRIO DE JOBS CRON - SISTEMA COMPLETO\n\n`
  md += `**Data de geração:** ${formatDate(now)}\n`
  md += `**Total de jobs encontrados:** ${allJobs.length}\n\n`
  
  md += `═══════════════════════════════════════════════════════════════\n\n`
  
  const enabledCount = allJobs.filter(j => j.enabled).length
  const disabledCount = allJobs.filter(j => !j.enabled).length
  const sources = [...new Set(allJobs.map(j => j.source))]
  
  md += `## 📊 RESUMO GERAL\n\n`
  md += `\`\`\`\n`
  md += `Total de Jobs: ${allJobs.length}\n`
  md += `  ✅ Ativos: ${enabledCount}\n`
  md += `  ⏸️  Inativos: ${disabledCount}\n\n`
  md += `Fontes:\n`
  sources.forEach(source => {
    const count = allJobs.filter(j => j.source === source).length
    md += `  - ${source}: ${count} jobs\n`
  })
  md += `\`\`\`\n\n`
  
  sources.forEach(source => {
    md += `## 🔷 JOBS DE: ${source}\n\n`
    
    const jobs = allJobs.filter(j => j.source === source)
    
    jobs.forEach(job => {
      const stats = executionStats.get(job.name)
      
      md += `### ${job.enabled ? '✅' : '⏸️'} ${job.name}\n\n`
      
      md += `| Campo | Valor |\n`
      md += `|-------|-------|\n`
      md += `| **Schedule** | \`${job.schedule}\` |\n`
      md += `| **Próxima execução** | ${job.nextRun || 'N/A'} |\n`
      md += `| **Status** | ${job.enabled ? '🟢 ATIVO' : '🔴 INATIVO'} |\n`
      
      if (job.description) {
        md += `| **Descrição** | ${job.description} |\n`
      }
      
      if (stats) {
        md += `| **Última execução** | ${formatDate(stats.lastRun)} |\n`
        md += `| **Total execuções (30d)** | ${stats.total} |\n`
        md += `| **Taxa de sucesso** | ${stats.successRate} |\n`
        md += `| **Duração média** | ${stats.avgDuration}s |\n`
      } else if (job.lastRun) {
        md += `| **Última execução** | ${formatDate(job.lastRun)} |\n`
      }
      
      if (job.totalRuns !== undefined && job.totalRuns > 0) {
        md += `| **Total execuções** | ${job.totalRuns} |\n`
        md += `| **Taxa de sucesso** | ${job.successRate} |\n`
      }
      
      md += `\n`
    })
    
    md += `\n`
  })
  
  md += `## ⚠️ ANÁLISE DE DUPLICAÇÕES\n\n`
  
  const schedules = new Map<string, JobInfo[]>()
  allJobs.filter(j => j.enabled).forEach(job => {
    const key = job.schedule
    if (!schedules.has(key)) {
      schedules.set(key, [])
    }
    schedules.get(key)!.push(job)
  })
  
  let duplicationsFound = false
  
  schedules.forEach((jobs, schedule) => {
    if (jobs.length > 1) {
      duplicationsFound = true
      md += `### ⚠️ Múltiplos jobs no horário: \`${schedule}\`\n\n`
      jobs.forEach(job => {
        md += `- **${job.name}** (${job.source})\n`
        if (job.description) {
          md += `  - ${job.description}\n`
        }
      })
      md += `\n**ATENÇÃO:** Verificar se há duplicação de esforços!\n\n`
    }
  })
  
  if (!duplicationsFound) {
    md += `✅ Nenhuma duplicação de horário detectada!\n\n`
  }
  
  md += `═══════════════════════════════════════════════════════════════\n\n`
  
  md += `## 💡 RECOMENDAÇÕES\n\n`
  
  if (disabledCount > 0) {
    md += `1. **Jobs inativos:** ${disabledCount} jobs estão desativados. Considerar remover se não são mais necessários.\n\n`
  }
  
  if (duplicationsFound) {
    md += `2. **Duplicações:** Verificar jobs que executam no mesmo horário para evitar conflitos.\n\n`
  }
  
  md += `3. **Frontend:** Verificar se todos os ${enabledCount} jobs ativos aparecem no dashboard.\n\n`
  
  md += `4. **Monitorização:** Implementar alertas para jobs que falham consistentemente.\n\n`
  
  md += `═══════════════════════════════════════════════════════════════\n\n`
  
  md += `**Relatório gerado por:** \`scripts/list-all-cron-jobs.ts\`\n`
  md += `**Comando:** \`npx ts-node scripts/list-all-cron-jobs.ts\`\n`
  
  return md
}

// ═══════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════

async function main() {
  console.log('🚀 ════════════════════════════════════════════════════════')
  console.log('🚀 LISTANDO TODOS OS JOBS CRON DO SISTEMA')
  console.log('🚀 ════════════════════════════════════════════════════════\n')
  
  try {
    console.log('📡 Conectando ao MongoDB...')
    await mongoose.connect(process.env.MONGO_URI || '')
    console.log('✅ Conectado!\n')
    
    const jobs1 = await getJobsFromCronJobConfig()
    const jobs2 = await getJobsFromCronConfig()
    const jobs3 = await getHardcodedJobs()
    
    const allJobs = [...jobs1, ...jobs2, ...jobs3]
    
    console.log(`\n✅ Total de jobs encontrados: ${allJobs.length}`)
    console.log(`   - CronJobConfig: ${jobs1.length}`)
    console.log(`   - CronConfig: ${jobs2.length}`)
    console.log(`   - Hardcoded: ${jobs3.length}\n`)
    
    const executionStats = await getJobExecutionStats()
    console.log(`✅ Estatísticas calculadas para ${executionStats.size} jobs\n`)
    
    console.log('📝 Gerando relatório Markdown...')
    const markdown = generateMarkdownReport(allJobs, executionStats)
    
    const outputDir = path.join(process.cwd(), 'reports')
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true })
    }
    
    const timestamp = new Date().toISOString().split('T')[0]
    const outputPath = path.join(outputDir, `cron-jobs-report-${timestamp}.md`)
    
    fs.writeFileSync(outputPath, markdown, 'utf-8')
    
    console.log(`✅ Relatório guardado em: ${outputPath}\n`)
    
    console.log('📊 ════════════════════════════════════════════════════════')
    console.log('📊 RESUMO RÁPIDO')
    console.log('📊 ════════════════════════════════════════════════════════\n')
    
    allJobs.forEach(job => {
      const status = job.enabled ? '✅' : '⏸️ '
      console.log(`${status} ${job.name.padEnd(30)} | ${job.schedule.padEnd(15)} | ${job.source}`)
    })
    
    console.log('\n✅ ════════════════════════════════════════════════════════')
    console.log('✅ SCRIPT CONCLUÍDO COM SUCESSO!')
    console.log('✅ ════════════════════════════════════════════════════════')
    console.log(`\n📄 Ver relatório completo: ${outputPath}\n`)
    
  } catch (error: any) {
    console.error('\n❌ ════════════════════════════════════════════════════════')
    console.error('❌ ERRO AO EXECUTAR SCRIPT')
    console.error('❌ ════════════════════════════════════════════════════════\n')
    console.error(error.message)
    console.error(error.stack)
    process.exit(1)
  } finally {
    await mongoose.disconnect()
    console.log('👋 Desconectado do MongoDB\n')
  }
}

main()