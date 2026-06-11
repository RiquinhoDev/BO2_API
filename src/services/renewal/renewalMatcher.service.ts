import RenewalOffer, { IRenewalOffer } from '../../models/RenewalOffer'

interface FindRenewalOfferInput {
  turmaNumber?: number | null
  // período da EXPIRAÇÃO do aluno (accessEndYYMM) — a oferta de renovação deve
  // começar a partir daí. Em turmas de 2 anos isto é início + 24 meses, não + 12.
  expiryYYMM?: string | null
}

export async function findRenewalOffer({
  turmaNumber,
  expiryYYMM
}: FindRenewalOfferInput): Promise<IRenewalOffer | null> {
  if (!turmaNumber || !expiryYYMM) return null

  // SEGURANÇA: só ofertas confirmadas por humano no Backoffice chegam ao aluno.
  // A turma sugerida (dos compradores) é só um palpite — nunca é servida sozinha.
  // Enquanto ninguém confirmar, o aluno cai no fallback (email de contacto).
  return RenewalOffer.findOne({
    isActive: true,
    isRenewal: true,
    isManuallyEdited: true,
    turmaNumbers: turmaNumber,
    periodYYMM: { $gte: expiryYYMM }
  })
    .sort({ periodYYMM: 1 })
    .exec()
}

export default findRenewalOffer
