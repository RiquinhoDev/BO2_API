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

test('turma genérica fica sem mapeamento, não é tag inventada', () => {
  const r = decidirTurmaTag({ turmaNome: 'Turma Renovação Genérica', mapa: null, tags: [], contactId: 'c1' })
  assert.equal(r.acao, 'ignorar')
  assert.equal(r.motivo, 'semMapeamento')
})

test('sem contacto não tenta chamar a AC', () => {
  const r = decidirTurmaTag({ turmaNome: 'Turma Renovação | 2606', mapa, tags: [], contactId: null })
  assert.equal(r.acao, 'ignorar')
  assert.equal(r.motivo, 'semContacto')
})

test('aluno sem compra válida nunca fica candidato a tag', () => {
  const r = decidirTurmaTag({ turmaNome: 'Turma Renovação | 2606', mapa, tags: [], contactId: 'c1', temCompraValida: false })
  assert.equal(r.acao, 'ignorar')
  assert.equal(r.motivo, 'semCompraValida')
})

test('tag que não existe na AC é recusada sem aplicação', () => {
  const r = decidirTurmaTag({ turmaNome: 'Turma Renovação | 2606', mapa, tags: [], contactId: 'c1', confirmacaoAc: false })
  assert.equal(r.acao, 'ignorar')
  assert.equal(r.motivo, 'tagInexistente')
})

test('dry-run por omissão não chama a AC', async () => {
  const originals = {
    timeline: (StudentRenewalTimeline as any).find,
    mapa: (TurmaTagMap as any).find,
    tags: (ACStudentTag as any).find,
    log: (AcWriteLog as any).create,
    findTag: (activeCampaignService as any).findExistingTagByName,
    post: activeCampaignService.client.post
  }
  const query = (rows: any[]) => ({
    select: () => ({ lean: () => ({ exec: async () => rows }) })
  })
  let chamadasAc = 0
  ;(StudentRenewalTimeline as any).find = () => query([{
    email: 'aluno@example.com',
    ciclos: [{ turma: { nome: 'Turma Renovação | 2606' }, compras: [{ reembolsada: false }] }]
  }])
  ;(TurmaTagMap as any).find = () => query([{ classNameNormalizado: 'turma renovação | 2606', tagNome: mapa.tagNome, tagId: '42' }])
  ;(ACStudentTag as any).find = () => query([{ email: 'aluno@example.com', contactId: 'c1', tags: [] }])
  ;(AcWriteLog as any).create = async () => undefined
  ;(activeCampaignService as any).findExistingTagByName = async () => '42'
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
    ;(activeCampaignService as any).findExistingTagByName = originals.findTag
    activeCampaignService.client.post = originals.post
  }
})

test('resolvedor convencional usa a tag confirmada na AC', async () => {
  const originals = {
    timeline: (StudentRenewalTimeline as any).find,
    mapa: (TurmaTagMap as any).find,
    tags: (ACStudentTag as any).find,
    log: (AcWriteLog as any).create,
    findTag: (activeCampaignService as any).findExistingTagByName
  }
  const query = (rows: any[]) => ({ select: () => ({ lean: () => ({ exec: async () => rows }) }) })
  const logs: any[] = []
  ;(StudentRenewalTimeline as any).find = () => query([{ email: 'convencao@example.com', ciclos: [{ turma: { nome: 'Turma 18 | 2605' }, compras: [{ reembolsada: false }] }] }])
  ;(TurmaTagMap as any).find = () => query([])
  ;(ACStudentTag as any).find = () => query([{ email: 'convencao@example.com', contactId: 'c18', tags: [] }])
  ;(AcWriteLog as any).create = async (log: any) => { logs.push(log) }
  ;(activeCampaignService as any).findExistingTagByName = async (nome: string) => nome === 'Aluno OGI L2605 - Turma 18' ? '1805' : null
  try {
    const report = await syncTurmaTags()
    assert.equal(report.aAplicar, 1)
    assert.equal(report.semMapeamento, 0)
    assert.equal(logs[0].tagNome, 'Aluno OGI L2605 - Turma 18')
    assert.equal(logs[0].tagId, '1805')
  } finally {
    ;(StudentRenewalTimeline as any).find = originals.timeline
    ;(TurmaTagMap as any).find = originals.mapa
    ;(ACStudentTag as any).find = originals.tags
    ;(AcWriteLog as any).create = originals.log
    ;(activeCampaignService as any).findExistingTagByName = originals.findTag
  }
})

