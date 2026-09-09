// Corrida em seco da vigilância, antes de ligar o interruptor.
// dryRun: true  → não grava eventos.  actualizarEspelho: false → não mexe no espelho.
import { loadConfig } from '../../src/config/appConfig'
import { initializeRuntimeConfig } from '../../src/config/runtimeConfig'
initializeRuntimeConfig(loadConfig(process.env))
import mongoose from 'mongoose'
import { correrAcTagWatch } from '../../src/services/renewal/acTagWatch.service'

async function main() {
  await mongoose.connect(process.env.MONGO_URI!)
  const antes = await mongoose.connection.collection('actagevents').countDocuments()
  console.log('eventos em actagevents ANTES:', antes)

  const r: any = await correrAcTagWatch({ dryRun: true, actualizarEspelho: false })

  console.log('\n─── relatório ───')
  for (const [k, v] of Object.entries(r)) {
    if (Array.isArray(v)) console.log(String(k).padEnd(22), v.length, 'itens')
    else if (v && typeof v === 'object') console.log(String(k).padEnd(22), JSON.stringify(v))
    else console.log(String(k).padEnd(22), v)
  }

  const depois = await mongoose.connection.collection('actagevents').countDocuments()
  console.log('\neventos em actagevents DEPOIS:', depois, depois === antes ? '  ✅ nada gravado' : '  ⚠️ GRAVOU')
  await mongoose.disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) })
