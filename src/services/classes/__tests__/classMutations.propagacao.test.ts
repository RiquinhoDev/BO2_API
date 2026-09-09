import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ClassMutationsService,
  type ClassInput,
  type ClassMutationsWriter,
  type PropagacaoDeNome
} from '../classMutations.service'

// A Hotmart só devolve ids de turma. O nome é escrito à mão no backoffice
// para bater com o que lá se vê — mas as matrículas dos alunos e os registos
// de mudança de turma guardam uma CÓPIA do nome no instante em que foram
// criados, e ninguém volta lá. Renomear a turma deixava para trás registos
// com o nome antigo.

function escritor(overrides: Partial<ClassMutationsWriter> = {}) {
  const chamadas: Array<[string, string]> = []
  const writer: ClassMutationsWriter = {
    upsert: async () => ({ class: { classId: 'c1' }, isNew: false }),
    propagarNome: async (classId, nome) => {
      chamadas.push([classId, nome])
      return { matriculas: 3, historico: 7 }
    },
    classSummary: async () => null,
    remove: async () => undefined,
    ...overrides
  }
  return { chamadas, writer }
}

const relogio = { now: () => new Date('2026-09-09T00:00:00Z') }
const entrada = (p: Partial<ClassInput> = {}): ClassInput => ({
  classId: 'Mk7QYlQn7y',
  name: 'Turma 19 | 2610',
  ...p
})

test('editar o nome da turma reescreve-o nas matrículas e no histórico', async () => {
  const { chamadas, writer } = escritor()
  const service = new ClassMutationsService(writer, relogio)

  const r = await service.upsert(entrada())

  assert.deepEqual(chamadas, [['Mk7QYlQn7y', 'Turma 19 | 2610']])
  assert.deepEqual(r.propagado, { matriculas: 3, historico: 7 })
})

test('o nome vai aparado, como foi gravado na turma', async () => {
  const { chamadas, writer } = escritor()
  const service = new ClassMutationsService(writer, relogio)

  await service.upsert(entrada({ classId: '  Mk7QYlQn7y  ', name: '  Turma 19 | 2610  ' }))

  assert.deepEqual(chamadas, [['Mk7QYlQn7y', 'Turma 19 | 2610']])
})

test('uma falha a propagar não desfaz a edição já gravada', async () => {
  // O nome da turma é o que interessa e já está guardado. Perder a propagação
  // é ficar com registos velhos — devolver erro seria dizer ao utilizador que
  // a edição não pegou, quando pegou.
  const { writer } = escritor({
    propagarNome: async (): Promise<PropagacaoDeNome> => { throw new Error('BD em baixo') }
  })
  const service = new ClassMutationsService(writer, relogio)

  const r = await service.upsert(entrada())

  assert.equal(r.isNew, false)
  assert.deepEqual(r.propagado, { matriculas: 0, historico: 0 })
})

test('a propagação corre DEPOIS da escrita da turma', async () => {
  // Ao contrário, propagaria o nome antigo.
  const ordem: string[] = []
  const { writer } = escritor({
    upsert: async () => { ordem.push('turma'); return { class: {}, isNew: false } },
    propagarNome: async () => { ordem.push('propagar'); return { matriculas: 0, historico: 0 } }
  })
  const service = new ClassMutationsService(writer, relogio)

  await service.upsert(entrada())

  assert.deepEqual(ordem, ['turma', 'propagar'])
})
