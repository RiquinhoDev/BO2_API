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
// anual feita na mesma oferta ao mesmo preço. O corte está nos
// 335 dias (11 meses): prestações mensais cabem lá dentro, uma
// renovação a 12 meses não.
// ════════════════════════════════════════════════════════════

import type { VendaEntrada, CompraCiclo, CicloBase } from './renewalTimeline.types'

/** Produto 3100292 chama-se "OGI - Renovação" mas é a EXTENSÃO de 97€. */
export const ID_PRODUTO_EXTENSAO = '3100292'

/** Só estes contam como compra. Reembolso e falha não dão acesso. */
const ESTADOS_VALIDOS = new Set(['APPROVED', 'COMPLETE'])

/** Máximo entre a âncora e uma prestação para ainda ser o mesmo ciclo. */
const DIAS_MAX_PRESTACAO = 335

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

function dataDaVenda(v: VendaEntrada): Date | null {
  const d = v.approvedDate ?? v.orderDate
  if (!d) return null
  const data = d instanceof Date ? d : new Date(d)
  return Number.isNaN(data.getTime()) ? null : data
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

  // prestação: mesma oferta, mesmo produto, mesmo valor, dentro da janela
  const mesmaOferta = !!vendaAncora.offerCode && vendaAncora.offerCode === vendaCompra.offerCode
  const mesmoProduto = compra.produtoId === ancora.produtoId
  const mesmoValor = compra.valor != null && compra.valor === ancora.valor
  const dias = (compra.data.getTime() - ancora.data.getTime()) / DIA_MS
  return mesmaOferta && mesmoProduto && mesmoValor && dias < DIAS_MAX_PRESTACAO
}

/**
 * Agrupa as vendas válidas em ciclos, por ordem cronológica.
 * O acesso conta sempre da compra ÂNCORA (a primeira do ciclo) —
 * é ela que define o período e a data de fim.
 */
export function agruparCiclos(vendas: VendaEntrada[]): CicloBase[] {
  const validas = vendas
    .filter((v) => ESTADOS_VALIDOS.has(String(v.transactionStatus ?? '').toUpperCase()))
    .map((v) => ({ venda: v, data: dataDaVenda(v) }))
    .filter((x): x is { venda: VendaEntrada; data: Date } => x.data !== null)
    .sort((a, b) => a.data.getTime() - b.data.getTime())

  const grupos: Array<{ compras: CompraCiclo[]; vendas: VendaEntrada[] }> = []

  for (const { venda, data } of validas) {
    const compra: CompraCiclo = {
      data,
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
