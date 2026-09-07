import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  comprasValidas,
  ramoDaTurma,
  reguaDaChefia,
  reguaNossa,
  turmaDaChefia,
  type VendaBruta
} from '../reguaDaChefia'

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`)
const s = (x: Date | null) => (x ? x.toISOString().slice(0, 10) : null)

const venda = (over: Partial<VendaBruta> = {}): VendaBruta => ({
  produtoId: 1733154,
  produto: 'O Grande Investimento',
  transacao: 'HP0000000001',
  estado: 'APPROVED',
  recorrencia: 1,
  prestacoes: 1,
  modo: 'PAY_IN_FULL',
  oferta: 'abc',
  valor: 397,
  aprovada: d('2025-01-01').getTime(),
  encomenda: null,
  ...over
})

// ── Os dois exemplos que a chefia escreveu ──────────────────────────

test('exemplo 1 da chefia — comprar com acesso em curso ACRESCENTA o ano', () => {
  // 23/10/2025 -> acesso ate 23/10/2026
  // compra de novo em 16/07/2026, ainda com acesso -> passa a 23/10/2027
  const r = reguaDaChefia([d('2025-10-23'), d('2026-07-16')])
  assert.equal(s(r!.exacto), '2027-10-23')
  assert.equal(s(r!.fim), '2027-10-31')
})

test('exemplo 2 da chefia — acesso terminado, o novo ano comeca na compra', () => {
  // 10/01/2023 -> termina 10/01/2024
  // nova compra so em 15/06/2025, ja sem acesso -> termina 15/06/2026
  const r = reguaDaChefia([d('2023-01-10'), d('2025-06-15')])
  assert.equal(s(r!.exacto), '2026-06-15')
  assert.equal(s(r!.fim), '2026-06-30')
})

// ── Regra 6: o arredondamento e SO no fim ───────────────────────────

test('o fim do mes aplica-se uma vez, no fim, e nao a cada compra', () => {
  // Arredondar a cada passo daria 31/01 -> +12m = 31/01/2027; a regra da
  // chefia guarda o dia 15 ate ao fim e so entao arredonda.
  const r = reguaDaChefia([d('2025-01-15'), d('2025-06-01')])
  assert.equal(s(r!.exacto), '2027-01-15')
  assert.equal(s(r!.fim), '2027-01-31')
})

test('Fevereiro arredonda para o dia 28 ou 29, conforme o ano', () => {
  assert.equal(s(reguaDaChefia([d('2026-02-10')])!.fim), '2027-02-28')
  assert.equal(s(reguaDaChefia([d('2027-02-10')])!.fim), '2028-02-29')
})

// ── Regra 4, o caso real que a folha traz ───────────────────────────

test('andreiaefalcao — tres compras acumulam para 30/09/2026', () => {
  const r = reguaDaChefia([d('2023-09-28'), d('2024-07-15'), d('2025-07-14')])
  assert.equal(s(r!.fim), '2026-09-30')
})

test('juditedesousa — duas compras no MESMO dia dao dois anos', () => {
  const r = reguaDaChefia([d('2025-02-24'), d('2025-02-24')])
  assert.equal(s(r!.fim), '2027-02-28')
})

test('alvessonia — tres compras no mesmo dia dao tres anos', () => {
  const r = reguaDaChefia([d('2025-05-19'), d('2025-05-19'), d('2025-05-19')])
  assert.equal(s(r!.fim), '2028-05-31')
})

test('sem compras nenhumas nao ha data', () => {
  assert.equal(reguaDaChefia([]), null)
})

// ── Regra 2: a "Quantidade de cobranca" ─────────────────────────────

test('so a cobranca 1 conta — um plano de 5 prestacoes vale UM ano', () => {
  const plano = [1, 2, 3, 4, 5].map((n) =>
    venda({ recorrencia: n, modo: 'MULTIPLE_PAYMENTS', prestacoes: 5, aprovada: d(`2025-0${n}-10`).getTime() })
  )
  const { datas, descartadas } = comprasValidas(plano)
  assert.equal(datas.length, 1)
  assert.equal(descartadas.recorrencia, 4)
  assert.equal(s(reguaDaChefia(datas)!.fim), '2026-01-31')
})

test('recurrency_number ausente conta como 1 — nao se descarta por omissao', () => {
  const { datas } = comprasValidas([venda({ recorrencia: null })])
  assert.equal(datas.length, 1)
})

test('duas transaccoes distintas no mesmo dia contam as duas', () => {
  // O caso da azevedo.vera: HP...C1 e HP...C2 sao dois produtos da mesma
  // encomenda, cada um com recurrency_number 1. Nao sao prestacoes.
  const { datas } = comprasValidas([
    venda({ transacao: 'HP3603139491C1', aprovada: d('2025-03-02').getTime() }),
    venda({ transacao: 'HP3603139491C2', aprovada: d('2025-03-02').getTime() })
  ])
  assert.equal(datas.length, 2)
  assert.equal(s(reguaDaChefia(datas)!.fim), '2027-03-31')
})

// ── Regra 1: "compras" quer dizer compras de OGI ────────────────────

test('so a familia OGI conta — os outros produtos nao dao acesso', () => {
  const { datas, descartadas } = comprasValidas([
    venda({ produtoId: 1733154, aprovada: d('2025-03-01').getTime() }),
    venda({ produtoId: 3100292, aprovada: d('2025-03-01').getTime() }),
    venda({ produtoId: 4346330, aprovada: d('2025-03-01').getTime() }),
    venda({ produtoId: 3124044, produto: 'Organiza as tuas Finanças' }),
    venda({ produtoId: 1391780, produto: 'Como começar a investir' }),
    venda({ produtoId: 2143943, produto: 'Transformando a Poupança' })
  ])
  assert.equal(datas.length, 3)
  assert.equal(descartadas.foraDaFamilia, 3)
  // tres compras OGI no mesmo dia -> tres anos
  assert.equal(s(reguaDaChefia(datas)!.fim), '2028-03-31')
})

test('o 3100292 e a extensao de 97 euros e vale 12 meses como as outras', () => {
  // Chama-se "OGI - Renovação" mas e a extensao. A chefia conta-a como
  // compra inteira, e e o que reproduz os 2 anos da compra dupla.
  const { datas } = comprasValidas([
    venda({ produtoId: 1733154, valor: 397, aprovada: d('2025-05-19').getTime() }),
    venda({ produtoId: 3100292, valor: 97, aprovada: d('2025-05-19').getTime() })
  ])
  assert.equal(datas.length, 2)
  assert.equal(s(reguaDaChefia(datas)!.fim), '2027-05-31')
})

test('venda sem produtoId nao e descartada por omissao', () => {
  const { datas, descartadas } = comprasValidas([venda({ produtoId: null })])
  assert.equal(datas.length, 1)
  assert.equal(descartadas.foraDaFamilia, 0)
})

test('reembolsos e chargebacks nao contam', () => {
  const { datas, descartadas } = comprasValidas([
    venda({ estado: 'REFUNDED' }),
    venda({ estado: 'CHARGEBACK' }),
    venda({ estado: 'APPROVED', aprovada: d('2025-03-01').getTime() })
  ])
  assert.equal(datas.length, 1)
  assert.equal(descartadas.estado, 2)
})

test('as compras sao ordenadas antes de acumular, venham como vierem', () => {
  const baralhado = [d('2025-07-14'), d('2023-09-28'), d('2024-07-15')]
  assert.equal(s(reguaDaChefia([...baralhado].sort((a, b) => a.getTime() - b.getTime()))!.fim), '2026-09-30')
  const { datas } = comprasValidas([
    venda({ aprovada: d('2025-07-14').getTime() }),
    venda({ aprovada: d('2023-09-28').getTime() }),
    venda({ aprovada: d('2024-07-15').getTime() })
  ])
  assert.equal(s(reguaDaChefia(datas)!.fim), '2026-09-30')
})

// ── A turma sai da data ─────────────────────────────────────────────

test('a turma da chefia e o YYMM de doze meses antes do fim', () => {
  assert.equal(turmaDaChefia(d('2026-09-30')), '2509')
  assert.equal(turmaDaChefia(d('2028-07-31')), '2707')
  assert.equal(turmaDaChefia(d('2027-02-28')), '2602')
})

// ── A nossa regua, e onde diverge ───────────────────────────────────

test('numa turma de RENOVACAO as duas reguas concordam com uma compra so', () => {
  const datas = [d('2025-07-14')]
  assert.equal(s(reguaNossa('Turma Renovação | 2507', datas)), '2026-07-31')
  assert.equal(s(reguaDaChefia(datas)!.fim), '2026-07-31')
})

test('numa turma de renovacao com compras acumuladas ja NAO concordam', () => {
  const datas = [d('2023-09-28'), d('2024-07-15'), d('2025-07-14')]
  assert.equal(s(reguaNossa('Turma Renovação | 2507', datas)), '2026-07-31')
  assert.equal(s(reguaDaChefia(datas)!.fim), '2026-09-30')
})

test('numa turma BASE a nossa regua ignora a compra e usa o nome da turma', () => {
  // E o cuidado que o Joao pediu: a data da compra e a da turma podem ser
  // bem dispares, e a nossa regua so olha para a segunda.
  const datas = [d('2026-02-28')]
  assert.equal(s(reguaNossa('Turma 20 | 2703', datas)), '2028-03-31')
  assert.equal(s(reguaDaChefia(datas)!.fim), '2027-02-28')
})

test('o sufixo [2 anos] duplica na nossa regua', () => {
  assert.equal(s(reguaNossa('Turma 11 [renov] + REITs | 2509 [2anos]', [d('2025-09-01')])), '2027-09-30')
})

test('o ramo da turma reconhece genericas e nomes ilegiveis', () => {
  assert.equal(ramoDaTurma('Turma 18 | 2605'), 'base')
  assert.equal(ramoDaTurma('Turma Renovação | 2607'), 'renovação')
  assert.equal(ramoDaTurma('Turma Renovação Genérica'), 'genérica')
  assert.equal(ramoDaTurma('Turma y4b33JxAeR'), 'ilegível')
  assert.equal(ramoDaTurma(null), 'sem turma')
})
