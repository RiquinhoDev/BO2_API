// ════════════════════════════════════════════════════════════
// 📁 scripts/qualidade/os-79.ts
// Os activos de renovação cuja turma não é a do mês da compra.
// Separa-os por causa, para se perceber quais são erro e quais não.
// SÓ LÊ.
// ════════════════════════════════════════════════════════════

import { loadConfig } from '../../src/config/appConfig'
import { initializeRuntimeConfig } from '../../src/config/runtimeConfig'
initializeRuntimeConfig(loadConfig(process.env))

import { ligar, desligar, activosOgi, turmaActual, mapaPorId } from './lib'
import { agruparCiclos } from '../../src/services/renewal/renewalCycles'
import { parseTurmaName, tipoDeTurma } from '../../src/services/renewal/turmaParser'

const idx = (y: number, m: number) => y * 12 + m
const idxData = (d: Date) => idx(d.getUTCFullYear(), d.getUTCMonth() + 1)
const idxYYMM = (s: string) => idx(2000 + Number(s.slice(0, 2)), Number(s.slice(2)))
const yymmDeData = (d: Date) =>
  String(d.getUTCFullYear() % 100).padStart(2, '0') + String(d.getUTCMonth() + 1).padStart(2, '0')
const diaDoMes = (d: Date) => d.getUTCDate()
const ultimoDia = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()

async function main() {
  const db = await ligar()
  const { users } = await activosOgi(db)
  const ids = users.map((u: any) => u._id)
  const vendas = await db.collection('hotmartsalehistories')
    .find({ userId: { $in: ids } }).project({ userId: 1, sales: 1 }).toArray()
  const vendasPor = mapaPorId(vendas)

  // Que meses TÊM coorte de renovação, em toda a base
  const periodosComTurma = new Set<string>()
  for (const u of users) {
    for (const t of u?.hotmart?.enrolledClasses ?? []) {
      const nome = t?.className
      if (!nome || tipoDeTurma(nome) !== 'renovacao') continue
      const p = parseTurmaName(nome).periodYYMM
      if (p) periodosComTurma.add(p)
    }
  }
  const movimentos = await db.collection('studentclasshistories').find({}).project({ className: 1 }).toArray()
  for (const m of movimentos) {
    const nome = m?.className
    if (!nome || tipoDeTurma(nome) !== 'renovacao') continue
    const p = parseTurmaName(nome).periodYYMM
    if (p) periodosComTurma.add(p)
  }
  console.log('meses com coorte de renovação:', [...periodosComTurma].sort().join(' '))

  const fora: any[] = []
  for (const u of users) {
    const nome = turmaActual(u)
    if (!nome || tipoDeTurma(nome) !== 'renovacao') continue
    const p = parseTurmaName(nome).periodYYMM
    if (!p) continue
    const sales = (vendasPor.get(String(u._id))?.sales ?? []) as any[]
    const ciclos = agruparCiclos(sales)
    const compras = ciclos.flatMap((c) => c.compras).filter((c) => c.reembolsada !== true)
    if (!compras.length) continue
    const ultima = compras.sort((a, b) => a.data.getTime() - b.data.getTime()).at(-1)!.data
    const delta = idxYYMM(p) - idxData(ultima)
    if (delta === 0 || Math.abs(delta) > 2) continue

    const mesDaCompra = yymmDeData(ultima)
    fora.push({
      email: u.email,
      compra: ultima,
      dia: diaDoMes(ultima),
      ultimoDoMes: ultimoDia(ultima),
      mesDaCompra,
      turma: p,
      nomeTurma: nome,
      delta,
      existeCoorteDoMes: periodosComTurma.has(mesDaCompra)
    })
  }

  console.log('\ntotal fora do mês da compra (±1, ±2):', fora.length)

  const extremo = (x: any) => x.dia <= 2 || x.dia >= x.ultimoDoMes - 1
  const semCoorte = fora.filter((x) => !x.existeCoorteDoMes)
  const naFronteira = fora.filter((x) => x.existeCoorteDoMes && extremo(x))
  const nemUmNemOutro = fora.filter((x) => x.existeCoorteDoMes && !extremo(x))

  const mostra = (titulo: string, lista: any[]) => {
    console.log(`\n${'═'.repeat(78)}\n${titulo}  —  ${lista.length} alunos\n`)
    for (const x of lista.sort((a, b) => a.compra.getTime() - b.compra.getTime())) {
      console.log(
        `  ${String(x.email).padEnd(36)} comprou ${x.compra.toISOString().slice(0, 10)} ` +
        `(dia ${String(x.dia).padStart(2)} de ${x.ultimoDoMes})  ` +
        `mês da compra ${x.mesDaCompra}${x.existeCoorteDoMes ? '' : ' [SEM COORTE]'}  →  está na ${x.turma}  (${x.delta > 0 ? '+' : ''}${x.delta})`
      )
    }
  }

  mostra('A) O mês da compra NÃO TEM coorte — a turma tinha de ser outra', semCoorte)
  mostra('B) Comprou nos extremos do mês — é a janela de campanha', naFronteira)
  mostra('C) Nem uma coisa nem outra — o mês tinha coorte e a compra é a meio', nemUmNemOutro)

  await desligar()
}

main().catch((e) => { console.error(e); process.exit(1) })
