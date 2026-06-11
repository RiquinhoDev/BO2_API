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

  return RenewalOffer.findOne({
    isActive: true,
    isRenewal: true,
    turmaNumbers: turmaNumber,
    periodYYMM: { $gt: periodYYMM }
  })
    .sort({ periodYYMM: 1 })
    .exec()
}

export default findRenewalOffer
