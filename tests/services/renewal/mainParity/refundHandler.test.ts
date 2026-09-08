import assert from 'node:assert/strict'
import {
  deveTratarReembolso,
  MAX_REFUND_SCAN_ITEMS,
  RefundHandlerPartialFailure,
  type RefundCandidate,
} from '../../../../src/services/renewal/refundHandler.service'
import { handleRefunds } from '../../../../src/services/renewal/refundHandler.service'
import HotmartSaleHistory from '../../../../src/models/HotmartSaleHistory'
import StudentRenewalTimeline from '../../../../src/models/StudentRenewalTimeline'
import ACStudentTag from '../../../../src/models/ACStudentTag'
import UserProduct from '../../../../src/models/UserProduct'
import AcWriteLog from '../../../../src/models/renewal/AcWriteLog'
import { activeCampaignService } from '../../../../src/services/activeCampaign/activeCampaignService'
import { runWithMainParityPhaseHooks } from '../../../../src/services/renewal/mainParityExecution'
import type { CompositeExecutionPhaseHooks } from '../../../../src/services/cron/compositeExecution.service'

class MockQuery<T> {
  constructor(private readonly rows: T) {}
  select() { return this }
  sort() { return this }
  maxTimeMS() { return this }
  lean() { return this }
  async exec() { return this.rows }
  cursor() {
    const values = Array.isArray(this.rows) ? this.rows : []
    return {
      async *[Symbol.asyncIterator]() { yield * values },
      close: async () => undefined,
    }
  }
}

const query = <T>(rows: T) => new MockQuery(rows)
const hotmartModel = HotmartSaleHistory as unknown as { find: unknown }
const timelineModel = StudentRenewalTimeline as unknown as { find: unknown }
const tagModel = ACStudentTag as unknown as { find: unknown }
const productModel = UserProduct as unknown as { findOne: unknown; updateOne: unknown }
const writeLogModel = AcWriteLog as unknown as { create: unknown }

const candidate = (p: Partial<RefundCandidate>): RefundCandidate => ({
  refundDate: new Date('2026-05-25T00:00:00Z'),
  validSalesAfter: 0,
  turmaTags: [{ id: '42', nome: 'Aluno OGI 2605 - Renovação', aplicadaEm: new Date('2026-05-25T00:00:00Z') }],
  ...p
})

