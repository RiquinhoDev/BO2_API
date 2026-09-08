import { TURMA_1_RENEWAL_OFFER_CODE, TURMA_2_RENEWAL_OFFER_CODE } from './renewalConstants'
import { agruparCiclos } from './renewalCycles'
import { parseOfferName, parseTurmaName, tipoDeTurma } from './turmaParser'
import type { CicloBase, VendaEntrada } from './renewalTimeline.types'

const CODIGOS_RENOVACAO_ESPECIAIS = new Set([TURMA_1_RENEWAL_OFFER_CODE, TURMA_2_RENEWAL_OFFER_CODE])
export interface OfertaDaAncora {
  offerCode: string
  offerName: string | null
  periodYYMM: string | null
  isRenewal: boolean
}

export function sameDay(a: Date, b: Date): boolean {
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10)
}

export function formatDateYYYYMMDD(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function chaveIdempotente(partes: unknown[]): string {
  return JSON.stringify(partes)
}

/**
 * Último instante UTC do mesmo mês, `anos` depois da compra.
 */
export function computeExpirationFromPurchaseDate(purchaseDate: Date, anos = 1): Date {
  return new Date(Date.UTC(purchaseDate.getUTCFullYear() + anos, purchaseDate.getUTCMonth() + 1, 0, 23, 59, 59, 999))
}

/** Compra âncora do ciclo de acesso mais recente; vendas inválidas não contam. */
export function dataBaseDoAluno(sales: VendaEntrada[]): Date | null {
  const ultimoCiclo = agruparCiclos(sales).filter((c) => c.compras.some((compra) => !compra.reembolsada)).at(-1)
  return ultimoCiclo?.compras[0]?.data ?? null
}

/** Turma actual: a entrada activa mais recente da Hotmart. */
export function nomeDaTurmaActual(user: {
  hotmart?: { enrolledClasses?: Array<{ className?: string; isActive?: boolean }> }
} | undefined): string | null {
  const turmas = user?.hotmart?.enrolledClasses ?? []
  const activas = turmas.filter((turma) => turma.className?.trim() && turma.isActive !== false)
  const escolhida = activas.at(-1) ?? turmas.filter((turma) => turma.className?.trim()).at(-1)
  const nome = escolhida?.className?.trim() ?? ''
  return nome && parseTurmaName(nome).hasExpiry ? nome : null
}

/** Decide a fórmula pela turma actual; sem turma datável, usa a oferta. */
export function calcularExpiracao(
  ciclo: CicloBase,
  oferta: OfertaDaAncora | undefined,
  nomeTurmaActual: string | null
): Date | null {
  const ancora = ciclo.compras[0]
  if (CODIGOS_RENOVACAO_ESPECIAIS.has(ancora.offerCode ?? '')) {
    return computeExpirationFromPurchaseDate(ancora.data, ciclo.anos)
  }

  if (nomeTurmaActual) {
    if (tipoDeTurma(nomeTurmaActual) === 'renovacao') {
      return computeExpirationFromPurchaseDate(ancora.data, ciclo.anos)
    }
    return parseTurmaName(nomeTurmaActual).accessEndOgi
  }

  const nome = typeof oferta?.offerName === 'string' ? oferta.offerName.trim() : ''
  const renovacao =
    oferta?.isRenewal === true ||
    (nome !== '' && tipoDeTurma(nome) === 'renovacao')

  if (renovacao) return computeExpirationFromPurchaseDate(ancora.data, ciclo.anos)
  if (!nome) return null

  const nomeComPeriodo = oferta?.periodYYMM ? `${nome} | ${oferta.periodYYMM}` : nome
  const ofertaParsed = parseOfferName(nomeComPeriodo)
  if (!ofertaParsed.valid) return null

  // parseTurmaName preserva o marcador histórico [2 anos] das ofertas base.
  return parseTurmaName(nomeComPeriodo).accessEndOgi
}

/** Uma escrita só é segura se nunca reduzir a expiração já guardada na AC. */
export function encurtaria(calculado: Date, acTem: Date | null): boolean {
  return acTem !== null && calculado.getTime() < acTem.getTime()
}

/** Chave da venda congelada no primeiro avistamento do ciclo. */
export function identidadeDaVenda(ciclo: CicloBase): string {
  const ancora = ciclo.compras[0]
  const transaction = ancora.transacao?.trim()
  if (transaction) return `transaction:${transaction}`
  const offerCode = ancora.offerCode?.trim()
  if (offerCode) return `offer:${offerCode}`
  const productId = ancora.produtoId?.trim()
  if (productId) return `product:${productId}`
  return `anchor:${ancora.data.toISOString()}`
}

export function identidadeDoEvento(ciclo: CicloBase, saleIdentity = identidadeDaVenda(ciclo)): string {
  const ancora = ciclo.compras[0]
  return JSON.stringify([ancora.data.toISOString(), ciclo.anos, saleIdentity])
}

export function identidadeDaVendaPersistida(eventIdentity: string | null | undefined): string | null {
  if (!eventIdentity) return null
  try {
    const partes = JSON.parse(eventIdentity)
    return Array.isArray(partes) && typeof partes[2] === 'string' ? partes[2] : null
  } catch {
    return null
  }
}
