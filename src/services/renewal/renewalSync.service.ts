import Product from '../../models/product/Product'
import { getRuntimeConfig } from '../../config/runtimeConfig'
import { HttpError } from '../../security/errorHandling'
import { assertProviderReadBatchSize } from '../../security/providerReadBatchPolicy'
import { getHotmartAccessToken } from '../syncUtilizadoresServices/hotmartServices/hotmart.helpers'
import { fetchHotmartOffers } from './renewalSync.provider'
import {
  buildCheckoutLink,
  buildPlan,
  enrichOffers,
  loadExistingOffers,
  resolveOgiProductObjectId,
} from './renewalSync.planning'
import type { RenewalSyncOptions, RenewalSyncReport } from './renewalSync.types'

async function resolveOgiHotmartProductId(): Promise<string> {
  const configured = getRuntimeConfig().renewal.hotmartOgiProductId
  if (configured) return configured
  const product = await Product.findOne({
    platform: 'hotmart',
    isActive: true,
    $or: [{ code: /^OGI/i }, { courseCode: /^OGI/i }, { name: /Grande Investimento/i }],
  }).select('hotmartProductId').lean().exec()
  if (!product?.hotmartProductId) {
    throw new HttpError({
      status: 503,
      code: 'RENEWAL_OFFER_HOTMART_PRODUCT_UNAVAILABLE',
      publicMessage: 'Produto Hotmart das ofertas de renovação indisponível',
    })
  }
  return product.hotmartProductId
}

function validateMutationResult(result: unknown, operation: string): void {
  const record = typeof result === 'object' && result !== null ? result as Record<string, unknown> : null
  if (!record || record.acknowledged !== true || record.matchedCount !== 1 || record.modifiedCount !== 1) {
    throw new HttpError({
      status: 409,
      code: 'RENEWAL_OFFER_MUTATION_CONFLICT',
      publicMessage: `Oferta de renovação não foi ${operation}`,
    })
  }
}

export async function syncRenewalOffers(options: RenewalSyncOptions = {}): Promise<RenewalSyncReport> {
  options.phaseHooks?.assertOwnership?.()
  const accessToken = await getHotmartAccessToken()
  options.phaseHooks?.assertOwnership?.()
  const productId = await resolveOgiHotmartProductId()
  const productObjectId = await resolveOgiProductObjectId(options.phaseHooks)
      const seenOffers = await fetchHotmartOffers(accessToken, productId, options.phaseHooks)
      assertProviderReadBatchSize(seenOffers.length, 'hotmart-renewal-offers')
      const existingRows = await loadExistingOffers(options.phaseHooks)
      const enrichedOffers = await enrichOffers(seenOffers, productObjectId, options.phaseHooks)
  const { operations, unknownNames, plan } = buildPlan(enrichedOffers, existingRows, new Date())

  if (options.dryRun === true) {
    return {
      success: true,
      total: operations.length,
      inserted: plan.create,
      updated: plan.update + plan.reactivate,
      errors: 0,
      skipped: plan.unchanged,
      upserted: plan.create + plan.update + plan.reactivate,
      deactivated: plan.deactivate,
      unknownNames,
      dryRun: true,
      plan,
    }
  }

  let inserted = 0
  let updated = 0
  let deactivated = 0
  const RenewalOfferModel = (await import('../../models/RenewalOffer')).default
  for (const operation of operations) {
    options.phaseHooks?.assertOwnership?.()
    options.phaseHooks?.localMutationStarted()
    if (operation.kind === 'create') {
      const created = await RenewalOfferModel.create(operation.document)
      if (!created) {
        throw new HttpError({ status: 409, code: 'RENEWAL_OFFER_MUTATION_CONFLICT', publicMessage: 'Oferta de renovação não foi criada' })
      }
      inserted += 1
      continue
    }
    const result = await RenewalOfferModel.updateOne(operation.filter, operation.update)
    validateMutationResult(result, operation.kind === 'deactivate' ? 'desativada' : operation.kind === 'reactivate' ? 'reativada' : 'actualizada')
    if (operation.kind === 'deactivate') deactivated += 1
    else updated += 1
  }

  return {
    success: true,
    total: operations.length,
    inserted,
    updated,
    errors: 0,
    skipped: plan.unchanged,
    upserted: inserted + updated,
    deactivated,
    unknownNames,
  }
}

export type { RenewalSyncOptions, RenewalSyncReport }
export { buildCheckoutLink }
export default syncRenewalOffers
