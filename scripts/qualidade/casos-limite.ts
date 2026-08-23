import assert from 'node:assert/strict'
import { gerarTimeline, type EntradaGerador } from '../../src/services/renewal/renewalTimeline.generator'
import { agruparCiclos } from '../../src/services/renewal/renewalCycles'
import type { VendaEntrada } from '../../src/services/renewal/renewalTimeline.types'

const venda = (date: string, p: Partial<VendaEntrada> = {}): VendaEntrada => ({
  hotmartProductId: '1733154', productName: 'OGI', transaction: date,
  offerCode: 'ogi', transactionStatus: 'APPROVED', approvedDate: new Date(`${date}T00:00:00Z`), orderDate: null,
  priceValue: 397, currency: 'EUR', paymentMode: 'PAY_IN_FULL', ...p
})
const entrada = (vendas: VendaEntrada[], extra: Partial<EntradaGerador> = {}): EntradaGerador => ({
  vendas, tags: [], turmaAtual: null, movimentacoes: [], acExpiracao: null, acDataCompra: null,
  excepcoesTurmaTag: new Map(), fontes: { vendas: null, tags: null, ac: null }, ...extra
})

const casos: Array<[string, () => void]> = [
  ['31 de Janeiro arredonda ao fim do mês', () => assert.equal(gerarTimeline(entrada([venda('2025-01-31')])).ciclos[0].acessoAte.toISOString(), '2026-01-31T23:59:59.999Z')],
  ['29 de Fevereiro conserva o ano bissexto', () => assert.equal(gerarTimeline(entrada([venda('2024-02-29')])).ciclos[0].acessoAte.toISOString(), '2025-02-28T23:59:59.999Z')],
  ['duas compras no mesmo dia são um ciclo', () => assert.equal(agruparCiclos([venda('2025-05-01'), venda('2025-05-01', { transaction: 'EXT' })]).length, 1)],
  ['compra mais extensão a sete dias é ciclo de dois anos', () => assert.equal(agruparCiclos([venda('2025-05-01'), venda('2025-05-08', { hotmartProductId: '3100292', priceValue: 97 })])[0].anos, 2)],
  ['prestações em cinco meses são um ciclo', () => assert.equal(agruparCiclos([1, 2, 3, 4, 5].map((m) => venda(`2025-0${m}-01`, { paymentMode: 'MULTIPLE_PAYMENTS' }))).length, 1)],
  ['ano 2 tem coorte do mês + 12', () => assert.deepEqual(gerarTimeline(entrada([venda('2025-05-01'), venda('2025-05-02', { hotmartProductId: '3100292', priceValue: 97 })])).ciclos[0].coortes.map((c) => c.periodo), ['2505', '2605'])],
  ['turma genérica calcula expiração', () => assert.equal(gerarTimeline(entrada([venda('2025-05-01')], { turmaAtual: { classId: 'g', className: 'Turma Renovação Genérica | 2505', entrouEm: null }, acExpiracao: new Date('2026-05-31T23:59:59.999Z') })).cadeia.expiracaoIgualTurma, 'ok')],
  ['oferta sem nome com turma usa a turma', () => assert.equal(gerarTimeline(entrada([venda('2025-05-01')], { turmaAtual: { classId: 'b', className: 'Turma 18 | 2505', entrouEm: null }, acExpiracao: new Date('2026-05-31T23:59:59.999Z') })).cadeia.expiracaoIgualTurma, 'ok')],
  ['sem turma e sem oferta não inventa expiração', () => assert.equal(gerarTimeline(entrada([venda('2025-05-01')])).cadeia.expiracaoIgualTurma, 'sem-dados')],
  ['reembolso a meio não cria ciclo', () => assert.equal(agruparCiclos([venda('2025-05-01'), venda('2025-06-01', { transactionStatus: 'REFUNDED' })]).length, 1)]
]

for (const [nome, caso] of casos) caso()
console.log(JSON.stringify({ casos: casos.length, passaram: casos.length, falharam: 0, nomes: casos.map(([nome]) => nome) }, null, 2))
