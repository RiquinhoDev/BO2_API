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

test('observa apenas turmas actuais e protege sinais ambíguos', async () => {
  const argvOriginal = process.argv
  const connectOriginal = mongoose.connect
  const disconnectOriginal = mongoose.disconnect
  const userFindOriginal = (User as any).find
  const tagsFindOriginal = (ACStudentTag as any).find
  const historicosFindOriginal = (StudentClassHistory as any).find
  const mongoUriOriginal = process.env.MONGO_URI

  process.argv = [...argvOriginal.filter((argumento) => argumento !== '--write')]
  process.env.MONGO_URI = 'mongodb://seed-teste.local/isolado'
  ;(mongoose as any).connect = async () => mongoose
  ;(mongoose as any).disconnect = async () => undefined
  ;(User as any).find = () => consulta([
    { _id: 'aluno-1', email: 'aluno1@example.com', hotmart: { enrolledClasses: [{ className: 'Turma 19 | 2606' }] } },
    { _id: 'aluno-2', email: 'aluno2@example.com', hotmart: { enrolledClasses: [{ className: 'Turma 19 | 2606' }] } },
    { _id: 'aluno-3', email: 'aluno3@example.com', hotmart: { enrolledClasses: [{ className: 'Turma 19 | 2606' }] } },
    { _id: 'aluno-4', email: 'aluno4@example.com', hotmart: { enrolledClasses: [{ className: 'Turma Renovação | 2610' }] } },
    { _id: 'aluno-5', email: 'aluno5@example.com', hotmart: { enrolledClasses: [{ className: 'Turma Renovação | 2610' }] } },
    { _id: 'aluno-6', email: 'aluno6@example.com', hotmart: { enrolledClasses: [{ className: 'Turma Renovação | 2610' }] } },
    { _id: 'aluno-7', email: 'aluno7@example.com', hotmart: { enrolledClasses: [{ className: 'Turma 20 | 2611' }] } },
    { _id: 'aluno-8', email: 'aluno8@example.com', hotmart: { enrolledClasses: [{ className: 'Turma 20 | 2611' }] } },
    { _id: 'aluno-9', email: 'aluno9@example.com', hotmart: { enrolledClasses: [{ className: 'Turma 20 | 2611' }] } },
    { _id: 'aluno-10', email: 'aluno10@example.com', hotmart: { enrolledClasses: [{ className: 'Turmas 1, 2 e 3 [3a renov] | 2605' }] } },
    { _id: 'aluno-11', email: 'aluno11@example.com', hotmart: { enrolledClasses: [{ className: 'Turmas 1, 2 e 3 [3a renov] | 2605' }] } },
    { _id: 'aluno-12', email: 'aluno12@example.com', hotmart: { enrolledClasses: [{ className: 'Turmas 1, 2 e 3 [3a renov] | 2605' }] } }
  ])
  ;(ACStudentTag as any).find = () => consulta([
    { email: 'aluno1@example.com', tags: [{ tagId: 'tag-2305', nome: 'Aluno OGI L2305 - Turma 19' }, { tagId: 'tag-2611-19', nome: 'Aluno OGI 2611 - Turma 19' }] },
    { email: 'aluno2@example.com', tags: [{ tagId: 'tag-2305', nome: 'Aluno OGI L2305 - Turma 19' }, { tagId: 'tag-2611-19', nome: 'Aluno OGI 2611 - Turma 19' }] },
    { email: 'aluno3@example.com', tags: [{ tagId: 'tag-2305', nome: 'Aluno OGI L2305 - Turma 19' }, { tagId: 'tag-2611-19', nome: 'Aluno OGI 2611 - Turma 19' }] },
    { email: 'aluno4@example.com', tags: [{ tagId: 'tag-2511-renov-3', nome: 'Aluno OGI 2511 - Renovação Turma 3' }] },
    { email: 'aluno5@example.com', tags: [{ tagId: 'tag-2511-renov-3', nome: 'Aluno OGI 2511 - Renovação Turma 3' }] },
    { email: 'aluno6@example.com', tags: [{ tagId: 'tag-2511-renov-3', nome: 'Aluno OGI 2511 - Renovação Turma 3' }] },
    { email: 'aluno7@example.com', tags: [{ tagId: 'tag-2611-20', nome: 'Aluno OGI 2611 - Turma 20' }] },
    { email: 'aluno8@example.com', tags: [{ tagId: 'tag-2611-20', nome: 'Aluno OGI 2611 - Turma 20' }] },
    { email: 'aluno9@example.com', tags: [{ tagId: 'tag-2611-20', nome: 'Aluno OGI 2611 - Turma 20' }] },
    { email: 'aluno10@example.com', tags: [{ tagId: 'tag-2605-alfa', nome: 'Aluno OGI 2605 - Renovação Turma Alfa' }, { tagId: 'tag-2605-beta', nome: 'Aluno OGI 2605 - Renovação Turma Beta' }] },
    { email: 'aluno11@example.com', tags: [{ tagId: 'tag-2605-alfa', nome: 'Aluno OGI 2605 - Renovação Turma Alfa' }, { tagId: 'tag-2605-beta', nome: 'Aluno OGI 2605 - Renovação Turma Beta' }] },
    { email: 'aluno12@example.com', tags: [{ tagId: 'tag-2605-alfa', nome: 'Aluno OGI 2605 - Renovação Turma Alfa' }, { tagId: 'tag-2605-beta', nome: 'Aluno OGI 2605 - Renovação Turma Beta' }] }
  ])
  ;(StudentClassHistory as any).find = () => consulta([
    { studentId: 'aluno-7', className: 'Turma 1 | 2306' },
    { studentId: 'aluno-8', className: 'Turma 1 | 2306' },
    { studentId: 'aluno-9', className: 'Turma 1 | 2306' }
  ])

  const modulo = await import('../../../../scripts/seed-turma-tag-map')
  const executarSeed = (modulo as any).executarSeed
  if (!executarSeed) {
    assert.fail('o seed deve exportar uma função executarSeed awaitable')
  }

  try {
    const resultado = await executarSeed()

    assert.deepEqual(
      resultado.excepcoes.map((excepcao: any) => excepcao.className).sort(),
      ['Turma 19 | 2606', 'Turma 20 | 2611']
    )
    assert.deepEqual(resultado.conflitosDeNomeProtegidos, [
      'Turma Renovação | 2610 → observado Aluno OGI 2511 - Renovação Turma 3'
    ])
    assert.equal(resultado.ambiguas.length, 1)
    assert.match(resultado.ambiguas[0], /Turmas 1, 2 e 3 \[3a renov\] \| 2605/)
  } finally {
    process.argv = argvOriginal
    if (mongoUriOriginal === undefined) delete process.env.MONGO_URI
    else process.env.MONGO_URI = mongoUriOriginal
    ;(mongoose as any).connect = connectOriginal
    ;(mongoose as any).disconnect = disconnectOriginal
    ;(User as any).find = userFindOriginal
    ;(ACStudentTag as any).find = tagsFindOriginal
    ;(StudentClassHistory as any).find = historicosFindOriginal
  }
})
