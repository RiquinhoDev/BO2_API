import mongoose from 'mongoose'
import HotmartSaleHistory from '../../models/HotmartSaleHistory'
import RenewalOffer, { IRenewalOffer } from '../../models/RenewalOffer'
import {
  GENERIC_RENEWAL_OFFER_CODE,
  TURMA_1_RENEWAL_OFFER_CODE,
  TURMA_2_RENEWAL_OFFER_CODE
} from './renewalConstants'

// Só 3 links são mesmo enviados: turma 1 e turma 2 têm preço fixo próprio
// (offer code nunca muda, só o nome da turma muda a cada ciclo de renovação);
// todas as outras turmas recebem sempre o link genérico. Regra fixa em
// código — não depende de estado editável no Backoffice (turmaNumbers
// atribuídos a ofertas antigas já não são usados para decidir isto).
const FIXED_TURMA_OFFER_CODES: Record<number, string> = {
  1: TURMA_1_RENEWAL_OFFER_CODE,
  2: TURMA_2_RENEWAL_OFFER_CODE
}

type HotmartSaleHistoryReadModel = { findOne: (...args: any[]) => any }
const HotmartSaleHistoryModel = HotmartSaleHistory as unknown as HotmartSaleHistoryReadModel

/**
 * Turma 1/2 deixam de se chamar "Turma 1 [...]" a partir do momento em
 * que renovam — o novo esquema agrupa toda a gente que renovou num
 * ciclo numa turma só ("Turma Renovação | AAMM"), independente da turma
 * de origem. Nessa altura o nome já não tem o número, então caímos para
 * o histórico de compras: se algum dia comprou pelo offer code fixo de
 * turma 1/2, continua a ser turma 1/2 para sempre — sobrevive à mudança
 * de nome porque o offer code (ao contrário do nome) nunca muda.
 */
async function resolveFixedTurmaOfferCode(
  turmaNumber: number | null | undefined,
  userId: mongoose.Types.ObjectId | string | null | undefined
): Promise<string | null> {
  if (turmaNumber && FIXED_TURMA_OFFER_CODES[turmaNumber]) {
    return FIXED_TURMA_OFFER_CODES[turmaNumber]
  }

  if (!userId) return null

  const history = await HotmartSaleHistoryModel.findOne({ userId })
    .select('sales.offerCode')
    .lean()
    .exec() as { sales?: Array<{ offerCode: string | null }> } | null

  const offerCodesUsed = new Set((history?.sales || []).map((s) => s.offerCode))
  if (offerCodesUsed.has(TURMA_1_RENEWAL_OFFER_CODE)) return TURMA_1_RENEWAL_OFFER_CODE
  if (offerCodesUsed.has(TURMA_2_RENEWAL_OFFER_CODE)) return TURMA_2_RENEWAL_OFFER_CODE
  return null
}

export async function findRenewalOffer(
  turmaNumber?: number | null,
  userId?: mongoose.Types.ObjectId | string | null
): Promise<IRenewalOffer | null> {
  const fixedCode = await resolveFixedTurmaOfferCode(turmaNumber, userId)

  if (fixedCode) {
    const fixed = await RenewalOffer.findOne({ offerCode: fixedCode, isActive: true }).exec()
    if (fixed) return fixed
    // oferta fixa não encontrada/inativa na BD — cai para o genérico em vez de nada
  }

  return RenewalOffer.findOne({
    offerCode: GENERIC_RENEWAL_OFFER_CODE,
    isActive: true
  }).exec()
}

export default findRenewalOffer
