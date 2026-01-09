import fs from 'fs'

const logFile = process.argv[2]

if (!logFile) {
  console.log('Usage: ts-node analyze-logs.ts <log-file>')
  process.exit(1)
}

const content = fs.readFileSync(logFile, 'utf-8')
const logs = content.split('\n').filter(Boolean).map(line => {
  try {
    return JSON.parse(line)
  } catch {
    return null
  }
}).filter(Boolean)

console.log('═══════════════════════════════════════════════════════════════')
console.log('📊 ANÁLISE DE LOGS')
console.log('═══════════════════════════════════════════════════════════════\n')

console.log(`Total de logs: ${logs.length}`)

const byModule: Record<string, number> = {}
const byLevel: Record<string, number> = {}

logs.forEach((log: any) => {
  byModule[log.module] = (byModule[log.module] || 0) + 1
  byLevel[log.level] = (byLevel[log.level] || 0) + 1
})

console.log('\nPor módulo:')
Object.entries(byModule).sort((a, b) => b[1] - a[1]).forEach(([module, count]) => {
  console.log(`  ${module}: ${count}`)
})

console.log('\nPor nível:')
Object.entries(byLevel).forEach(([level, count]) => {
  console.log(`  ${level}: ${count}`)
})

// Find DecisionEngine context
const contextLog = logs.find((l: any) => l.action?.includes('Context loaded'))
if (contextLog) {
  console.log('\n📋 Contexto DecisionEngine:')
  console.log(`  Produto: ${contextLog.data?.productName}`)
  console.log(`  Regras: ${contextLog.data?.rulesCount}`)
  console.log(`  Email: ${contextLog.data?.userEmail}`)
}

// Find Rules split
const splitLog = logs.find((l: any) => l.action?.includes('Rules split'))
if (splitLog) {
  console.log('\n🎯 Divisão de Regras:')
  console.log(`  Level Rules: ${splitLog.data?.levelRulesCount}`)
  console.log(`  Regular Rules: ${splitLog.data?.regularRulesCount}`)
}

// Count errors
const errors = logs.filter((l: any) => l.level === 'ERROR' || l.level === 'CRITICAL')
if (errors.length > 0) {
  console.log(`\n❌ Erros: ${errors.length}`)
  errors.forEach((err: any) => {
    console.log(`  [${err.module}] ${err.action}`)
    if (err.error) {
      console.log(`    ${err.error.message}`)
    }
  })
}

console.log('\n═══════════════════════════════════════════════════════════════')
