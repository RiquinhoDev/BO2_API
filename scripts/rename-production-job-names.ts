// Renomeia exclusivamente os dois nomes legacy de jobs de produção.
// Por omissão é dry-run; para escrever é necessário passar --write.

import 'dotenv/config'
import mongoose from 'mongoose'
import {
  planRenameProductionJobs,
  productionJobRenames,
  type JobRecord,
  type RenameProductionJobPlan,
} from './cron-job-change-plans'

function isWriteMode(args: string[]): boolean {
  if (args.length === 0) return false
  if (args.length === 1 && args[0] === '--write') return true
  throw new Error('Uso: ts-node scripts/rename-production-job-names.ts [--write]')
}

function display(plan: RenameProductionJobPlan): void {
  console.log(JSON.stringify({ action: plan.action, before: plan.before, after: plan.after }, null, 2))
}

async function main(): Promise<void> {
  const write = isWriteMode(process.argv.slice(2))
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI
  if (!uri) throw new Error('MONGO_URI ou MONGODB_URI não definido.')

  await mongoose.connect(uri)
  const collection = mongoose.connection.collection('cronjobconfigs')
  const legacyNames = productionJobRenames.map(({ from }) => from)
  const targetNames = productionJobRenames.map(({ to }) => to)
  const records = await collection.find({ name: { $in: [...legacyNames, ...targetNames] } }).toArray() as unknown as JobRecord[]
  const plans = planRenameProductionJobs(records)

  console.log(write ? 'MODO WRITE: alteração limitada ao campo name.' : 'DRY-RUN: nenhuma escrita será feita.')
  plans.forEach(display)

  if (!write) return

  for (const plan of plans) {
    if (plan.action === 'already-renamed') continue
    const result = await collection.updateOne(plan.filter, plan.update)
    if (result.matchedCount !== 1 || result.modifiedCount !== 1) {
      throw new Error(`Escrita inesperada para ${plan.before.name}: matched=${result.matchedCount}, modified=${result.modifiedCount}.`)
    }

    const verified = await collection.findOne({ _id: plan.filter._id, name: plan.after.name })
    if (!verified) throw new Error(`Verificação falhou: ${plan.after.name} não foi encontrado.`)
    console.log(`VERIFICADO: ${plan.before.name} -> ${plan.after.name}`)
  }
}

main()
  .catch(error => {
    console.error(`ERRO: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect()
  })
