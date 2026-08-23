// ════════════════════════════════════════════════════════════
// 📁 src/services/renewal/renewalCycles.ts
// Vendas da Hotmart → ciclos de acesso. Função pura: recebe
// vendas, devolve ciclos. Não lê BD nem chama APIs.
//
// Um "ciclo" é a compra (ou o conjunto de compras) que dá um
// período de acesso. Três situações obrigam a agrupar mais do
// que uma venda no mesmo ciclo:
//
//   1. mesmo dia        167€ (renovação) + 97€ (extensão) = 2 anos
//   2. mesma transação  a Hotmart repete a linha
//   3. prestações       5 x 99€ mensais da mesma oferta = 1 ciclo
//
// A regra 3 tem de distinguir uma prestação de uma renovação
// anual feita na mesma oferta ao mesmo preço. O intervalo mede-se
// desde a compra ANTERIOR do ciclo, não desde a âncora — medir
// desde a âncora fundia duas renovações anuais quando a segunda
// era feita cedo (a happyhome.carla renovou a 23/01/2024 e a
// 17/12/2024, 329 dias, e perdia um ano inteiro).
//
// O corte dos 90 dias vem dos dados: das 195 compras consecutivas
// com o mesmo produto, oferta e valor, 185 estão a 59 dias ou
// menos (prestações, incluindo as atrasadas da kukuruzickosa) e
// as restantes a 329 dias ou mais (renovações). Entre 60 e 328
// dias não há nenhuma.
//
// Há um SEGUNDO limite, esse sim contado da âncora: o ciclo
// inteiro não passa dos 335 dias. Sem ele, uma corrente de
// compras a menos de 90 dias umas das outras esticaria o mesmo
// ciclo sem fim, e um plano de prestações nunca dura mais de um
// ano. Os dois limites aplicam-se em conjunto.
// ════════════════════════════════════════════════════════════

import type { VendaEntrada, CompraCiclo, CicloBase } from './renewalTimeline.types'

/** Produto 3100292 chama-se "OGI - Renovação" mas é a EXTENSÃO de 97€. */
export const ID_PRODUTO_EXTENSAO = '3100292'

/** Só estes contam como compra. Reembolso e falha não dão acesso. */
const ESTADOS_VALIDOS = new Set(['APPROVED', 'COMPLETE'])

/** A Hotmart marca assim as cobranças de um plano de prestações. */
const MODO_PRESTACOES = 'MULTIPLE_PAYMENTS'

/** Máximo entre duas cobranças seguidas para ainda serem o mesmo ciclo. */
const DIAS_MAX_ENTRE_PRESTACOES = 90

/**
 * Tecto do ciclo inteiro, contado da âncora. Sem ele, uma corrente
 * de compras a menos de 90 dias umas das outras esticaria o mesmo
 * ciclo indefinidamente — e um plano de prestações nunca passa de
 * um ano.
 */
const DIAS_MAX_TOTAL_PRESTACOES = 335

const DIA_MS = 24 * 60 * 60 * 1000

/** Último instante do mês, em UTC. `mes` é 1..12. */
export function fimDoMes(ano: number, mes: number): Date {
  return new Date(Date.UTC(ano, mes, 0, 23, 59, 59, 999))
}

