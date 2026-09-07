/**
 * Confronta, aluno a aluno, as três fontes que têm de concordar:
 *
 *   Hotmart  vendas (a verdade)   -> régua da chefia e régua nossa
 *   AC       334 data da compra   -> bate com a última compra válida?
 *   AC       332 data de expiração-> bate com a régua da chefia?
 *   BD       turma e timeline     -> é a mesma história?
 *
 * Só lê. Trabalha sobre as recolhas em ficheiro, para ser repetível sem
 * voltar a bater nas APIs.
 *
 * Uso:
 *   railway run npx tsx scripts/qualidade/validar-tres-fontes.ts <vendas.json> <ac.json> [--csv saida.csv]
 */
import fs from 'fs'
import { desligar, ligar, turmaActual } from './lib'
import {
  comprasValidas,
  paraData,
  ramoDaTurma,
  reguaDaChefia,
  reguaNossa,
  turmaDaChefia,
  type RamoTurma
} from '../../src/services/renewal/reguaDaChefia'

const iso = (d: Date): string => d.toISOString().slice(0, 10)

// ─────────────────────────────────────────────────────────────
// Relatório
// ─────────────────────────────────────────────────────────────

interface Linha {
  email: string
  turma: string
  ramo: RamoTurma
  compras: number
  descartadas: string
  primeira: string
  ultima: string
  chefia: string
  chefiaTurma: string
  nossa: string
  ac332: string
  ac334: string
  bd: string
  bateAC: boolean
  bateNossa: boolean
  bate334: boolean
}

