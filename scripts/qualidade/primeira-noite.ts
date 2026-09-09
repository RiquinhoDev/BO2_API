// O que a PRIMEIRA noite faria, se ligássemos os escritores hoje.
// Tudo em dryRun: nada sai para a ActiveCampaign.
import { loadConfig } from '../../src/config/appConfig'
import { initializeRuntimeConfig } from '../../src/config/runtimeConfig'
initializeRuntimeConfig(loadConfig(process.env))
import mongoose from 'mongoose'
import { syncAcExpirationDates } from '../../src/services/renewal/acExpirationSync.service'
import { syncTurmaTags } from '../../src/services/renewal/acTurmaTagSync.service'
import { handleRefunds } from '../../src/services/renewal/refundHandler.service'

const mostra = (titulo: string, r: any) => {
  console.log('\n' + '═'.repeat(60) + '\n' + titulo + '\n')
  for (const [k, v] of Object.entries(r)) {
    if (Array.isArray(v)) console.log('  ' + String(k).padEnd(24), v.length, 'itens')
    else console.log('  ' + String(k).padEnd(24), v)
  }
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI!)
  mostra('EXPIRAÇÃO (332)', await syncAcExpirationDates({ dryRun: true }))
  mostra('TAGS DE TURMA', await syncTurmaTags({ dryRun: true }))
  mostra('REEMBOLSOS', await handleRefunds({ dryRun: true }))
  await mongoose.disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) })
