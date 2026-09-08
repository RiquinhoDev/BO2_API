import { getRuntimeConfig } from './runtimeConfig'
import { parseRenewalParity, type RenewalParityConfig } from './renewalParityConfig'

const DEFAULTS = Object.freeze(parseRenewalParity({}))

export function getRenewalParitySettings(): RenewalParityConfig {
  const renewal = getRuntimeConfig().renewal
  return {
    acFirstPurchaseDateFieldId:
      renewal.acFirstPurchaseDateFieldId ?? DEFAULTS.acFirstPurchaseDateFieldId,
    acPurchaseStatusFieldId:
      renewal.acPurchaseStatusFieldId ?? DEFAULTS.acPurchaseStatusFieldId,
    acRefundDateFieldId: renewal.acRefundDateFieldId ?? DEFAULTS.acRefundDateFieldId,
    ogiProductFamilyIds: renewal.ogiProductFamilyIds ?? DEFAULTS.ogiProductFamilyIds,
    ogiNewStudentPriceThresholdEur:
      renewal.ogiNewStudentPriceThresholdEur ?? DEFAULTS.ogiNewStudentPriceThresholdEur,
    guruClarezaMonthlyProductId:
      renewal.guruClarezaMonthlyProductId ?? DEFAULTS.guruClarezaMonthlyProductId,
    guruClarezaAnnualProductId:
      renewal.guruClarezaAnnualProductId ?? DEFAULTS.guruClarezaAnnualProductId,
    fxRatesToEur: renewal.fxRatesToEur ?? DEFAULTS.fxRatesToEur,
    ...(renewal.acPurchaseDateFieldId === undefined
      ? {}
      : { acPurchaseDateFieldId: renewal.acPurchaseDateFieldId }),
  }
}

export const GURU_CLAREZA_PRODUCT_IDS = Object.freeze({
  CLAREZA_MENSAL: DEFAULTS.guruClarezaMonthlyProductId,
  CLAREZA_ANUAL: DEFAULTS.guruClarezaAnnualProductId,
})

export const AC_RENEWAL_FIELD_IDS = Object.freeze({
  purchaseDate: 334,
  firstPurchaseDate: DEFAULTS.acFirstPurchaseDateFieldId,
  expirationDate: 332,
  purchaseStatus: DEFAULTS.acPurchaseStatusFieldId,
  refundDate: DEFAULTS.acRefundDateFieldId,
})

export function readAcPurchaseDateFieldId(): string | undefined {
  const configured = getRenewalParitySettings().acPurchaseDateFieldId
  return configured === undefined ? undefined : String(configured)
}

export const HOTMART_OGI_PRODUCT_ID: string | undefined = undefined
export const HOTMART_OGI_PRODUCT_FAMILY_IDS: readonly string[] =
  Object.freeze([...DEFAULTS.ogiProductFamilyIds])
export const OGI_NEW_STUDENT_PRICE_THRESHOLD_EUR =
  DEFAULTS.ogiNewStudentPriceThresholdEur
export const FX_RATES_TO_EUR: Readonly<Record<string, number>> =
  Object.freeze({ ...DEFAULTS.fxRatesToEur })
