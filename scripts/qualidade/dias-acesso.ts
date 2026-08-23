import { activosOgi, diasEntre, desligar, ligar } from './lib'

async function main() {
  const db = await ligar()
  try {
    const { timelines } = await activosOgi(db)
    const valores: Array<{ userId: string; periodo: string; anos: number; dias: number; esperado: number }> = []
    for (const timeline of timelines) {
      const ciclo = timeline.ciclos?.at(-1)
      const inicio = ciclo?.compras?.[0]?.data
      if (!ciclo || !inicio || !ciclo.acessoAte) continue
      valores.push({ userId: String(timeline.userId), periodo: ciclo.periodo, anos: ciclo.anos, dias: diasEntre(inicio, ciclo.acessoAte), esperado: 365 * ciclo.anos })
    }
    valores.sort((a, b) => a.dias - b.dias)
    const mediana = valores.length ? valores[Math.floor(valores.length / 2)].dias : null
    console.log(JSON.stringify({
      alunos: valores.length,
      minimo: valores[0]?.dias ?? null,
      mediana,
      maximo: valores.at(-1)?.dias ?? null,
      menosDe350: valores.filter((v) => v.dias < 350),
      distribuicao: {
        menosDe365: valores.filter((v) => v.dias < 365).length,
        de365a395: valores.filter((v) => v.dias >= 365 && v.dias <= 395).length,
        maisDe395: valores.filter((v) => v.dias > 395).length
      }
    }, null, 2))
  } finally {
    await desligar()
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
