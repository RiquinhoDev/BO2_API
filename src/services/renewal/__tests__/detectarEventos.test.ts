import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectarEventos, type VendaComparavel } from '../detectarEventos'

const venda = (p: Partial<VendaComparavel> = {}): VendaComparavel => ({
  transaction: 'HP1',
  transactionStatus: 'APPROVED',
  approvedDate: new Date('2026-09-01T00:00:00Z'),
  hotmartProductId: '1733154',
  ...p
})

// ── O caso normal ───────────────────────────────────────────────────

test('espelho vazio e uma venda nova dá uma compra', () => {
  const eventos = detectarEventos([], [venda()])
  assert.equal(eventos.length, 1)
  assert.equal(eventos[0].tipo, 'compra')
  assert.equal(eventos[0].transacao, 'HP1')
  assert.deepEqual(eventos[0].data, new Date('2026-09-01T00:00:00Z'))
})

test('a mesma venda outra vez não dá evento nenhum', () => {
  const anteriores = [venda()]
  assert.deepEqual(detectarEventos(anteriores, [venda()]), [])
})

test('só a transacção nova dá evento, as antigas ficam quietas', () => {
  const anteriores = [venda({ transaction: 'HP1' }), venda({ transaction: 'HP2' })]
  const actuais = [...anteriores, venda({ transaction: 'HP3' })]
  const eventos = detectarEventos(anteriores, actuais)
  assert.equal(eventos.length, 1)
  assert.equal(eventos[0].transacao, 'HP3')
})

// ── Reembolsos ──────────────────────────────────────────────────────

test('uma venda que passa a REFUNDED dá um reembolso', () => {
  const eventos = detectarEventos(
    [venda({ transactionStatus: 'APPROVED' })],
    [venda({ transactionStatus: 'REFUNDED' })]
  )
  assert.equal(eventos.length, 1)
  assert.equal(eventos[0].tipo, 'reembolso')
})

test('CHARGEBACK conta como reembolso', () => {
  const eventos = detectarEventos(
    [venda({ transactionStatus: 'COMPLETE' })],
    [venda({ transactionStatus: 'CHARGEBACK' })]
  )
  assert.equal(eventos[0].tipo, 'reembolso')
})

test('já reembolsada e continua reembolsada não dá evento', () => {
  assert.deepEqual(
    detectarEventos([venda({ transactionStatus: 'REFUNDED' })], [venda({ transactionStatus: 'REFUNDED' })]),
    []
  )
})

test('uma venda que nasce reembolsada é só reembolso, nunca compra', () => {
  // Emitir os dois mandava o escritor dar-lhe um ano antes de o tirar.
  const eventos = detectarEventos([], [venda({ transactionStatus: 'REFUNDED' })])
  assert.equal(eventos.length, 1)
  assert.equal(eventos[0].tipo, 'reembolso')
})

// ── O que não pode acontecer ────────────────────────────────────────

test('vendas sem código de transacção são ignoradas', () => {
  // Sem identidade não há forma de saber se são novas, e emitir um evento
  // por leitura punha o nocturno a tratar o mesmo aluno todas as noites.
  assert.deepEqual(detectarEventos([], [venda({ transaction: null })]), [])
  assert.deepEqual(detectarEventos([], [venda({ transaction: '  ' })]), [])
})

test('a linha repetida da mesma cobrança conta uma vez', () => {
  const eventos = detectarEventos([], [venda(), venda()])
  assert.equal(eventos.length, 1)
})

test('uma venda que desaparece da Hotmart não dá evento', () => {
  // O espelho é substituído por inteiro; a ausência não é um acontecimento
  // e nunca pode mandar tirar uma tag.
  assert.deepEqual(detectarEventos([venda()], []), [])
})

test('o histórico inteiro sem novidade não dá evento', () => {
  const historico = ['HP1', 'HP2', 'HP3', 'HP4'].map((t) => venda({ transaction: t }))
  assert.deepEqual(detectarEventos(historico, historico), [])
})

test('a data do evento é a da venda, não a da detecção', () => {
  const eventos = detectarEventos([], [venda({
    approvedDate: null,
    orderDate: new Date('2024-03-04T10:00:00Z')
  })])
  assert.deepEqual(eventos[0].data, new Date('2024-03-04T10:00:00Z'))
})

test('a compra e o reembolso na mesma leitura saem os dois', () => {
  const anteriores = [venda({ transaction: 'HP1', transactionStatus: 'APPROVED' })]
  const actuais = [
    venda({ transaction: 'HP1', transactionStatus: 'REFUNDED' }),
    venda({ transaction: 'HP2', transactionStatus: 'APPROVED' })
  ]
  const eventos = detectarEventos(anteriores, actuais)
  assert.deepEqual(
    eventos.map((e) => [e.tipo, e.transacao]),
    [['reembolso', 'HP1'], ['compra', 'HP2']]
  )
})
