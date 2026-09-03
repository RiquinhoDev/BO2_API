// Desarma exclusivamente o job legacy TAG_RULES_SYNC em cronconfigs.
// Por omissão é dry-run; para escrever é necessário passar --write.

import 'dotenv/config'
import mongoose from 'mongoose'
import { planDisableTagRulesSync, type JobRecord } from './cron-job-change-plans'

function isWriteMode(args: string[]): boolean {
  if (args.length === 0) return false
  if (args.length === 1 && args[0] === '--write') return true
  throw new Error('Uso: ts-node scripts/disable-tag-rules-sync.ts [--write]')
}

function display(plan: ReturnType<typeof planDisableTagRulesSync>): void {
  console.log(JSON.stringify({ action: plan.action, before: plan.before, after: plan.after }, null, 2))
}

async function main(): Promise<void> {
  const write = isWriteMode(process.argv.slice(2))
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI
  if (!uri) throw new Error('MONGO_URI ou MONGODB_URI não definido.')

  await mongoose.connect(uri)
  const collection = mongoose.connection.collection('cronconfigs')
  const records = await collection.find({ name: 'TAG_RULES_SYNC' }).toArray() as unknown as JobRecord[]
  const plan = planDisableTagRulesSync(records)

  console.log(write ? 'MODO WRITE: alteração limitada a isActive:false.' : 'DRY-RUN: nenhuma escrita será feita.')
  display(plan)

  if (!write || plan.action === 'already-disabled') return

  const result = await collection.updateOne(plan.filter, plan.update)
  if (result.matchedCount !== 1 || result.modifiedCount !== 1) {
    throw new Error(`Escrita inesperada: matched=${result.matchedCount}, modified=${result.modifiedCount}.`)
  }

  const verified = await collection.findOne({ _id: plan.filter._id, name: 'TAG_RULES_SYNC' })
  if (!verified || verified.isActive !== false) {
    throw new Error('Verificação falhou: TAG_RULES_SYNC não ficou com isActive:false.')
  }
  console.log('VERIFICADO: TAG_RULES_SYNC.isActive=false')
}

main()
  .catch(error => {
    console.error(`ERRO: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect()
  })
