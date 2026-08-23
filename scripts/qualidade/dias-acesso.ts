import { activosOgi, diasEntre, desligar, ligar } from './lib'

async function main() {
  const db = await ligar()
  try {
    const lidosEm = new Date().toISOString()
    const { userProducts, timelines } = await activosOgi(db)
    const ids = userProducts.map((produto) => produto.userId)
    const acRows = await db.collection('acrenewaldata')
      .find({ userId: { $in: ids } })
      .project({ userId: 1, expirationDate: 1 })
      .toArray()
    const acPorAluno = new Map(acRows.map((row: any) => [String(row.userId), row]))
    const valores: Array<{
      userId: string
      email: string
      periodo: string
      anos: number
      diasAc: number
      diasRegra: number
      esperado: number
    }> = []
    for (const timeline of timelines) {
      const ciclo = timeline.ciclos?.at(-1)
      const inicio = ciclo?.compras?.[0]?.data
      const expiracaoAc = acPorAluno.get(String(timeline.userId))?.expirationDate
      if (!ciclo || !inicio || !ciclo.acessoAte || !expiracaoAc) continue
      valores.push({
        userId: String(timeline.userId),
        email: String(timeline.email ?? ''),
        periodo: ciclo.periodo,
        anos: ciclo.anos,
        diasAc: diasEntre(inicio, expiracaoAc),
        diasRegra: diasEntre(inicio, ciclo.acessoAte),
        esperado: 365 * ciclo.anos
      })
    }
    valores.sort((a, b) => a.diasAc - b.diasAc)
    const medianaAc = valores.length ? valores[Math.floor(valores.length / 2)].diasAc : null
    const ordenarRegra = [...valores].sort((a, b) => a.diasRegra - b.diasRegra)
    const medianaRegra = ordenarRegra.length ? ordenarRegra[Math.floor(ordenarRegra.length / 2)].diasRegra : null
    const menosDe350 = valores.filter((v) => v.diasAc < 350)
    const foraDaLista350 = valores.filter((v) => v.diasAc >= 350)
    console.log(JSON.stringify({
      lidosEm,
      alunosComCicloEExpiracaoAc: valores.length,
      realAc: {
        // O mínimo pedido na tabela é o mínimo fora da lista de alerta;
        // o absoluto permanece exposto para não esconder casos críticos.
        minimo: foraDaLista350[0]?.diasAc ?? null,
        minimoAbsoluto: valores[0]?.diasAc ?? null,
        mediana: medianaAc,
        maximo: valores.at(-1)?.diasAc ?? null,
        menosDe350,
        distribuicao: {
          menosDe365: valores.filter((v) => v.diasAc < 365).length,
          de365a395: valores.filter((v) => v.diasAc >= 365 && v.diasAc <= 395).length,
          maisDe395: valores.filter((v) => v.diasAc > 395).length
        }
      },
      regra: {
        minimo: ordenarRegra[0]?.diasRegra ?? null,
        mediana: medianaRegra,
        maximo: ordenarRegra.at(-1)?.diasRegra ?? null,
        distribuicao: {
          menosDe365: valores.filter((v) => v.diasRegra < 365).length,
          de365a395: valores.filter((v) => v.diasRegra >= 365 && v.diasRegra <= 395).length,
          maisDe395: valores.filter((v) => v.diasRegra > 395).length
        }
      }
    }, null, 2))
  } finally {
    await desligar()
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
