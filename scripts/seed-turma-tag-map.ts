// ════════════════════════════════════════════════════════════
// 📁 scripts/seed-turma-tag-map.ts
// Semeia `turmatagmap` perguntando aos dados, não a um Excel:
// para cada turma, que tag de percurso é que os alunos dela têm
// de facto? Quando a resposta dominante difere da convenção, é
// uma excepção e fica registada.
//
// Dry-run por defeito. Só escreve com --write.
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import { User } from '../src/models'
import ACStudentTag from '../src/models/ACStudentTag'
import StudentClassHistory from '../src/models/StudentClassHistory'
import TurmaTagMap from '../src/models/TurmaTagMap'
import { resolverTagDaTurma, normalizarNomeTurma } from '../src/services/renewal/turmaTagResolver'
import { periodoDaTag } from '../src/services/renewal/renewalTimeline.generator'
import { parseTurmaName } from '../src/services/renewal/turmaParser'
import { indiceDePeriodo } from '../src/services/renewal/renewalCycles'

const CONCORDANCIA_MINIMA = 0.7
const ALUNOS_MINIMOS = 3
const MENCIONA_PERCURSO = /turma|renova(ç|c)(ã|a)o/i

async function main() {
  const escrever = process.argv.includes('--write')
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || ''
  if (!mongoUri) throw new Error('MONGO_URI ou MONGODB_URI não definido')
  await mongoose.connect(mongoUri)

  const users = (await (User as any)
    .find({})
    .select('email hotmart.enrolledClasses')
    .lean()
    .exec()) as any[]

  const tagsDocs = (await (ACStudentTag as any).find({}).select('email tags').lean().exec()) as any[]
  const tagsPorEmail = new Map<string, any[]>(tagsDocs.map((doc) => [doc.email, doc.tags ?? []]))
  const historicos = (await (StudentClassHistory as any)
    .find({})
    .select('studentId classId className')
    .lean()
    .exec()) as any[]
  const historicosPorUser = new Map<string, any[]>()
  for (const historico of historicos) {
    const chaveUser = String(historico.studentId)
    if (!historicosPorUser.has(chaveUser)) historicosPorUser.set(chaveUser, [])
    historicosPorUser.get(chaveUser)!.push(historico)
  }
  const porTurma = new Map<
    string,
    { className: string; contagem: Map<string, { id: string; n: number }>; alunos: number }
  >()

  for (const user of users) {
    const email = String(user.email ?? '').toLowerCase().trim()
    const turmas = [
      ...(user.hotmart?.enrolledClasses ?? []),
      ...(historicosPorUser.get(String(user._id)) ?? [])
    ].filter((turma: any) => turma?.className)
    const turmasVistas = new Set<string>()

    // O mapa também serve os ciclos históricos. Olhar apenas para a
    // turma actual escondia excepções antigas como a Turma 2 | 2306.
    for (const turma of turmas) {
      const chave = normalizarNomeTurma(turma.className)
      if (turmasVistas.has(chave)) continue
      turmasVistas.add(chave)

      if (!porTurma.has(chave)) {
        porTurma.set(chave, { className: turma.className, contagem: new Map(), alunos: 0 })
      }
      const registo = porTurma.get(chave)!
      registo.alunos += 1
      const idxTurma = indiceDePeriodo(parseTurmaName(turma.className).periodYYMM)

      for (const tag of tagsPorEmail.get(email) ?? []) {
        if (!MENCIONA_PERCURSO.test(tag.nome)) continue
        const idxTag = indiceDePeriodo(periodoDaTag(tag.nome))
        if (idxTag === null) continue
        // Mesma janela assimétrica do gerador: a tag pode estar até 4
        // meses à FRENTE da turma (quem compra espera que ela abra) e 2
        // ATRÁS (entrou numa coorte já aberta). Com o antigo ±1 a tag da
        // Turma 19 era descartada — a turma chamava-se | 2606 e a tag
        // 2610 — e a turma ficava de fora do mapa.
        if (idxTurma !== null) {
          const delta = idxTag - idxTurma
          if (delta > 4 || delta < -2) continue
        }

        const actualContagem = registo.contagem.get(tag.nome) ?? { id: tag.tagId, n: 0 }
        actualContagem.n += 1
        registo.contagem.set(tag.nome, actualContagem)
      }
    }
  }

  const excepcoes: Array<{
    chave: string
    className: string
    tagNome: string
    tagId: string
    n: number
    convencao: string | null
  }> = []
  const semSinal: string[] = []
  const conflitosProtegidos: string[] = []

  for (const [chave, registo] of porTurma) {
    if (registo.alunos < ALUNOS_MINIMOS) continue

    const ordenadas = [...registo.contagem.entries()].sort((a, b) => b[1].n - a[1].n)
    const [nomeDominante, dados] = ordenadas[0] ?? [null, null]
    if (!nomeDominante || !dados || dados.n / registo.alunos < CONCORDANCIA_MINIMA) {
      semSinal.push(registo.className)
      continue
    }

    const convencao = resolverTagDaTurma(registo.className).tagNome
    if (
      convencao &&
      normalizarNomeTurma(convencao) === normalizarNomeTurma(nomeDominante)
    ) {
      continue
    }

    // A tag observada é um elo inferior e não pode apagar o marcador
    // explícito de dois anos que vem da turma/compra. Estes casos têm
    // frequentemente as duas tags em simultâneo; não são excepções.
    if (convencao?.includes('[2anos]') && !nomeDominante.includes('[2anos]')) {
      conflitosProtegidos.push(
        `${registo.className} → observado ${nomeDominante}`
      )
      continue
    }

    excepcoes.push({
      chave,
      className: registo.className,
      tagNome: nomeDominante,
      tagId: dados.id,
      n: dados.n,
      convencao
    })
  }

  console.log(`\nTurmas analisadas: ${porTurma.size}`)
  console.log(`Excepções encontradas: ${excepcoes.length}\n`)
  for (const excepcao of excepcoes) {
    console.log(`  ${excepcao.className}`)
    console.log(`    convenção: ${excepcao.convencao ?? '— (não resolve)'}`)
    console.log(`    real:      ${excepcao.tagNome}  (${excepcao.n} alunos)`)
  }
  if (semSinal.length) {
    console.log(`\nSem concordância suficiente (não escritas): ${semSinal.length}`)
    semSinal.forEach((turma) => console.log(`  ${turma}`))
  }
  if (conflitosProtegidos.length) {
    console.log(`\nConflitos [2anos] protegidos (não escritos): ${conflitosProtegidos.length}`)
    conflitosProtegidos.forEach((linha) => console.log(`  ${linha}`))
  }

  if (!escrever) {
    console.log('\nDry-run. Corre com --write para gravar.')
    return
  }

  const ops = excepcoes.map((excepcao) => ({
    updateOne: {
      filter: { classNameNormalizado: excepcao.chave },
      update: {
        $set: {
          className: excepcao.className,
          tagNome: excepcao.tagNome,
          tagId: excepcao.tagId,
          origem: 'observada',
          alunosConcordantes: excepcao.n,
          nota: `convenção daria ${excepcao.convencao ?? 'nada'}`
        }
      },
      upsert: true
    }
  }))

  if (ops.length) {
    const resultado = await (TurmaTagMap as any).bulkWrite(ops, { ordered: false })
    console.log(`\nGravadas: ${(resultado.upsertedCount ?? 0) + (resultado.modifiedCount ?? 0)}`)
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await mongoose.disconnect()
  })