async function main() {
  const [ficheiroVendas, ficheiroAc] = process.argv.slice(2)
  if (!ficheiroVendas || !ficheiroAc) throw new Error('faltam os ficheiros de recolha')

  const vendasPorEmail: Record<string, VendaBruta[]> = JSON.parse(fs.readFileSync(ficheiroVendas, 'utf8'))
  const acPorEmail: Record<string, any> = JSON.parse(fs.readFileSync(ficheiroAc, 'utf8'))

  const db: any = await ligar()
  const emails = Object.keys(vendasPorEmail)
  const users = await db.collection('users')
    .find({ email: { $in: emails.map((e) => new RegExp(`^${e.replace(/[.+*?^$()[\]{}|\\]/g, '\\$&')}$`, 'i')) } })
    .project({ email: 1, hotmart: 1, combined: 1 }).toArray()
  const userPorEmail = new Map(users.map((u: any) => [String(u.email).toLowerCase().trim(), u]))

  const tls = await db.collection('studentrenewaltimelines')
    .find({ userId: { $in: users.map((u: any) => u._id) } }).project({ userId: 1, ciclos: 1 }).toArray()
  const tlPorId = new Map(tls.map((t: any) => [String(t.userId), t]))

  const linhas: Linha[] = []

  for (const email of emails) {
    const u: any = userPorEmail.get(email)
    const turma = u ? turmaActual(u) : null
    const { datas, descartadas } = comprasValidas(vendasPorEmail[email] ?? [])
    const chefia = reguaDaChefia(datas)
    const nossa = reguaNossa(turma, datas)

    const ac = acPorEmail[email] ?? {}
    const ac332 = paraData(ac.expiracao)
    const ac334 = paraData(ac.dataCompra)

    const tl: any = u ? tlPorId.get(String(u._id)) : null
    const bdDatas = (tl?.ciclos ?? []).map((c: any) => paraData(c.acessoAte)).filter(Boolean) as Date[]
    const bd = bdDatas.length ? iso(bdDatas.sort((a, b) => b.getTime() - a.getTime())[0]) : ''

    linhas.push({
      email,
      turma: turma ?? '',
      ramo: ramoDaTurma(turma),
      compras: datas.length,
      descartadas: [
        descartadas.estado ? `${descartadas.estado} reemb` : '',
        descartadas.recorrencia ? `${descartadas.recorrencia} prest` : '',
        descartadas.semData ? `${descartadas.semData} s/data` : ''
      ].filter(Boolean).join(' '),
      primeira: datas.length ? iso(datas[0]) : '',
      ultima: datas.length ? iso(datas[datas.length - 1]) : '',
      chefia: chefia ? iso(chefia.fim) : '',
      chefiaTurma: chefia ? turmaDaChefia(chefia.fim) : '',
      nossa: nossa ? iso(nossa) : '',
      ac332: ac332 ? iso(ac332) : '',
      ac334: ac334 ? iso(ac334) : '',
      bd,
      bateAC: !!chefia && !!ac332 && iso(chefia.fim) === iso(ac332),
      bateNossa: !!chefia && !!nossa && iso(chefia.fim) === iso(nossa),
      bate334: !!datas.length && !!ac334 && iso(datas[datas.length - 1]) === iso(ac334)
    })
  }

  const p = (n: number) => String(n).padStart(5)
  const pct = (n: number, t: number) => `${((n / t) * 100).toFixed(0)}%`.padStart(4)
  const T = linhas.length

  console.log('═'.repeat(74))
  console.log(`TRÊS FONTES, ${T} ALUNOS OGI ACTIVOS`)
  console.log('═'.repeat(74))

  console.log('\nramo da turma actual')
  const porRamo = new Map<string, number>()
  for (const l of linhas) porRamo.set(l.ramo, (porRamo.get(l.ramo) ?? 0) + 1)
  for (const [r, n] of [...porRamo].sort((a, b) => b[1] - a[1])) console.log(`  ${r.padEnd(12)} ${p(n)}`)

  const comAc = linhas.filter((l) => l.ac332)
  const comChefia = linhas.filter((l) => l.chefia)
  console.log('\na AC concorda com a régua da chefia?')
  console.log(`  bate            ${p(comAc.filter((l) => l.bateAC).length)}  ${pct(comAc.filter((l) => l.bateAC).length, comAc.length)}`)
  console.log(`  NÃO bate        ${p(comAc.filter((l) => !l.bateAC).length)}`)
  console.log(`  sem 332 na AC   ${p(T - comAc.length)}`)
  console.log(`  sem compras     ${p(T - comChefia.length)}`)

  console.log('\na nossa régua concorda com a da chefia?')
  for (const ramo of ['base', 'renovação', 'genérica', 'ilegível', 'sem turma'] as RamoTurma[]) {
    const g = linhas.filter((l) => l.ramo === ramo && l.chefia && l.nossa)
    if (!g.length) continue
    const b = g.filter((l) => l.bateNossa).length
    console.log(`  ${ramo.padEnd(12)} ${p(b)} / ${String(g.length).padEnd(4)} ${pct(b, g.length)}`)
  }

  const com334 = linhas.filter((l) => l.ac334 && l.ultima)
  console.log('\no campo 334 bate com a última compra válida?')
  console.log(`  bate            ${p(com334.filter((l) => l.bate334).length)}  ${pct(com334.filter((l) => l.bate334).length, com334.length)}`)
  console.log(`  NÃO bate        ${p(com334.filter((l) => !l.bate334).length)}`)

  // ── Que régua é que a AC está a seguir? ───────────────────────────
  const comAmbas = linhas.filter((l) => l.chefia && l.ac332 && l.nossa)
  const acEChefia = comAmbas.filter((l) => l.bateAC)
  const acENossa = comAmbas.filter((l) => !l.bateAC && l.ac332 === l.nossa)
  const acNenhuma = comAmbas.filter((l) => !l.bateAC && l.ac332 !== l.nossa)

  console.log(`\n${'═'.repeat(74)}`)
  console.log('QUE RÉGUA É QUE A AC ESTÁ A SEGUIR?')
  console.log('═'.repeat(74))
  console.log(`  a AC concorda com AS DUAS      ${p(acEChefia.length)}  ${pct(acEChefia.length, comAmbas.length)}   nada a fazer`)
  console.log(`  a AC segue a NOSSA régua       ${p(acENossa.length)}  ${pct(acENossa.length, comAmbas.length)}   muda se adoptarmos a da chefia`)
  console.log(`  a AC não segue NENHUMA         ${p(acNenhuma.length)}  ${pct(acNenhuma.length, comAmbas.length)}   está errada nas duas leituras`)

  const porRamoEDif = (grupo: Linha[], titulo: string) => {
    if (!grupo.length) return
    console.log(`\n── ${titulo} (${grupo.length}) ──`)
    const m = new Map<string, number>()
    for (const l of grupo) m.set(l.ramo, (m.get(l.ramo) ?? 0) + 1)
    console.log('  por ramo:  ' + [...m].sort((a, b) => b[1] - a[1]).map(([r, n]) => `${r} ${n}`).join('   '))
    const dias = grupo.map((l) => Math.round((new Date(l.chefia).getTime() - new Date(l.ac332).getTime()) / 86400000))
    const faixa = new Map<string, number>()
    for (const d of dias) {
      const k = Math.abs(d) <= 31 ? 'até 1 mês' : Math.abs(d) <= 92 ? '1 a 3 meses' : Math.abs(d) <= 200 ? '3 a 7 meses' : Math.abs(d) <= 400 ? 'cerca de 1 ano' : 'mais de 1 ano'
      faixa.set(k, (faixa.get(k) ?? 0) + 1)
    }
    console.log('  diferença: ' + [...faixa].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join('   '))
    const maisTarde = dias.filter((d) => d > 0).length
    console.log(`  a chefia dá MAIS acesso em ${maisTarde}, menos em ${dias.length - maisTarde}`)
  }

  porRamoEDif(acENossa, 'A AC segue a nossa régua')
  porRamoEDif(acNenhuma, 'A AC não segue nenhuma das duas')

  console.log(`\n── os piores casos da AC (não segue nenhuma régua) ──`)
  const piores = acNenhuma
    .map((l) => ({ l, dias: Math.round((new Date(l.chefia).getTime() - new Date(l.ac332).getTime()) / 86400000) }))
    .sort((a, b) => Math.abs(b.dias) - Math.abs(a.dias))
    .slice(0, 20)
  console.log('email                              ramo        compras  chefia      nossa       AC 332      dif')
  for (const { l, dias } of piores) {
    console.log(
      `${l.email.slice(0, 33).padEnd(34)} ${l.ramo.padEnd(11)} ${String(l.compras).padStart(6)}   ${l.chefia}  ${(l.nossa || '—').padEnd(10)}  ${l.ac332}  ${dias > 0 ? '+' : ''}${dias}d`
    )
  }

  const semCompras = linhas.filter((l) => !l.chefia)
  console.log(`\n── alunos activos SEM compra OGI válida (${semCompras.length}) ──`)
  for (const l of semCompras) {
    console.log(`  ${l.email.slice(0, 36).padEnd(37)} ${l.ramo.padEnd(11)} ${l.descartadas || 'nenhuma venda devolvida'}   AC 332: ${l.ac332 || '—'}`)
  }

  const mau334 = linhas.filter((l) => l.ac334 && l.ultima && !l.bate334)
  console.log(`\n── o campo 334 não bate com a última compra (${mau334.length}) ──`)
  for (const l of mau334) {
    console.log(`  ${l.email.slice(0, 36).padEnd(37)} última compra ${l.ultima}   AC 334 ${l.ac334}`)
  }

  const csv = process.argv.includes('--csv') ? process.argv[process.argv.indexOf('--csv') + 1] : null
  if (csv) {
    const cab = ['email', 'turma', 'ramo', 'compras', 'descartadas', 'primeira', 'ultima', 'chefia', 'chefiaTurma', 'nossa', 'ac332', 'ac334', 'bd', 'bateAC', 'bateNossa', 'bate334']
    const linhasCsv = [cab.join(';'), ...linhas.map((l) => cab.map((c) => String((l as any)[c] ?? '')).join(';'))]
    fs.writeFileSync(csv, '﻿' + linhasCsv.join('\n'), 'utf8')
    console.log(`\ntabela completa -> ${csv}`)
  }

  await desligar()
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