test('reembolsados e alunos sem compras ficam em semCompraValida e aAplicar zero', async () => {
  const originals = {
    timeline: (StudentRenewalTimeline as any).find,
    mapa: (TurmaTagMap as any).find,
    tags: (ACStudentTag as any).find,
    log: (AcWriteLog as any).create,
    findTag: (activeCampaignService as any).findExistingTagByName
  }
  const query = (rows: any[]) => ({ select: () => ({ lean: () => ({ exec: async () => rows }) }) })
  ;(StudentRenewalTimeline as any).find = () => query([
    { email: 'refund@example.com', ciclos: [{ turma: { nome: 'Turma Renovação | 2606' }, compras: [{ reembolsada: true }] }] },
    { email: 'zero@example.com', ciclos: [{ turma: { nome: 'Turma Renovação | 2606' }, compras: [] }] }
  ])
  ;(TurmaTagMap as any).find = () => query([])
  ;(ACStudentTag as any).find = () => query([
    { email: 'refund@example.com', contactId: 'r1', tags: [] },
    { email: 'zero@example.com', contactId: 'z1', tags: [] }
  ])
  ;(AcWriteLog as any).create = async () => undefined
  let calls = 0
  ;(activeCampaignService as any).findExistingTagByName = async () => { calls += 1; return '42' }
  try {
    const report = await syncTurmaTags()
    assert.equal(report.semCompraValida, 2)
    assert.equal(report.aAplicar, 0)
    assert.equal(calls, 0)
  } finally {
    ;(StudentRenewalTimeline as any).find = originals.timeline
    ;(TurmaTagMap as any).find = originals.mapa
    ;(ACStudentTag as any).find = originals.tags
    ;(AcWriteLog as any).create = originals.log
    ;(activeCampaignService as any).findExistingTagByName = originals.findTag
  }
})

test('tag ausente na AC fica em tagInexistente e não em aAplicar', async () => {
  const originals = {
    timeline: (StudentRenewalTimeline as any).find,
    mapa: (TurmaTagMap as any).find,
    tags: (ACStudentTag as any).find,
    log: (AcWriteLog as any).create,
    findTag: (activeCampaignService as any).findExistingTagByName
  }
  const query = (rows: any[]) => ({ select: () => ({ lean: () => ({ exec: async () => rows }) }) })
  ;(StudentRenewalTimeline as any).find = () => query([{ email: 'missing@example.com', ciclos: [{ turma: { nome: 'Turma 18 | 2605' }, compras: [{ reembolsada: false }] }] }])
  ;(TurmaTagMap as any).find = () => query([])
  ;(ACStudentTag as any).find = () => query([{ email: 'missing@example.com', contactId: 'm1', tags: [] }])
  ;(AcWriteLog as any).create = async () => undefined
  ;(activeCampaignService as any).findExistingTagByName = async () => null
  try {
    const report = await syncTurmaTags()
    assert.equal(report.tagInexistente, 1)
    assert.equal(report.aAplicar, 0)
  } finally {
    ;(StudentRenewalTimeline as any).find = originals.timeline
    ;(TurmaTagMap as any).find = originals.mapa
    ;(ACStudentTag as any).find = originals.tags
    ;(AcWriteLog as any).create = originals.log
    ;(activeCampaignService as any).findExistingTagByName = originals.findTag
  }
})
