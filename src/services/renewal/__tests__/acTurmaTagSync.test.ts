import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decidirTurmaTag } from '../acTurmaTagSync.service'
import { syncTurmaTags } from '../acTurmaTagSync.service'
import StudentRenewalTimeline from '../../../models/StudentRenewalTimeline'
import TurmaTagMap from '../../../models/TurmaTagMap'
import ACStudentTag from '../../../models/ACStudentTag'
import AcWriteLog from '../../../models/renewal/AcWriteLog'
import { activeCampaignService } from '../../activeCampaign/activeCampaignService'

const mapa = { tagNome: 'Aluno OGI 2606 - Renovação', tagId: '42' }

test('turma mapeada e sem tag fica pronta para aplicar', () => {
  assert.deepEqual(
    decidirTurmaTag({ turmaNome: 'Turma Renovação | 2606', mapa, tags: [], contactId: 'c1' }),
    { acao: 'aplicar', motivo: null, tagNome: mapa.tagNome, tagId: mapa.tagId }
  )
})

test('tag já existente não volta a ser aplicada', () => {
  const r = decidirTurmaTag({
    turmaNome: 'Turma Renovação | 2606',
    mapa,
    tags: [{ id: '42', nome: mapa.tagNome }],
    contactId: 'c1'
  })
  assert.equal(r.acao, 'ignorar')
  assert.equal(r.motivo, 'jaTem')
})

test('turma fora do mapa é recusa explícita', () => {
  const r = decidirTurmaTag({ turmaNome: 'Turma 19 | 2701', mapa: null, tags: [], contactId: 'c1' })
  assert.equal(r.acao, 'ignorar')
  assert.equal(r.motivo, 'semMapeamento')
})

test('turma genérica fica à espera, não é erro nem tag inventada', () => {
  const r = decidirTurmaTag({ turmaNome: 'Turma Renovação Genérica', mapa: null, tags: [], contactId: 'c1' })
  assert.equal(r.acao, 'ignorar')
  assert.equal(r.motivo, 'aEsperaDeTurma')
})

test('sem contacto não tenta chamar a AC', () => {
  const r = decidirTurmaTag({ turmaNome: 'Turma Renovação | 2606', mapa, tags: [], contactId: null })
  assert.equal(r.acao, 'ignorar')
  assert.equal(r.motivo, 'semContacto')
})

test('dry-run por omissão não chama a AC', async () => {
  const originals = {
    timeline: (StudentRenewalTimeline as any).find,
    mapa: (TurmaTagMap as any).find,
    tags: (ACStudentTag as any).find,
    log: (AcWriteLog as any).create,
    post: activeCampaignService.client.post
  }
  const query = (rows: any[]) => ({
    select: () => ({ lean: () => ({ exec: async () => rows }) })
  })
  let chamadasAc = 0
  ;(StudentRenewalTimeline as any).find = () => query([{
    email: 'aluno@example.com',
    ciclos: [{ turma: { nome: 'Turma Renovação | 2606' } }]
  }])
  ;(TurmaTagMap as any).find = () => query([{ classNameNormalizado: 'turma renovação | 2606', tagNome: mapa.tagNome, tagId: '42' }])
  ;(ACStudentTag as any).find = () => query([{ email: 'aluno@example.com', contactId: 'c1', tags: [] }])
  ;(AcWriteLog as any).create = async () => undefined
  activeCampaignService.client.post = (async () => { chamadasAc += 1 }) as any
  try {
    const report = await syncTurmaTags()
    assert.equal(report.dryRun, true)
    assert.equal(report.aAplicar, 1)
    assert.equal(chamadasAc, 0)
  } finally {
    ;(StudentRenewalTimeline as any).find = originals.timeline
    ;(TurmaTagMap as any).find = originals.mapa
    ;(ACStudentTag as any).find = originals.tags
    ;(AcWriteLog as any).create = originals.log
    activeCampaignService.client.post = originals.post
  }
})
