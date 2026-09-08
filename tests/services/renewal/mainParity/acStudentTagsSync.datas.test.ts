import assert from 'node:assert/strict'
import { reutilizarDatasExistentes } from '../../../../src/services/renewal/acStudentTagsSync.service'

test('reutiliza todas as datas quando o conjunto de tags ja esta preenchido', () => {
  const atuais: Array<{ tagId: string; aplicadaEm: Date | null }> = [
    { tagId: '1', aplicadaEm: null },
    { tagId: '2', aplicadaEm: null }
  ]
  const completas = reutilizarDatasExistentes(atuais, [
    { tagId: '1', aplicadaEm: new Date('2025-01-02T00:00:00Z') },
    { tagId: '2', aplicadaEm: new Date('2025-03-04T00:00:00Z') }
  ])

  assert.equal(completas, true)
  assert.equal(atuais[0].aplicadaEm?.toISOString(), '2025-01-02T00:00:00.000Z')
  assert.equal(atuais[1].aplicadaEm?.toISOString(), '2025-03-04T00:00:00.000Z')
})

test('pede nova leitura quando aparece uma tag sem data guardada', () => {
  const atuais: Array<{ tagId: string; aplicadaEm: Date | null }> = [
    { tagId: '1', aplicadaEm: null },
    { tagId: '3', aplicadaEm: null }
  ]
  const completas = reutilizarDatasExistentes(atuais, [
    { tagId: '1', aplicadaEm: new Date('2025-01-02T00:00:00Z') }
  ])

  assert.equal(completas, false)
  assert.equal(atuais[0].aplicadaEm?.toISOString(), '2025-01-02T00:00:00.000Z')
  assert.equal(atuais[1].aplicadaEm, null)
})
