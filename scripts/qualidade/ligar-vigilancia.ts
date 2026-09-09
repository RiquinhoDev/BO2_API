// Liga SÓ o cron AcTagWatch. Lê antes, escreve um campo, lê depois.
// Não toca em mais nenhum job.
import { loadConfig } from '../../src/config/appConfig'
import { initializeRuntimeConfig } from '../../src/config/runtimeConfig'
initializeRuntimeConfig(loadConfig(process.env))
import mongoose from 'mongoose'

const ALVO = 'AcTagWatch'

async function main() {
  await mongoose.connect(process.env.MONGO_URI!)
  const col = mongoose.connection.collection('cronjobconfigs')

  const antes = await col.findOne({ name: ALVO })
  if (!antes) throw new Error(`job ${ALVO} não existe`)
  console.log('ANTES :', ALVO, '| enabled =', antes.schedule?.enabled, '| cron =', antes.schedule?.cronExpression, '| corridas =', antes.totalRuns)

  const r = await col.updateOne({ name: ALVO }, { $set: { 'schedule.enabled': true } })
  console.log('modificados:', r.modifiedCount)

  const depois = await col.findOne({ name: ALVO })
  console.log('DEPOIS:', ALVO, '| enabled =', depois?.schedule?.enabled)

  // confirma que mais nenhum job mudou de estado
  const todos = await col.find({}).project({ name: 1, 'schedule.enabled': 1 }).toArray()
  const ligados = todos.filter((d: any) => d.schedule?.enabled).map((d: any) => d.name).sort()
  console.log('\njobs ligados agora (' + ligados.length + '):')
  for (const n of ligados) console.log('  ', n)
  const renovacaoOff = todos
    .filter((d: any) => ['RenewalPipeline', 'AcExpirationSync', 'AcTurmaTagSync', 'AcRefundHandler', 'RenewalAcSync'].includes(d.name))
    .map((d: any) => `${d.name}=${d.schedule?.enabled}`)
  console.log('\nos escritores continuam:', renovacaoOff.join('  '))
  await mongoose.disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) })
