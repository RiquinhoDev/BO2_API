// ════════════════════════════════════════════════════════════
// 📁 scripts/restore-backups.ts
// Restaurar ficheiros originais dos backups
// ════════════════════════════════════════════════════════════

import fs from 'fs'
import path from 'path'

const JOBS_DIR = path.join(process.cwd(), 'src', 'jobs')

const FILES = [
  'dailyPipeline.job.ts',
  'evaluateRules.job.ts',
  'resetCounters.job.ts',
  'cronExecutionCleanup.job.ts',
  'rebuildDashboardStats.job.ts',
  'index.ts'
]

async function main() {
  console.log('🔄 RESTAURANDO BACKUPS...\n')
  
  let restored = 0
  let notFound = 0
  
  for (const file of FILES) {
    const filepath = path.join(JOBS_DIR, file)
    const backupPath = filepath + '.backup'
    
    if (fs.existsSync(backupPath)) {
      fs.copyFileSync(backupPath, filepath)
      console.log(`✅ ${file} - restaurado`)
      restored++
    } else {
      console.log(`⏭️  ${file} - sem backup`)
      notFound++
    }
  }
  
  console.log()
  console.log('═'.repeat(70))
  console.log(`✅ Restaurados: ${restored}`)
  console.log(`⏭️  Sem backup: ${notFound}`)
  console.log('═'.repeat(70))
  console.log()
  console.log('📋 Ficheiros restaurados para estado original.')
  console.log('📋 Agora podes tentar novamente.')
  console.log()
}

main()