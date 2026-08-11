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

export async function findRenewalOffer(
  turmaNumber?: number | null
): Promise<IRenewalOffer | null> {
  const fixedCode = turmaNumber ? FIXED_TURMA_OFFER_CODES[turmaNumber] : undefined

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
