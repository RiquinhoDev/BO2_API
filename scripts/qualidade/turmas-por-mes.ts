// Para cada mês de compra, em que coorte é que as pessoas foram parar.
// Mostra se a colocação é do mês da compra ou do mês seguinte. SÓ LÊ.
import { loadConfig } from '../../src/config/appConfig'
import { initializeRuntimeConfig } from '../../src/config/runtimeConfig'
initializeRuntimeConfig(loadConfig(process.env))
import { ligar, desligar, activosOgi, turmaActual, mapaPorId } from './lib'
import { agruparCiclos } from '../../src/services/renewal/renewalCycles'
import { parseTurmaName, tipoDeTurma } from '../../src/services/renewal/turmaParser'

const yymm = (d: Date) =>
  String(d.getUTCFullYear() % 100).padStart(2, '0') + String(d.getUTCMonth() + 1).padStart(2, '0')

async function main() {
  const db = await ligar()
  const { users } = await activosOgi(db)
  const ids = users.map((u: any) => u._id)
  const vendas = await db.collection('hotmartsalehistories')
    .find({ userId: { $in: ids } }).project({ userId: 1, sales: 1 }).toArray()
  const vendasPor = mapaPorId(vendas)

  // mesDaCompra -> turma -> quantos
  const mapa = new Map<string, Map<string, number>>()
  for (const u of users) {
    const nome = turmaActual(u)
    if (!nome || tipoDeTurma(nome) !== 'renovacao') continue
    const turma = parseTurmaName(nome).periodYYMM
    if (!turma) continue
    const sales = (vendasPor.get(String(u._id))?.sales ?? []) as any[]
    const compras = agruparCiclos(sales).flatMap((c) => c.compras).filter((c) => c.reembolsada !== true)
    if (!compras.length) continue
    const ultima = compras.sort((a, b) => a.data.getTime() - b.data.getTime()).at(-1)!.data
    const mes = yymm(ultima)
    if (!mapa.has(mes)) mapa.set(mes, new Map())
    const m = mapa.get(mes)!
    m.set(turma, (m.get(turma) ?? 0) + 1)
  }

  console.log('mês da     onde foram parar')
  console.log('compra     (turma × quantos)')
  console.log('─'.repeat(64))
  for (const [mes, turmas] of [...mapa].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (mes < '2506') continue
    const total = [...turmas.values()].reduce((a, b) => a + b, 0)
    const linha = [...turmas]
      .sort((a, b) => b[1] - a[1])
      .map(([t, n]) => `${t}×${n}${t === mes ? ' ✓' : ''}`)
      .join('   ')
    console.log(`${mes}  (${String(total).padStart(3)})  ${linha}`)
  }
  await desligar()
}
main().catch((e) => { console.error(e); process.exit(1) })
