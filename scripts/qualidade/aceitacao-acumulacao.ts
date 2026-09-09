// ════════════════════════════════════════════════════════════
// 📁 scripts/qualidade/aceitacao-acumulacao.ts
// A medição de aceitação da régua acumulada, ANTES de a ligar.
//
// Pergunta única: se `fimDoAcessoAcumulado()` substituir o
// multiplicador `anos`, quem é que muda de data?
//
// O teste que tem de passar: dos alunos com a extensão de 97€,
// a esmagadora maioria tem de dar EXACTAMENTE a mesma data que dá
// hoje. Se algum saltar doze meses, contámos duas vezes — é o erro
// que dá um ano de borla a quem comprou dois.
//
// SÓ LÊ. Não escreve na AC, não escreve na nossa BD.
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
import type { CicloBase } from '../../src/services/renewal/renewalTimeline.types'

const ESPECIAIS = new Set([TURMA_1_RENEWAL_OFFER_CODE, TURMA_2_RENEWAL_OFFER_CODE])
const dia = (d: Date | null): string => (d ? d.toISOString().slice(0, 10) : '—')
const meses = (a: Date, b: Date): number =>
  Math.round((b.getTime() - a.getTime()) / (30.44 * 86_400_000))

/**
 * A régua de hoje, replicando `calcularExpiracao` do escritor.
 * O ramo da oferta (sem turma datável) fica de fora e é contado à parte —
 * precisa da colecção das ofertas e não é onde a acumulação actua.
 */
function reguaDeHoje(ciclo: CicloBase, nomeTurma: string | null): { data: Date | null; ramo: string } {
  const ancora = ciclo.compras[0]
  if (ESPECIAIS.has(ancora.offerCode ?? '')) {
    return { data: computeExpirationFromPurchaseDate(ancora.data, ciclo.anos), ramo: 'turma1/2' }
  }
  if (nomeTurma && parseTurmaName(nomeTurma).hasExpiry) {
    if (tipoDeTurma(nomeTurma) === 'renovacao') {
      return { data: computeExpirationFromPurchaseDate(ancora.data, ciclo.anos), ramo: 'renovação' }
    }
    return { data: parseTurmaName(nomeTurma).accessEndOgi ?? null, ramo: 'base' }
  }
  return { data: null, ramo: 'pela oferta' }
}

async function main() {
  const db = await ligar()
  const { users } = await activosOgi(db)
  const ids = users.map((u: any) => u._id)
  const vendas = await db.collection('hotmartsalehistories')
    .find({ userId: { $in: ids } }).project({ userId: 1, sales: 1 }).toArray()
  const acs = await db.collection('acrenewaldatas')
    .find({ userId: { $in: ids } }).project({ userId: 1, expirationDate: 1 }).toArray()
  const vendasPor = mapaPorId(vendas)
  const acPor = mapaPorId(acs)

  const linhas: Array<{
    email: string; ramo: string; anos: number; compras: number
    hoje: Date | null; novo: Date | null; ac: Date | null; delta: number
  }> = []

  for (const u of users) {
    const sales = (vendasPor.get(String(u._id))?.sales ?? []) as any[]
    if (!sales.length) continue
    const ciclos = agruparCiclos(sales)
    const ultimo = ciclos.filter((c) => c.compras.some((x) => !x.reembolsada)).at(-1)
    if (!ultimo) continue

    const nomeTurma = turmaActual(u)
    const { data: hoje, ramo } = reguaDeHoje(ultimo, nomeTurma)

    // A régua nova: acumula TODAS as compras válidas do aluno; numa turma
    // base o nome da turma estende quando dá mais (cláusula 2.6).
    const todas = ciclos.flatMap((c) => c.compras)
    const acumulado = fimDoAcessoAcumulado(todas)
    const fimDaTurma = ramo === 'base' && nomeTurma ? parseTurmaName(nomeTurma).accessEndOgi ?? null : null
    const novo = acumulado && fimDaTurma
      ? (fimDaTurma.getTime() > acumulado.getTime() ? fimDaTurma : acumulado)
      : (acumulado ?? fimDaTurma)

    linhas.push({
      email: u.email,
      ramo,
      anos: ultimo.anos,
      compras: todas.filter((c) => !c.reembolsada).length,
      hoje,
      novo,
      ac: acPor.get(String(u._id))?.expirationDate ?? null,
      delta: hoje && novo ? meses(hoje, novo) : NaN
    })
  }

  const igual = (l: typeof linhas[0]) => dia(l.hoje) === dia(l.novo)

  // ── 1. O teste de aceitação: os alunos com a extensão ────────
  const comExtensao = linhas.filter((l) => l.anos === 2)
  const iguais = comExtensao.filter(igual)
  const mudam = comExtensao.filter((l) => !igual(l))
  console.log('═══ TESTE DE ACEITAÇÃO — alunos com a extensão (anos = 2) ═══')
  console.log('total                :', comExtensao.length)
  console.log('MESMA data que hoje  :', iguais.length)
  console.log('mudam                :', mudam.length)
  const saltaUmAno = mudam.filter((l) => l.delta >= 11)
  console.log('SALTAM 11+ MESES     :', saltaUmAno.length, saltaUmAno.length ? '  ⚠️  CONTÁMOS DUAS VEZES' : '  ✅')
  if (mudam.length) {
    console.log('\nos que mudam:')
    for (const l of mudam.sort((a, b) => b.delta - a.delta)) {
      console.log(`  ${String(l.email).padEnd(34)} ${l.ramo.padEnd(11)} compras ${l.compras}  hoje ${dia(l.hoje)}  novo ${dia(l.novo)}  ${l.delta > 0 ? '+' : ''}${l.delta}m`)
    }
  }

  // ── 2. O universo todo ───────────────────────────────────────
  console.log('\n═══ TODOS OS ACTIVOS ═══')
  const comparaveis = linhas.filter((l) => l.hoje && l.novo)
  console.log('alunos analisados        :', linhas.length)
  console.log('sem régua de hoje (oferta):', linhas.filter((l) => !l.hoje).length)
  console.log('mesma data               :', comparaveis.filter(igual).length)
  console.log('mudam                    :', comparaveis.filter((l) => !igual(l)).length)
  const encurta = comparaveis.filter((l) => !igual(l) && l.delta < 0)
  console.log('ENCURTAM                 :', encurta.length, encurta.length ? '  ⚠️  a regra 2.7 trava, mas convém ver' : '  ✅')
  for (const l of encurta.slice(0, 15)) {
    console.log(`  ${String(l.email).padEnd(34)} ${l.ramo.padEnd(11)} hoje ${dia(l.hoje)}  novo ${dia(l.novo)}  ${l.delta}m`)
  }

  const hist = new Map<number, number>()
  for (const l of comparaveis.filter((x) => !igual(x))) hist.set(l.delta, (hist.get(l.delta) ?? 0) + 1)
  console.log('\ndistribuição das mudanças (meses):')
  for (const [d, n] of [...hist].sort((a, b) => a[0] - b[0])) {
    console.log(`  ${String(n).padStart(4)} alunos   ${d > 0 ? '+' : ''}${d}m`)
  }

  await desligar()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
