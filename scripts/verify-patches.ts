// ═══════════════════════════════════════════════════════════
// 🔍 VERIFICAR: Patches do scheduler foram aplicados?
// ═══════════════════════════════════════════════════════════

import fs from 'fs'
import path from 'path'

console.log('🔍 Verificando se patches foram aplicados...\n')

const schedulerPath = path.join(process.cwd(), 'src/services/syncUtilziadoresServices/scheduler.ts')

console.log(`📂 Ficheiro: ${schedulerPath}`)
console.log()

try {
  const content = fs.readFileSync(schedulerPath, 'utf-8')
  
  // ═══════════════════════════════════════════════════════════
  // VERIFICAÇÃO 1: Método executeSpecificJob existe?
  // ═══════════════════════════════════════════════════════════
  
  console.log('═'.repeat(70))
  console.log('✅ VERIFICAÇÃO 1: Método executeSpecificJob')
  console.log('═'.repeat(70))
  
  if (content.includes('executeSpecificJob')) {
    console.log('✅ Método executeSpecificJob EXISTE\n')
    
    // Verificar se está implementado
    if (content.includes('EvaluateRules')) {
      console.log('✅ Contém lógica para EvaluateRules')
    } else {
      console.log('❌ NÃO contém lógica para EvaluateRules')
    }
    
    if (content.includes('ResetCounters')) {
      console.log('✅ Contém lógica para ResetCounters')
    } else {
      console.log('❌ NÃO contém lógica para ResetCounters')
    }
    
    if (content.includes('RebuildDashboardStats')) {
      console.log('✅ Contém lógica para RebuildDashboardStats')
    } else {
      console.log('❌ NÃO contém lógica para RebuildDashboardStats')
    }
    
    if (content.includes('CronExecutionCleanup')) {
      console.log('✅ Contém lógica para CronExecutionCleanup')
    } else {
      console.log('❌ NÃO contém lógica para CronExecutionCleanup')
    }
    
  } else {
    console.log('❌ Método executeSpecificJob NÃO EXISTE!')
    console.log('⚠️  PATCH NÃO FOI APLICADO!')
  }
  
  console.log()
  
  // ═══════════════════════════════════════════════════════════
  // VERIFICAÇÃO 2: executeSyncJob chama executeSpecificJob?
  // ═══════════════════════════════════════════════════════════
  
  console.log('═'.repeat(70))
  console.log('✅ VERIFICAÇÃO 2: executeSyncJob modificado')
  console.log('═'.repeat(70))
  
  if (content.includes('jobsWithSpecificLogic')) {
    console.log('✅ executeSyncJob tem verificação de jobs específicos\n')
    
    if (content.includes('return await this.executeSpecificJob(job)')) {
      console.log('✅ Chama executeSpecificJob corretamente')
    } else {
      console.log('❌ NÃO chama executeSpecificJob')
    }
    
  } else {
    console.log('❌ executeSyncJob NÃO foi modificado!')
    console.log('⚠️  PATCH NÃO FOI APLICADO!')
  }
  
  console.log()
  
  // ═══════════════════════════════════════════════════════════
  // VERIFICAÇÃO 3: Imports dos ficheiros .job.ts
  // ═══════════════════════════════════════════════════════════
  
  console.log('═'.repeat(70))
  console.log('✅ VERIFICAÇÃO 3: Imports dinâmicos')
  console.log('═'.repeat(70))
  
  if (content.includes("import('../../jobs/evaluateRules.job')")) {
    console.log('✅ Import de evaluateRules.job presente')
  } else {
    console.log('❌ Import de evaluateRules.job AUSENTE')
  }
  
  if (content.includes("import('../../jobs/resetCounters.job')")) {
    console.log('✅ Import de resetCounters.job presente')
  } else {
    console.log('❌ Import de resetCounters.job AUSENTE')
  }
  
  if (content.includes("import('../../jobs/rebuildDashboardStats.job')")) {
    console.log('✅ Import de rebuildDashboardStats.job presente')
  } else {
    console.log('❌ Import de rebuildDashboardStats.job AUSENTE')
  }
  
  if (content.includes("import('../../jobs/cronExecutionCleanup.job')")) {
    console.log('✅ Import de cronExecutionCleanup.job presente')
  } else {
    console.log('❌ Import de cronExecutionCleanup.job AUSENTE')
  }
  
  console.log()
  
  // ═══════════════════════════════════════════════════════════
  // VERIFICAÇÃO 4: Ficheiros .job.ts existem?
  // ═══════════════════════════════════════════════════════════
  
  console.log('═'.repeat(70))
  console.log('✅ VERIFICAÇÃO 4: Ficheiros .job.ts')
  console.log('═'.repeat(70))
  
  const jobFiles = [
    'evaluateRules.job.ts',
    'resetCounters.job.ts',
    'rebuildDashboardStats.job.ts',
    'cronExecutionCleanup.job.ts'
  ]
  
  for (const file of jobFiles) {
    const filePath = path.join(process.cwd(), 'src/jobs', file)
    
    if (fs.existsSync(filePath)) {
      console.log(`✅ ${file} existe`)
      
      // Verificar export
      const jobContent = fs.readFileSync(filePath, 'utf-8')
      
      if (jobContent.includes('export default')) {
        console.log(`   ✅ Tem export default`)
        
        if (jobContent.includes('run:')) {
          console.log(`   ✅ Exporta método run`)
        } else {
          console.log(`   ❌ NÃO exporta método run`)
        }
      } else {
        console.log(`   ❌ NÃO tem export default`)
      }
      
    } else {
      console.log(`❌ ${file} NÃO existe!`)
    }
  }
  
  console.log()
  
  // ═══════════════════════════════════════════════════════════
  // RESUMO
  // ═══════════════════════════════════════════════════════════
  
  console.log('═'.repeat(70))
  console.log('📊 RESUMO')
  console.log('═'.repeat(70))
  
  const hasExecuteSpecificJob = content.includes('executeSpecificJob')
  const hasModifiedExecuteSyncJob = content.includes('jobsWithSpecificLogic')
  const hasImports = content.includes("import('../../jobs/evaluateRules.job')")
  
  if (hasExecuteSpecificJob && hasModifiedExecuteSyncJob && hasImports) {
    console.log('✅ PATCHES APLICADOS CORRETAMENTE!')
    console.log()
    console.log('⚠️  MAS jobs ainda demoram muito...')
    console.log('⚠️  Problema pode ser nos ficheiros .job.ts!')
  } else {
    console.log('❌ PATCHES NÃO FORAM APLICADOS!')
    console.log()
    console.log('📋 AÇÕES NECESSÁRIAS:')
    
    if (!hasExecuteSpecificJob) {
      console.log('   1. Adicionar método executeSpecificJob')
    }
    
    if (!hasModifiedExecuteSyncJob) {
      console.log('   2. Modificar método executeSyncJob')
    }
    
    if (!hasImports) {
      console.log('   3. Adicionar imports dinâmicos')
    }
  }
  
  console.log()
  
} catch (error: any) {
  console.error('❌ Erro ao ler ficheiro:', error.message)
}