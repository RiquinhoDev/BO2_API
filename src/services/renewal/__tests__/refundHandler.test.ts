import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deveTratarReembolso, type RefundCandidate } from '../refundHandler.service'
import { handleRefunds } from '../refundHandler.service'
import HotmartSaleHistory from '../../../models/HotmartSaleHistory'
import StudentRenewalTimeline from '../../../models/StudentRenewalTimeline'
import ACStudentTag from '../../../models/ACStudentTag'
import UserProduct from '../../../models/UserProduct'
import AcWriteLog from '../../../models/renewal/AcWriteLog'
import { activeCampaignService } from '../../activeCampaign/activeCampaignService'

const candidate = (p: Partial<RefundCandidate>): RefundCandidate => ({
  refundDate: new Date('2026-05-25T00:00:00Z'),
  validSalesAfter: 0,
  turmaTags: [{ id: '42', nome: 'Aluno OGI 2605 - Renovação', aplicadaEm: new Date('2026-05-25T00:00:00Z') }],
  ...p
})

test('reembolso sem compra posterior deve retirar a tag da turma', () => {
  assert.deepEqual(deveTratarReembolso(candidate({})), { tratar: true, motivo: 'semCompraPosterior' })
})

test('recompra posterior protege o aluno e não remove a tag', () => {
  assert.deepEqual(deveTratarReembolso(candidate({ validSalesAfter: 1 })), {
    tratar: false,
    motivo: 'temCompraPosterior'
  })
})

test('recompra de outro ciclo não protege o reembolso deste ciclo', async () => {
  const originals = {
    sales: (HotmartSaleHistory as any).find,
    timelines: (StudentRenewalTimeline as any).find,
    tags: (ACStudentTag as any).find,
    product: (UserProduct as any).findOne,
    log: (AcWriteLog as any).create,
    remove: activeCampaignService.removeTag
  }
  const query = (rows: any[]) => ({
    select: () => ({ lean: () => ({ exec: async () => rows }) }),
    lean: () => ({ exec: async () => rows })
  })
  let removals = 0
  ;(HotmartSaleHistory as any).find = () => query([{
    userId: 'u1',
    email: 'aluno@example.com',
    sales: [
      { transaction: 'R1', transactionStatus: 'REFUNDED', approvedDate: new Date('2026-05-25T00:00:00Z') },
      { transaction: 'N2', transactionStatus: 'COMPLETE', approvedDate: new Date('2026-06-25T00:00:00Z') }
    ]
  }])
  ;(StudentRenewalTimeline as any).find = () => query([{
    userId: 'u1',
    ciclos: [
      {
        compras: [{ transacao: 'R1', data: new Date('2026-05-25T00:00:00Z'), reembolsada: true }],
        coortes: [{ tag: { id: '42', nome: 'Aluno OGI 2605 - Renovação' } }]
      },
      { compras: [{ transacao: 'N2', data: new Date('2026-06-25T00:00:00Z'), reembolsada: false }] }
    ]
  }])
  ;(ACStudentTag as any).find = () => query([{ email: 'aluno@example.com', tags: [{ tagId: '42', nome: 'Aluno OGI 2605 - Renovação' }] }])
  ;(UserProduct as any).findOne = () => query(null)
  ;(AcWriteLog as any).create = async () => undefined
  activeCampaignService.removeTag = (async () => { removals += 1 }) as any
  try {
    const report = await handleRefunds({ dryRun: false })
    assert.equal(report.protegidosPorRecompra, 0)
    assert.equal(report.aRemover, 1)
    assert.equal(removals, 1)
  } finally {
    ;(HotmartSaleHistory as any).find = originals.sales
    ;(StudentRenewalTimeline as any).find = originals.timelines
    ;(ACStudentTag as any).find = originals.tags
    ;(UserProduct as any).findOne = originals.product
    ;(AcWriteLog as any).create = originals.log
    activeCampaignService.removeTag = originals.remove
  }
})

test('reembolso sem tag conta mas não tem remoção para fazer', () => {
  const r = deveTratarReembolso(candidate({ turmaTags: [] }))
  assert.equal(r.tratar, true)
  assert.equal(r.motivo, 'semTag')
})

test('dry-run por omissão não remove tag nem marca UserProduct', async () => {
  const originals = {
    sales: (HotmartSaleHistory as any).find,
    timelines: (StudentRenewalTimeline as any).find,
    tags: (ACStudentTag as any).find,
    product: (UserProduct as any).findOne,
    update: (UserProduct as any).updateOne,
    log: (AcWriteLog as any).create,
    remove: activeCampaignService.removeTag
  }
  const query = (rows: any[]) => ({
    select: () => ({ lean: () => ({ exec: async () => rows }) }),
    lean: () => ({ exec: async () => rows })
  })
  let removals = 0
  let updates = 0
  ;(HotmartSaleHistory as any).find = () => query([{
    userId: 'u1',
    productId: 'p1',
    email: 'aluno@example.com',
    sales: [{ transaction: 'R1', transactionStatus: 'REFUNDED', approvedDate: new Date('2026-05-25T00:00:00Z') }]
  }])
  ;(StudentRenewalTimeline as any).find = () => query([{
    userId: 'u1',
    ciclos: [{ compras: [{ transacao: 'R1', reembolsada: true }], coortes: [{ tag: { id: '42', nome: 'Aluno OGI 2605 - Renovação' } }] }]
  }])
  ;(ACStudentTag as any).find = () => query([{ email: 'aluno@example.com', tags: [{ tagId: '42', nome: 'Aluno OGI 2605 - Renovação' }] }])
  ;(UserProduct as any).findOne = () => query({ _id: 'up1' })
  ;(UserProduct as any).updateOne = async () => { updates += 1 }
  ;(AcWriteLog as any).create = async () => undefined
  activeCampaignService.removeTag = (async () => { removals += 1 }) as any
  try {
    const report = await handleRefunds()
    assert.equal(report.dryRun, true)
    assert.equal(report.aRemover, 1)
    assert.equal(updates, 0)
    assert.equal(removals, 0)
  } finally {
    ;(HotmartSaleHistory as any).find = originals.sales
    ;(StudentRenewalTimeline as any).find = originals.timelines
    ;(ACStudentTag as any).find = originals.tags
    ;(UserProduct as any).findOne = originals.product
    ;(UserProduct as any).updateOne = originals.update
    ;(AcWriteLog as any).create = originals.log
    activeCampaignService.removeTag = originals.remove
  }
})
