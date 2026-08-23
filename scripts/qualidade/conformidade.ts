import { activosOgi, desligar, ligar, ramoDaTurma, turmaActual } from './lib'

const resultado = (veredicto: string): 'conforme' | 'legado' | 'erro' | 'sem dados' => {
  if (veredicto === 'ok') return 'conforme'
  if (veredicto === 'legado' || veredicto === 'a-menos') return 'legado'
  if (veredicto === 'sem-dados') return 'sem dados'
  return 'erro'
}

async function main() {
  const db = await ligar()
  try {
    const { userProducts, users, timelines } = await activosOgi(db)
    const usersById = new Map(users.map((u) => [String(u._id), u]))
    const out = new Map<string, Record<string, number>>([
      ['base', { conforme: 0, legado: 0, erro: 0, 'sem dados': 0 }],
      ['renovação', { conforme: 0, legado: 0, erro: 0, 'sem dados': 0 }],
      ['sem turma', { conforme: 0, legado: 0, erro: 0, 'sem dados': 0 }]
    ])
    for (const timeline of timelines) {
      const ramo = ramoDaTurma(turmaActual(usersById.get(String(timeline.userId))))
      const chave = `${ramo}:${resultado(timeline.cadeia?.expiracaoIgualTurma ?? 'sem-dados')}`
      const row = out.get(ramo) ?? { conforme: 0, legado: 0, erro: 0, 'sem dados': 0 }
      row[resultado(timeline.cadeia?.expiracaoIgualTurma ?? 'sem-dados')] += 1
      out.set(ramo, row)
      void chave
    }
    const rows = [...out.entries()].map(([ramo, valores]) => ({ ramo, ...valores }))
    console.log(JSON.stringify({
      produtosOgiAtivos: userProducts.length,
      produtosSemUser: userProducts.filter((p) => !usersById.has(String(p.userId))).length,
      alunosComTimeline: timelines.length,
      porRamo: rows
    }, null, 2))
  } finally {
    await desligar()
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
