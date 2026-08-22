import assert from 'node:assert/strict'
import { test } from 'node:test'
import mongoose from 'mongoose'
import { User } from '../../../models'
import ACStudentTag from '../../../models/ACStudentTag'
import StudentClassHistory from '../../../models/StudentClassHistory'

function consulta(dados: unknown[]) {
  return {
    select() {
      return this
    },
    lean() {
      return this
    },
    async exec() {
      return dados
    }
  }
}

test('observa a tag de percurso mais recente mesmo quando está distante do período da turma', async () => {
  const argvOriginal = process.argv
  const logOriginal = console.log
  const connectOriginal = mongoose.connect
  const disconnectOriginal = mongoose.disconnect
  const userFindOriginal = (User as any).find
  const tagsFindOriginal = (ACStudentTag as any).find
  const historicosFindOriginal = (StudentClassHistory as any).find
  const mongoUriOriginal = process.env.MONGO_URI
  const linhas: string[] = []

  process.argv = [...argvOriginal.filter((argumento) => argumento !== '--write')]
  process.env.MONGO_URI = 'mongodb://seed-teste.local/isolado'
  console.log = (...argumentos: unknown[]) => linhas.push(argumentos.join(' '))
  ;(mongoose as any).connect = async () => mongoose
  ;(mongoose as any).disconnect = async () => undefined
  ;(User as any).find = () => consulta([
    { _id: 'aluno-1', email: 'aluno1@example.com', hotmart: { enrolledClasses: [{ className: 'Turma 19 | 2606' }] } },
    { _id: 'aluno-2', email: 'aluno2@example.com', hotmart: { enrolledClasses: [{ className: 'Turma 19 | 2606' }] } },
    { _id: 'aluno-3', email: 'aluno3@example.com', hotmart: { enrolledClasses: [{ className: 'Turma 19 | 2606' }] } },
    { _id: 'aluno-4', email: 'aluno4@example.com', hotmart: { enrolledClasses: [{ className: 'Turma Renovação | 2610' }] } },
    { _id: 'aluno-5', email: 'aluno5@example.com', hotmart: { enrolledClasses: [{ className: 'Turma Renovação | 2610' }] } },
    { _id: 'aluno-6', email: 'aluno6@example.com', hotmart: { enrolledClasses: [{ className: 'Turma Renovação | 2610' }] } }
  ])
  ;(ACStudentTag as any).find = () => consulta([
    { email: 'aluno1@example.com', tags: [{ tagId: 'tag-2305', nome: 'Aluno OGI L2305 - Turma 19' }, { tagId: 'tag-2611', nome: 'Aluno OGI 2611 - Turma 19' }] },
    { email: 'aluno2@example.com', tags: [{ tagId: 'tag-2305', nome: 'Aluno OGI L2305 - Turma 19' }, { tagId: 'tag-2611', nome: 'Aluno OGI 2611 - Turma 19' }] },
    { email: 'aluno3@example.com', tags: [{ tagId: 'tag-2305', nome: 'Aluno OGI L2305 - Turma 19' }, { tagId: 'tag-2611', nome: 'Aluno OGI 2611 - Turma 19' }] },
    { email: 'aluno4@example.com', tags: [{ tagId: 'tag-2511-renov-3', nome: 'Aluno OGI 2511 - Renovação Turma 3' }] },
    { email: 'aluno5@example.com', tags: [{ tagId: 'tag-2511-renov-3', nome: 'Aluno OGI 2511 - Renovação Turma 3' }] },
    { email: 'aluno6@example.com', tags: [{ tagId: 'tag-2511-renov-3', nome: 'Aluno OGI 2511 - Renovação Turma 3' }] }
  ])
  ;(StudentClassHistory as any).find = () => consulta([])

  try {
    await import('../../../../scripts/seed-turma-tag-map')
    await new Promise<void>((resolver) => setImmediate(resolver))
  } finally {
    process.argv = argvOriginal
    if (mongoUriOriginal === undefined) delete process.env.MONGO_URI
    else process.env.MONGO_URI = mongoUriOriginal
    console.log = logOriginal
    ;(mongoose as any).connect = connectOriginal
    ;(mongoose as any).disconnect = disconnectOriginal
    ;(User as any).find = userFindOriginal
    ;(ACStudentTag as any).find = tagsFindOriginal
    ;(StudentClassHistory as any).find = historicosFindOriginal
  }

  const saida = linhas.join('\n')
  assert.match(saida, /real:\s+Aluno OGI 2611 - Turma 19\s+\(3 alunos\)/)
  assert.match(saida, /Conflitos de nome protegidos \(não escritos\): 1/)
  assert.match(saida, /Turma Renovação \| 2610 → observado Aluno OGI 2511 - Renovação Turma 3/)
})