async function executarCenarioReembolso(opcoes: {
  refundDate: Date
  periodoReembolso: string
  recompra?: { periodo: string; data: Date; tagNome?: string }
  recompraPosterior?: { periodo: string; data: Date; tagNome?: string }
  ownershipError?: Error
  removeError?: Error
  removeResult?: boolean
  effects?: { logs: number; removals: number }
  extraRefundTags?: number
  phaseHooks?: CompositeExecutionPhaseHooks
}) {
  const originals = {
    sales: hotmartModel.find,
    timelines: timelineModel.find,
    tags: tagModel.find,
    product: productModel.findOne,
    log: writeLogModel.create,
    remove: activeCampaignService.removeTagStrict
  }
  let removals = 0
  const tagReembolso = 'Aluno OGI 2507 - Renovação'
  const tagRecompra = opcoes.recompra?.tagNome ?? 'Aluno OGI 2508 - Renovação'
  const tagRecompraPosterior = opcoes.recompraPosterior?.tagNome ?? 'Aluno OGI 2602 - Renovação'
  const extraRefundTags = Array.from({ length: opcoes.extraRefundTags ?? 0 }, (_, index) => ({
    tagId: String(100 + index), nome: `Aluno OGI extra ${index}`,
  }))
  const sales = [{
    transaction: 'R1',
    transactionStatus: 'REFUNDED',
    approvedDate: opcoes.refundDate
  }]
  if (opcoes.recompra) {
    sales.push({
      transaction: 'N2',
      transactionStatus: 'COMPLETE',
      approvedDate: opcoes.recompra.data
    })
  }
  if (opcoes.recompraPosterior) {
    sales.push({
      transaction: 'N3',
      transactionStatus: 'COMPLETE',
      approvedDate: opcoes.recompraPosterior.data
    })
  }
  const ciclos = [
    {
      periodo: opcoes.periodoReembolso,
      compras: [{ transacao: 'R1', data: opcoes.refundDate, reembolsada: true }],
      coortes: [
        { tag: { id: '42', nome: tagReembolso } },
        ...extraRefundTags.map((tag) => ({ tag: { id: tag.tagId, nome: tag.nome } })),
      ]
    },
    ...(opcoes.recompra ? [{
      periodo: opcoes.recompra.periodo,
      compras: [{ transacao: 'N2', data: opcoes.recompra.data, reembolsada: false }],
      coortes: [{ tag: { id: '43', nome: tagRecompra } }]
    }] : []),
    ...(opcoes.recompraPosterior ? [{
      periodo: opcoes.recompraPosterior.periodo,
      compras: [{ transacao: 'N3', data: opcoes.recompraPosterior.data, reembolsada: false }],
      coortes: [{ tag: { id: '44', nome: tagRecompraPosterior } }]
    }] : [])
  ]
  ;hotmartModel.find = () => query([{
    userId: 'u-periodo',
    email: 'periodo@example.com',
    sales
  }])
  ;timelineModel.find = () => query([{ userId: 'u-periodo', ciclos }])
  ;tagModel.find = () => query([{
    email: 'periodo@example.com',
    tags: [
      { tagId: '42', nome: tagReembolso },
      ...extraRefundTags,
      ...(opcoes.recompra ? [{ tagId: '43', nome: tagRecompra }] : []),
      ...(opcoes.recompraPosterior ? [{ tagId: '44', nome: tagRecompraPosterior }] : [])
    ]
  }])
  ;productModel.findOne = () => query(null)
  ;writeLogModel.create = async () => {
    if (opcoes.effects) opcoes.effects.logs += 1
  }
  activeCampaignService.removeTagStrict = (async () => {
    removals += 1
    if (opcoes.effects) opcoes.effects.removals += 1
    if (opcoes.removeError) throw opcoes.removeError
    return opcoes.removeResult ?? true
  }) as typeof activeCampaignService.removeTagStrict
  try {
    const run = () => handleRefunds({ dryRun: false })
    const executionHooks = opcoes.phaseHooks ?? (opcoes.ownershipError ? {
          assertOwnership: () => { throw opcoes.ownershipError },
          providerStarted: () => undefined,
          providerSucceeded: () => undefined,
          localMutationStarted: () => undefined,
        } : undefined)
    const report = executionHooks ? await runWithMainParityPhaseHooks(executionHooks, run) : await run()
    return { report, removals }
  } finally {
    ;hotmartModel.find = originals.sales
    ;timelineModel.find = originals.timelines
    ;tagModel.find = originals.tags
    ;productModel.findOne = originals.product
    ;writeLogModel.create = originals.log
    activeCampaignService.removeTagStrict = originals.remove
  }
}

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
    sales: hotmartModel.find,
    timelines: timelineModel.find,
    tags: tagModel.find,
    product: productModel.findOne,
    log: writeLogModel.create,
    remove: activeCampaignService.removeTagStrict
  }
  let removals = 0
  ;hotmartModel.find = () => query([{
    userId: 'u1',
    email: 'aluno@example.com',
    sales: [
      { transaction: 'R1', transactionStatus: 'REFUNDED', approvedDate: new Date('2026-05-25T00:00:00Z') },
      { transaction: 'N2', transactionStatus: 'COMPLETE', approvedDate: new Date('2026-06-25T00:00:00Z') }
    ]
  }])
  ;timelineModel.find = () => query([{
    userId: 'u1',
    ciclos: [
      {
        periodo: '2505',
        compras: [{ transacao: 'R1', data: new Date('2026-05-25T00:00:00Z'), reembolsada: true }],
        coortes: [{ tag: { id: '42', nome: 'Aluno OGI 2605 - Renovação' } }]
      },
      { periodo: '2606', compras: [{ transacao: 'N2', data: new Date('2026-06-25T00:00:00Z'), reembolsada: false }] }
    ]
  }])
  ;tagModel.find = () => query([{ email: 'aluno@example.com', tags: [{ tagId: '42', nome: 'Aluno OGI 2605 - Renovação' }] }])
  ;productModel.findOne = () => query(null)
  ;writeLogModel.create = async () => undefined
  activeCampaignService.removeTagStrict = (async () => { removals += 1; return true }) as typeof activeCampaignService.removeTagStrict
  try {
    const report = await handleRefunds({ dryRun: false })
    assert.equal(report.protegidosPorRecompra, 0)
    assert.equal(report.aRemover, 1)
    assert.equal(removals, 1)
  } finally {
    ;hotmartModel.find = originals.sales
    ;timelineModel.find = originals.timelines
    ;tagModel.find = originals.tags
    ;productModel.findOne = originals.product
    ;writeLogModel.create = originals.log
    activeCampaignService.removeTagStrict = originals.remove
  }
})

