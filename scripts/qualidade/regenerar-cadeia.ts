/**
 * Regenera as timelines e mede a cadeia imediatamente depois da escrita.
 *
 * Este é o teste de integração final do handoff: só escreve na nossa BD,
 * nunca chama AC/Hotmart. O comando pára com código 2 se aparecerem mais de
 * cinco `divergente`, porque isso é sinal de regra a capturar comportamento
 * normal e exige revisão humana antes de qualquer activação.
 */
import mongoose from 'mongoose'
import { gerarTimelinesEmLote } from '../../src/services/renewal/renewalTimeline.service'
import { activosOgi, desligar, ligar, ramoDaTurma, turmaActual } from './lib'

type Contagem = { ok: number; legado: number; divergente: number; 'sem-dados': number }

function contagemVazia(): Contagem {
  return { ok: 0, legado: 0, divergente: 0, 'sem-dados': 0 }
}

function contar(timelines: any[]): Contagem {
  return timelines.reduce((acc, timeline) => {
    const veredicto = timeline.cadeia?.expiracaoIgualTurma ?? 'sem-dados'
    if (veredicto === 'a-menos') acc.legado += 1
    else if (veredicto in acc) acc[veredicto as keyof Contagem] += 1
    else acc['sem-dados'] += 1
    return acc
  }, contagemVazia())
}

function contarPorRamo(timelines: any[], users: any[]): Record<string, Contagem> {
  const usersById = new Map(users.map((user) => [String(user._id), user]))
  const out: Record<string, Contagem> = {}
  for (const timeline of timelines) {
    const ramo = ramoDaTurma(turmaActual(usersById.get(String(timeline.userId))))
    const row = out[ramo] ?? contagemVazia()
    const veredicto = timeline.cadeia?.expiracaoIgualTurma ?? 'sem-dados'
    if (veredicto === 'a-menos') row.legado += 1
    else if (veredicto in row) row[veredicto as keyof Contagem] += 1
    else row['sem-dados'] += 1
    out[ramo] = row
  }
  return out
}

async function main() {
  const lidosEm = new Date().toISOString()
  await ligar()
  try {
    const regenerado = await gerarTimelinesEmLote()
    const activos = await activosOgi(mongoose.connection.db)
    const contagem = contar(activos.timelines)
    const resultado = {
      lidosEm,
      fontes: 'espelhos lidos no início da regeneração; ver timelines.fontes por aluno',
      regenerado,
      activosComTimeline: activos.timelines.length,
      contagem,
      porRamo: contarPorRamo(activos.timelines, activos.users),
      alunosEsperados: 4427,
      totalEsperadoBate: regenerado.alunos === 4427,
      parouPorDivergencias: contagem.divergente > 5,
      referencia: { ok: 791, legado: 98, divergente: 4, 'sem-dados': 33 }
    }
    console.log(JSON.stringify(resultado, null, 2))
    if (resultado.parouPorDivergencias) process.exitCode = 2
  } finally {
    await desligar()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
