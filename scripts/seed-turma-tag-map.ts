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
import TurmaTagMap from '../src/models/TurmaTagMap'
import { resolverTagDaTurma, normalizarNomeTurma } from '../src/services/renewal/turmaTagResolver'
import { periodoDaTag } from '../src/services/renewal/renewalTimeline.generator'
import { indiceDePeriodo } from '../src/services/renewal/renewalCycles'

const CONCORDANCIA_MINIMA = 0.7
const ALUNOS_MINIMOS = 3
const MENCIONA_PERCURSO = /turma|renova(ç|c)(ã|a)o/i

function normalizarTagSemPeriodo(nome: string): string {
  return String(nome)
    .replace(/\bL?\d{4}\b/gi, (token) => (periodoDaTag(token) ? '' : token))
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLowerCase()
}

export async function executarSeed() {
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
  const tagsPorEmail = new Map<string, any[]>()
  for (const doc of tagsDocs) {
    let indiceMaisRecente: number | null = null
    const tagsMaisRecentes: any[] = []

    for (const tag of doc.tags ?? []) {
      if (tag.tipo !== 'canonica' && tag.tipo !== 'membresia') continue
      if (!MENCIONA_PERCURSO.test(tag.nome)) continue
      const indiceTag = indiceDePeriodo(periodoDaTag(tag.nome))
      if (indiceTag === null) continue

      if (indiceMaisRecente === null || indiceTag > indiceMaisRecente) {
        indiceMaisRecente = indiceTag
        tagsMaisRecentes.length = 0
      }
      if (indiceTag === indiceMaisRecente) tagsMaisRecentes.push(tag)
    }

    tagsPorEmail.set(doc.email, tagsMaisRecentes)
  }
  const porTurma = new Map<
    string,
    { className: string; contagem: Map<string, { id: string; n: number }>; alunos: number }
  >()

  for (const user of users) {
    const email = String(user.email ?? '').toLowerCase().trim()
    const turmasActivas = (user.hotmart?.enrolledClasses ?? [])
      .filter((turma: any) => turma?.className && turma?.isActive !== false)
    const turmaActual = turmasActivas.at(-1)
    if (!turmaActual) continue

    // O seed observa a turma actual; mapas históricos já persistidos não
    // podem ser inferidos a partir das tags actuais do aluno.
    const chave = normalizarNomeTurma(turmaActual.className)
    if (!porTurma.has(chave)) {
      porTurma.set(chave, { className: turmaActual.className, contagem: new Map(), alunos: 0 })
    }
    const registo = porTurma.get(chave)!
    registo.alunos += 1

    for (const tag of tagsPorEmail.get(email) ?? []) {
      const actualContagem = registo.contagem.get(tag.nome) ?? { id: tag.tagId, n: 0 }
      actualContagem.n += 1
      registo.contagem.set(tag.nome, actualContagem)
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
  const conflitosDeNomeProtegidos: string[] = []
  const ambiguas: string[] = []

  for (const [chave, registo] of porTurma) {
    if (registo.alunos < ALUNOS_MINIMOS) continue

    const ordenadas = [...registo.contagem.entries()].sort((a, b) => b[1].n - a[1].n)
    const [nomeDominante, dados] = ordenadas[0] ?? [null, null]
    if (!nomeDominante || !dados || dados.n / registo.alunos < CONCORDANCIA_MINIMA) {
      semSinal.push(registo.className)
      continue
    }

    const empatadas = ordenadas.filter(([, candidata]) => candidata.n === dados.n)
    if (empatadas.length > 1) {
      ambiguas.push(
        `${registo.className} → ${empatadas
          .map(([nome, candidata]) => `${nome} (${candidata.n} alunos)`)
          .join(' | ')}`
      )
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

    if (
      convencao &&
      normalizarTagSemPeriodo(convencao) !== normalizarTagSemPeriodo(nomeDominante)
    ) {
      conflitosDeNomeProtegidos.push(
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
  if (conflitosDeNomeProtegidos.length) {
    console.log(`\nConflitos de nome protegidos (não escritos): ${conflitosDeNomeProtegidos.length}`)
    conflitosDeNomeProtegidos.forEach((linha) => console.log(`  ${linha}`))
  }
  if (ambiguas.length) {
    console.log(`\nSinais ambíguos (não escritos): ${ambiguas.length}`)
    ambiguas.forEach((linha) => console.log(`  ${linha}`))
  }

  const resultado = {
    excepcoes,
    semSinal,
    conflitosProtegidos,
    conflitosDeNomeProtegidos,
    ambiguas
  }

  if (!escrever) {
    console.log('\nDry-run. Corre com --write para gravar.')
    return resultado
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

  return resultado
}

if (require.main === module) {
  executarSeed()
    .catch((error) => {
      console.error(error)
      process.exitCode = 1
    })
    .finally(async () => {
      await mongoose.disconnect()
    })
}
