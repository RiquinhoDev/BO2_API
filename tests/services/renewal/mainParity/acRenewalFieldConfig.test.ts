import { resolveAcRenewalFieldIds } from '../../../../src/services/renewal/acRenewalDataSync.service'

test('sync AC usa overrides tipados em cada execução', () => {
  expect(resolveAcRenewalFieldIds({
    acPurchaseDateFieldId: 901,
    acFirstPurchaseDateFieldId: 902,
    acPurchaseStatusFieldId: 903,
    acRefundDateFieldId: 904,
  }, 905)).toEqual({
    purchaseDate: 901,
    firstPurchaseDate: 902,
    expirationDate: 905,
    purchaseStatus: 903,
    refundDate: 904,
  })
})
