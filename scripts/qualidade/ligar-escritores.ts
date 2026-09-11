// ════════════════════════════════════════════════════════════
// 📁 scripts/qualidade/ligar-escritores.ts
// Liga os quatro interruptores das renovações. Nada mais.
//
// Lê antes, escreve um campo em cada, lê depois, e confirma que
// mais nenhum job mudou de estado — em particular os de Janeiro.
//
// Corre em seco por omissão; `--aplicar` para valer.
// ════════════════════════════════════════════════════════════

import { loadConfig } from '../../src/config/appConfig'
import { initializeRuntimeConfig } from '../../src/config/runtimeConfig'
initializeRuntimeConfig(loadConfig(process.env))

import { ligar, desligar } from './lib'

const APLICAR = process.argv.includes('--aplicar')

/** Os quatro, por esta ordem. O RenewalPipeline é a cadeia; os outros são portões dentro dela. */
const LIGAR = ['RenewalPipeline', 'AcExpirationSync', 'AcTurmaTagSync', 'AcRefundHandler']

/** Estes nunca. O RenewalAcSync está substituído e tem a allowlist partida. */
const NUNCA = ['RenewalAcSync', 'DailyPipeline', 'EvaluateRules', 'EvaluateRules_TEST']

async function main() {
  const db = await ligar()
  const col = db.collection('cronjobconfigs')

  const antes = await col.find({}).project({ name: 1, 'schedule.enabled': 1 }).toArray()
  const estadoAntes = new Map(antes.map((d: any) => [d.name, d.schedule?.enabled === true]))

  console.log(APLICAR ? '── A LIGAR ──' : '── EM SECO (usa --aplicar) ──')
  console.log('\nantes:')
  for (const n of [...LIGAR, ...NUNCA]) {
    console.log(`  ${estadoAntes.get(n) ? 'ON ' : 'off'}  ${n}`)
  }

  if (!APLICAR) { await desligar(); return }

  console.log('\na ligar:')
  for (const n of LIGAR) {
    const r = await col.updateOne({ name: n }, { $set: { 'schedule.enabled': true } })
    console.log(`  ${n.padEnd(20)} modificados ${r.modifiedCount}`)
  }

  const depois = await col.find({}).project({ name: 1, 'schedule.enabled': 1 }).toArray()
  const estadoDepois = new Map(depois.map((d: any) => [d.name, d.schedule?.enabled === true]))

  console.log('\n── verificação ──')
  let mau = 0
  for (const n of LIGAR) {
    const ok = estadoDepois.get(n) === true
    if (!ok) mau += 1
    console.log(`  ${ok ? '✅' : '❌'} ${n} ligado`)
  }
  for (const n of NUNCA) {
    const ok = estadoDepois.get(n) !== true
    if (!ok) mau += 1
    console.log(`  ${ok ? '✅' : '❌'} ${n} continua desligado`)
  }

  const inesperados = depois.filter((d: any) => {
    const era = estadoAntes.get(d.name)
    const e = d.schedule?.enabled === true
    return era !== e && !LIGAR.includes(d.name)
  })
  if (inesperados.length) {
    mau += 1
    console.log(`  ❌ mudaram sem ser pedidos: ${inesperados.map((d: any) => d.name).join(', ')}`)
  } else {
    console.log('  ✅ mais nenhum interruptor mudou')
  }

  console.log('\n' + (mau === 0 ? '✅ os quatro ligados, e mais nada' : `⚠️ ${mau} problema(s)`))
  await desligar()
  process.exit(mau === 0 ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
