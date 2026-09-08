import assert from 'node:assert/strict'
import HotmartSaleHistory from '../../src/models/HotmartSaleHistory'
import RenewalOffer from '../../src/models/RenewalOffer'
import { findRenewalOffer } from '../../src/services/renewal/renewalMatcher.service'
import {
  GENERIC_RENEWAL_OFFER_CODE,
  TURMA_1_RENEWAL_OFFER_CODE,
} from '../../src/services/renewal/renewalConstants'

const query = <T>(value: T) => ({
  select: () => ({ lean: () => ({ exec: async () => value }) }),
  exec: async () => value,
})

test('mantém oferta fixa da turma 1 depois do nome perder o número', async () => {
  const historyFindOne = (HotmartSaleHistory as any).findOne
  const offerFindOne = (RenewalOffer as any).findOne
  const fixed = { offerCode: TURMA_1_RENEWAL_OFFER_CODE, isActive: true }
  try {
    ;(HotmartSaleHistory as any).findOne = () => query({
      sales: [{ offerCode: TURMA_1_RENEWAL_OFFER_CODE }],
    })
    ;(RenewalOffer as any).findOne = (filter: { offerCode: string }) => query(
      filter.offerCode === TURMA_1_RENEWAL_OFFER_CODE ? fixed : { offerCode: GENERIC_RENEWAL_OFFER_CODE },
    )

    assert.equal(await findRenewalOffer(null, 'aluno-1'), fixed)
  } finally {
    ;(HotmartSaleHistory as any).findOne = historyFindOne
    ;(RenewalOffer as any).findOne = offerFindOne
  }
})

test('usa genérica quando a oferta fixa histórica está inativa ou ausente', async () => {
  const historyFindOne = (HotmartSaleHistory as any).findOne
  const offerFindOne = (RenewalOffer as any).findOne
  const generic = { offerCode: GENERIC_RENEWAL_OFFER_CODE, isActive: true }
  try {
    ;(HotmartSaleHistory as any).findOne = () => query({
      sales: [{ offerCode: TURMA_1_RENEWAL_OFFER_CODE }],
    })
    ;(RenewalOffer as any).findOne = (filter: { offerCode: string }) => query(
      filter.offerCode === GENERIC_RENEWAL_OFFER_CODE ? generic : null,
    )

    assert.equal(await findRenewalOffer(null, 'aluno-1'), generic)
  } finally {
    ;(HotmartSaleHistory as any).findOne = historyFindOne
    ;(RenewalOffer as any).findOne = offerFindOne
  }
})