test('recompra no mesmo período e no mesmo dia protege a tag reembolsada', async () => {
  const { report, removals } = await executarCenarioReembolso({
    refundDate: new Date('2026-05-25T00:00:00Z'),
    periodoReembolso: '2507',
    recompra: { periodo: '2507', data: new Date('2026-05-25T00:00:00Z') }
  })
  assert.equal(report.protegidosPorRecompra, 1)
  assert.equal(report.aRemover, 0)
  assert.equal(removals, 0)
})

test('recompra no mesmo período sete dias depois protege a tag reembolsada', async () => {
  const { report, removals } = await executarCenarioReembolso({
    refundDate: new Date('2026-05-25T00:00:00Z'),
    periodoReembolso: '2507',
    recompra: { periodo: '2507', data: new Date('2026-06-01T00:00:00Z') }
  })
  assert.equal(report.protegidosPorRecompra, 1)
  assert.equal(report.aRemover, 0)
  assert.equal(removals, 0)
})

test('recompra noutro período não protege nem remove a tag nova', async () => {
  const { report, removals } = await executarCenarioReembolso({
    refundDate: new Date('2026-05-25T00:00:00Z'),
    periodoReembolso: '2507',
    recompra: { periodo: '2508', data: new Date('2026-06-01T00:00:00Z') }
  })
  assert.equal(report.protegidosPorRecompra, 0)
  assert.equal(report.aRemover, 1)
  assert.equal(removals, 1)
})

test('recompra no mesmo período deixa de proteger quando há compra posterior noutro período', async () => {
  const { report, removals } = await executarCenarioReembolso({
    refundDate: new Date('2026-05-25T00:00:00Z'),
    periodoReembolso: '2507',
    recompra: { periodo: '2507', data: new Date('2026-06-01T00:00:00Z') },
    recompraPosterior: { periodo: '2602', data: new Date('2026-06-08T00:00:00Z') }
  })
  assert.equal(report.protegidosPorRecompra, 0)
  assert.equal(report.aRemover, 1)
  assert.equal(removals, 1)
})

test('reembolso sem tag conta mas não tem remoção para fazer', () => {
  const r = deveTratarReembolso(candidate({ turmaTags: [] }))
  assert.equal(r.tratar, true)
  assert.equal(r.motivo, 'semTag')
})

test('dry-run por omissão não remove tag nem marca UserProduct', async () => {
  const originals = {
    sales: hotmartModel.find,
    timelines: timelineModel.find,
    tags: tagModel.find,
    product: productModel.findOne,
    update: productModel.updateOne,
    log: writeLogModel.create,
    remove: activeCampaignService.removeTagStrict
  }
  let removals = 0
  let updates = 0
  let logs = 0
  ;hotmartModel.find = () => query([{
    userId: 'u1',
    productId: 'p1',
    email: 'aluno@example.com',
    sales: [{ transaction: 'R1', transactionStatus: 'REFUNDED', approvedDate: new Date('2026-05-25T00:00:00Z') }]
  }])
  ;timelineModel.find = () => query([{
    userId: 'u1',
    ciclos: [{ compras: [{ transacao: 'R1', reembolsada: true }], coortes: [{ tag: { id: '42', nome: 'Aluno OGI 2605 - Renovação' } }] }]
  }])
  ;tagModel.find = () => query([{ email: 'aluno@example.com', tags: [{ tagId: '42', nome: 'Aluno OGI 2605 - Renovação' }] }])
  ;productModel.findOne = () => query({ _id: 'up1' })
  ;productModel.updateOne = async () => { updates += 1 }
  ;writeLogModel.create = async () => { logs += 1 }
  activeCampaignService.removeTagStrict = (async () => { removals += 1; return true }) as typeof activeCampaignService.removeTagStrict
  try {
    const report = await handleRefunds()
    assert.equal(report.dryRun, true)
    assert.equal(report.aRemover, 1)
    assert.equal(updates, 0)
    assert.equal(removals, 0)
    assert.equal(logs, 0)
  } finally {
    ;hotmartModel.find = originals.sales
    ;timelineModel.find = originals.timelines
    ;tagModel.find = originals.tags
    ;productModel.findOne = originals.product
    ;productModel.updateOne = originals.update
    ;writeLogModel.create = originals.log
    activeCampaignService.removeTagStrict = originals.remove
  }
})

test('perda de ownership bloqueia log local e remoção externa', async () => {
  const effects = { logs: 0, removals: 0 }
  await assert.rejects(() => executarCenarioReembolso({
    refundDate: new Date('2026-05-25T00:00:00Z'),
    periodoReembolso: '2507',
    ownershipError: new Error('LEASE_LOST'),
    effects,
  }), /LEASE_LOST/)
  assert.deepEqual(effects, { logs: 0, removals: 0 })
})

