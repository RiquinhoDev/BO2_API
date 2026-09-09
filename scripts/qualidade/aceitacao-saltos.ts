// ════════════════════════════════════════════════════════════
// 📁 scripts/qualidade/aceitacao-saltos.ts
// Quem salta 8 meses ou mais com a régua acumulada, e porquê.
// Mostra as compras uma a uma para se poder julgar cada caso.
// SÓ LÊ.
// ════════════════════════════════════════════════════════════

import { loadConfig } from '../../src/config/appConfig'
import { initializeRuntimeConfig } from '../../src/config/runtimeConfig'
initializeRuntimeConfig(loadConfig(process.env))

import { ligar, desligar, activosOgi, turmaActual, mapaPorId } from './lib'
import { agruparCiclos } from '../../src/services/renewal/renewalCycles'
import { computeExpirationFromPurchaseDate } from '../../src/services/renewal/acExpirationSync.service'
import { fimDoAcessoAcumulado } from '../../src/services/renewal/reguaDaChefia'
import { parseTurmaName, tipoDeTurma } from '../../src/services/renewal/turmaParser'
import {
  TURMA_1_RENEWAL_OFFER_CODE,
  TURMA_2_RENEWAL_OFFER_CODE
} from '../../src/services/renewal/renewalConstants'

const ESPECIAIS = new Set([TURMA_1_RENEWAL_OFFER_CODE, TURMA_2_RENEWAL_OFFER_CODE])
const dia = (d: Date | null | undefined): string => (d ? new Date(d).toISOString().slice(0, 10) : '—')
const meses = (a: Date, b: Date): number => Math.round((b.getTime() - a.getTime()) / (30.44 * 86_400_000))
const LIMIAR = 8

async function main() {
  const db = await ligar()
  const { users } = await activosOgi(db)
  const ids = users.map((u: any) => u._id)
  const [vendas, acs] = await Promise.all([
    db.collection('hotmartsalehistories').find({ userId: { $in: ids } }).project({ userId: 1, sales: 1 }).toArray(),
    db.collection('acrenewaldatas').find({ userId: { $in: ids } }).project({ userId: 1, expirationDate: 1 }).toArray()
  ])
  const vendasPor = mapaPorId(vendas)
  const acPor = mapaPorId(acs)

  for (const u of users) {
    const sales = (vendasPor.get(String(u._id))?.sales ?? []) as any[]
    if (!sales.length) continue
    const ciclos = agruparCiclos(sales)
    const ultimo = ciclos.filter((c) => c.compras.some((x) => !x.reembolsada)).at(-1)
    if (!ultimo) continue
    const nomeTurma = turmaActual(u)
    const ancora = ultimo.compras[0]

    let hoje: Date | null = null
    let ramo = 'pela oferta'
    if (ESPECIAIS.has(ancora.offerCode ?? '')) {
      hoje = computeExpirationFromPurchaseDate(ancora.data, ultimo.anos); ramo = 'turma1/2'
    } else if (nomeTurma && parseTurmaName(nomeTurma).hasExpiry) {
      if (tipoDeTurma(nomeTurma) === 'renovacao') {
        hoje = computeExpirationFromPurchaseDate(ancora.data, ultimo.anos); ramo = 'renovação'
      } else {
        hoje = parseTurmaName(nomeTurma).accessEndOgi ?? null; ramo = 'base'
      }
    }
    if (!hoje) continue

    const todas = ciclos.flatMap((c) => c.compras)
    const acumulado = fimDoAcessoAcumulado(todas)
    const fimDaTurma = ramo === 'base' && nomeTurma ? parseTurmaName(nomeTurma).accessEndOgi ?? null : null
    const novo = acumulado && fimDaTurma
      ? (fimDaTurma.getTime() > acumulado.getTime() ? fimDaTurma : acumulado)
      : (acumulado ?? fimDaTurma)
    if (!novo) continue
    const delta = meses(hoje, novo)
    if (delta < LIMIAR) continue

    console.log('\n' + '─'.repeat(74))
    console.log(u.email, ' | turma:', nomeTurma, '| ramo:', ramo, '| anos do ciclo:', ultimo.anos)
    console.log(`hoje ${dia(hoje)}   novo ${dia(novo)}   +${delta} meses   AC tem ${dia(acPor.get(String(u._id))?.expirationDate)}`)
    console.log('  compras (as que contam para a régua nova estão marcadas com >):')
    for (const c of todas.sort((a, b) => a.data.getTime() - b.data.getTime())) {
      const rec = c.recurrencyNumber == null ? 1 : Number(c.recurrencyNumber)
      const conta = c.reembolsada !== true && rec === 1
      console.log(
        `   ${conta ? '>' : ' '} ${dia(c.data)}  prod ${String(c.produtoId ?? '—').padEnd(8)} ` +
        `${String(c.valor ?? '—').padStart(7)}€  cob ${rec}  ${c.extensao ? 'EXTENSÃO' : ''}` +
        `${c.reembolsada ? ' REEMBOLSADA' : ''}  ${c.transacao ?? ''}`
      )
    }
  }
  await desligar()
}

main().catch((e) => { console.error(e); process.exit(1) })
