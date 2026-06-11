import RenewalOffer, { IRenewalOffer } from '../../models/RenewalOffer'

interface FindRenewalOfferInput {
  turmaNumber?: number | null
  periodYYMM?: string | null
}

export async function findRenewalOffer({
  turmaNumber,
  periodYYMM
}: FindRenewalOfferInput): Promise<IRenewalOffer | null> {
  if (!turmaNumber || !periodYYMM) return null

  // SEGURANÇA: só ofertas confirmadas por humano no Backoffice chegam ao aluno.
  // A turma sugerida (dos compradores) é só um palpite — nunca é servida sozinha.
  // Enquanto ninguém confirmar, o aluno cai no fallback (email de contacto).
  return RenewalOffer.findOne({
    isActive: true,
    isRenewal: true,
    isManuallyEdited: true,
    turmaNumbers: turmaNumber,
    periodYYMM: { $gt: periodYYMM }
  })
    .sort({ periodYYMM: 1 })
    .exec()
}

export default findRenewalOffer