/** Data → "YYMM" em UTC. */
export function periodoDeData(d: Date): string {
  const yy = String(d.getUTCFullYear() % 100).padStart(2, '0')
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${yy}${mm}`
}

/**
 * "YYMM" → índice de mês comparável (ano * 12 + mês). Devolve null
 * quando a string não é um período válido, para o chamador poder
 * distinguir "não sei" de "mês zero".
 */
export function indiceDePeriodo(yymm: string | null | undefined): number | null {
  if (!yymm || !/^\d{4}$/.test(yymm)) return null
  const yy = Number(yymm.slice(0, 2))
  const mm = Number(yymm.slice(2, 4))
  if (mm < 1 || mm > 12) return null
  return (2000 + yy) * 12 + mm
}

type VendaComEstadoEData = Pick<VendaEntrada, 'transactionStatus' | 'approvedDate' | 'orderDate'>

function dataDaVenda(v: VendaComEstadoEData): Date | null {
  const d = v.approvedDate ?? v.orderDate
  if (!d) return null
  const data = d instanceof Date ? d : new Date(d)
  return Number.isNaN(data.getTime()) ? null : data
}

/** Critério canónico: só cobranças confirmadas com uma data aproveitável dão acesso. */
export function isValidSale(venda: VendaComEstadoEData): boolean {
  return ESTADOS_VALIDOS.has(String(venda.transactionStatus ?? '').toUpperCase())
    && dataDaVenda(venda) !== null
}

function mesmoDia(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  )
}

/**
 * Decide se `compra` pertence ao ciclo já aberto. `ancora` é a
 * primeira compra desse ciclo, `ultima` a mais recente lá dentro.
 */
function pertenceAoMesmoCiclo(
  compra: CompraCiclo,
  ancora: CompraCiclo,
  ultima: CompraCiclo,
  vendaAncora: VendaEntrada,
  vendaCompra: VendaEntrada
): boolean {
  if (compra.transacao && compra.transacao === ultima.transacao) return true
  if (mesmoDia(compra.data, ancora.data)) return true

  const mesmaOferta = !!vendaAncora.offerCode && vendaAncora.offerCode === vendaCompra.offerCode
  const mesmoProduto = compra.produtoId === ancora.produtoId
  const mesmoValor = compra.valor != null && compra.valor === ancora.valor

  // A própria Hotmart diz que é um plano de prestações. Isso vale mais do
  // que o intervalo ou o valor: uma cobrança que falha é retentada dias ou
  // meses depois, e às vezes com outro valor (taxas, câmbio). Medido a
  // 22/08: 4 alunos activos tinham o plano partido em dois ou três ciclos,
  // o cm.love.ar por 150 dias entre a prestação falhada e a recuperada.
  const planoDePrestacoes =
    mesmaOferta &&
    mesmoProduto &&
    String(vendaAncora.paymentMode) === MODO_PRESTACOES &&
    String(vendaCompra.paymentMode) === MODO_PRESTACOES
  // desde a compra anterior, não desde a âncora — ver o cabeçalho
  const dias = (compra.data.getTime() - ultima.data.getTime()) / DIA_MS
  const total = (compra.data.getTime() - ancora.data.getTime()) / DIA_MS
  if (total >= DIAS_MAX_TOTAL_PRESTACOES) return false
  if (planoDePrestacoes) return true
  return mesmaOferta && mesmoProduto && mesmoValor && dias <= DIAS_MAX_ENTRE_PRESTACOES
}

/**
 * Agrupa as vendas válidas em ciclos, por ordem cronológica.
 * O acesso conta sempre da compra ÂNCORA (a primeira do ciclo) —
 * é ela que define o período e a data de fim.
 */
export function agruparCiclos(vendas: VendaEntrada[]): CicloBase[] {
  const validas = vendas
    .filter(isValidSale)
    .map((v) => ({ venda: v, data: dataDaVenda(v) }))
    .filter((x): x is { venda: VendaEntrada; data: Date } => x.data !== null)
    .sort((a, b) => a.data.getTime() - b.data.getTime())

  const grupos: Array<{ compras: CompraCiclo[]; vendas: VendaEntrada[] }> = []

  for (const { venda, data } of validas) {
    const compra: CompraCiclo = {
      data,
      offerCode: venda.offerCode,
      valor: venda.priceValue,
      moeda: venda.currency,
      produtoId: venda.hotmartProductId,
      transacao: venda.transaction,
      extensao: venda.hotmartProductId === ID_PRODUTO_EXTENSAO
    }

    const actual = grupos[grupos.length - 1]
    if (
      actual &&
      pertenceAoMesmoCiclo(
        compra,
        actual.compras[0],
        actual.compras[actual.compras.length - 1],
        actual.vendas[0],
        venda
      )
    ) {
      actual.compras.push(compra)
      actual.vendas.push(venda)
    } else {
      grupos.push({ compras: [compra], vendas: [venda] })
    }
  }

  return grupos.map(({ compras }) => {
    const ancora = compras[0]
    // 2 anos só quando a extensão acompanha uma compra de outro
    // produto — a extensão sozinha vale 1 ano como qualquer outra.
    const temExtensao = compras.some((c) => c.extensao)
    const temOutro = compras.some((c) => !c.extensao)
    const anos: 1 | 2 = temExtensao && temOutro ? 2 : 1

    return {
      periodo: periodoDeData(ancora.data),
      compras,
      anos,
      acessoAte: fimDoMes(ancora.data.getUTCFullYear() + anos, ancora.data.getUTCMonth() + 1)
    }
  })
}
