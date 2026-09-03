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
    const lidosEm = new Date().toISOString()
    const { userProducts, users, timelines } = await activosOgi(db)
    const usersById = new Map(users.map((u) => [String(u._id), u]))
    const out = new Map<string, Record<string, number>>([
      ['base', { conforme: 0, legado: 0, erro: 0, 'sem dados': 0 }],
      ['renovação', { conforme: 0, legado: 0, erro: 0, 'sem dados': 0 }],
      ['sem turma', { conforme: 0, legado: 0, erro: 0, 'sem dados': 0 }]
    ])
    const erros: Array<{ email: string; ramo: string; veredicto: string }> = []
    for (const timeline of timelines) {
      const ramo = ramoDaTurma(turmaActual(usersById.get(String(timeline.userId))))
      const veredicto = timeline.cadeia?.expiracaoIgualTurma ?? 'sem-dados'
      const classificado = resultado(veredicto)
      const row = out.get(ramo) ?? { conforme: 0, legado: 0, erro: 0, 'sem dados': 0 }
      row[classificado] += 1
      out.set(ramo, row)
      if (classificado === 'erro') erros.push({ email: String(timeline.email), ramo, veredicto })
    }
    const rows = [...out.entries()].map(([ramo, valores]) => ({ ramo, ...valores }))
    console.log(JSON.stringify({
      lidosEm,
      produtosOgiAtivos: userProducts.length,
      produtosSemUser: userProducts.filter((p) => !usersById.has(String(p.userId))).length,
      alunosComTimeline: timelines.length,
      porRamo: rows,
      erros
    }, null, 2))
  } finally {
    await desligar()
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
