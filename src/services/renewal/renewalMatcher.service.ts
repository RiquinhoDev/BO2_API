import RenewalOffer, { IRenewalOffer } from '../../models/RenewalOffer'
import { GENERIC_RENEWAL_OFFER_CODE } from './renewalConstants'

export async function findRenewalOffer(
  turmaNumber?: number | null
): Promise<IRenewalOffer | null> {
  if (turmaNumber) {
    const special = await RenewalOffer.findOne({
      isActive: true,
      isRenewal: true,
      isManuallyEdited: true,
      turmaNumbers: turmaNumber,
      offerCode: { $ne: GENERIC_RENEWAL_OFFER_CODE }
    })
      .sort({ periodYYMM: -1 })
      .exec()

    if (special) return special
  }

  return RenewalOffer.findOne({
    offerCode: GENERIC_RENEWAL_OFFER_CODE,
    isActive: true
  }).exec()
}

export default findRenewalOffer