test('falha parcial externa rejeita execução e conserva relatório', async () => {
  const effects = { logs: 0, removals: 0 }
  await assert.rejects(() => executarCenarioReembolso({
    refundDate: new Date('2026-05-25T00:00:00Z'),
    periodoReembolso: '2507',
    removeError: new Error('AC_DOWN'),
    effects,
  }), (error: unknown) => {
    assert.ok(error instanceof RefundHandlerPartialFailure)
    assert.equal(error.report.erros.length, 1)
    assert.equal(error.report.erros[0].error, 'AC_DOWN')
    return true
  })
  assert.deepEqual(effects, { logs: 0, removals: 1 })
})

test('remoção externa não confirmada não conta como removida nem completa', async () => {
  await assert.rejects(() => executarCenarioReembolso({
    refundDate: new Date('2026-05-25T00:00:00Z'),
    periodoReembolso: '2507',
    removeResult: false,
  }), (error: unknown) => {
    assert.ok(error instanceof RefundHandlerPartialFailure)
    assert.equal(error.report.removidas, 0)
    assert.equal(error.report.erros[0].error, 'AC_TAG_REMOVE_NOT_CONFIRMED')
    return true
  })
})

test('cada remoção confirmada emparelha provider start e success', async () => {
  const phaseHooks: CompositeExecutionPhaseHooks = {
    assertOwnership: jest.fn(),
    providerStarted: jest.fn(),
    providerSucceeded: jest.fn(),
    localMutationStarted: jest.fn(),
  }
  const { report } = await executarCenarioReembolso({
    refundDate: new Date('2026-05-25T00:00:00Z'),
    periodoReembolso: '2507',
    extraRefundTags: 1,
    phaseHooks,
  })
  assert.equal(report.removidas, 2)
  assert.equal((phaseHooks.providerStarted as jest.Mock).mock.calls.length, 2)
  assert.equal((phaseHooks.providerSucceeded as jest.Mock).mock.calls.length, 2)
})

test('scan recusa mais vendas do que o limite antes de carregar contexto', async () => {
  const original = hotmartModel.find
  ;hotmartModel.find = () => query([{
    userId: 'u-cap', productId: 'p-cap', email: 'cap@example.com',
    sales: Array.from({ length: MAX_REFUND_SCAN_ITEMS + 1 }, () => ({
      transaction: 'R', transactionStatus: 'REFUNDED', approvedDate: new Date('2026-05-25T00:00:00Z'),
    })),
  }])
  try {
    await assert.rejects(() => handleRefunds(), /REFUND_HANDLER_SCAN_CAP_EXCEEDED/)
  } finally {
    ;hotmartModel.find = original
  }
})

test('preflight limita remoções multiplicadas antes da primeira escrita', async () => {
  const originals = {
    sales: hotmartModel.find,
    timelines: timelineModel.find,
    tags: tagModel.find,
    product: productModel.findOne,
  }
  const turmaTags = Array.from({ length: MAX_REFUND_SCAN_ITEMS + 1 }, (_, index) => ({
    tagId: String(index + 1), nome: `Turma ${index + 1}`, tipo: 'canonica', aplicadaEm: null,
  }))
  let productReads = 0
  hotmartModel.find = () => query([{
    userId: 'u-effects', productId: 'p-effects', email: 'effects@example.com',
    sales: [{ transaction: 'R', transactionStatus: 'REFUNDED', approvedDate: new Date('2026-05-25T00:00:00Z') }],
  }])
  timelineModel.find = () => query([{
    userId: 'u-effects',
    ciclos: [{
      periodo: '2507',
      compras: [{ transacao: 'R', data: new Date('2026-05-25T00:00:00Z'), reembolsada: true }],
      coortes: turmaTags.map((tag, index) => ({ periodo: '2507', ano: index + 1, tag: { id: tag.tagId, nome: tag.nome, aplicadaEm: null } })),
    }],
  }])
  tagModel.find = () => query([{ email: 'effects@example.com', tags: turmaTags }])
  productModel.findOne = () => { productReads += 1; return query(null) }
  try {
    await assert.rejects(() => handleRefunds({ dryRun: false }), /REFUND_HANDLER_EFFECT_CAP_EXCEEDED/)
    assert.equal(productReads, 0)
  } finally {
    hotmartModel.find = originals.sales
    timelineModel.find = originals.timelines
    tagModel.find = originals.tags
    productModel.findOne = originals.product
  }
})
