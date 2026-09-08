import { parseBoundedInteger, readOptionalString } from './configPrimitives'

export interface RenewalParityConfig {
  readonly acPurchaseDateFieldId?: number
  readonly acFirstPurchaseDateFieldId: number
  readonly acPurchaseStatusFieldId: number
  readonly acRefundDateFieldId: number
  readonly ogiProductFamilyIds: readonly string[]
  readonly ogiNewStudentPriceThresholdEur: number
  readonly guruClarezaMonthlyProductId: string
  readonly guruClarezaAnnualProductId: string
  readonly fxRatesToEur: Readonly<Record<string, number>>
}

function positiveNumber(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  if (env[key] === undefined) return fallback
  const value = Number(env[key])
  if (!Number.isFinite(value) || value <= 0) throw new Error(`CONFIG_INVALIDA: ${key} deve ser positivo`)
  return value
}

export function parseRenewalParity(env: NodeJS.ProcessEnv): RenewalParityConfig {
  const field = (key: string, fallback: number) => parseBoundedInteger(env[key], key, {
    min: 1, max: 1_000_000, defaultValue: fallback,
  })
  const family = env.HOTMART_OGI_PRODUCT_FAMILY_IDS === undefined
    ? ['1733154', '3100292', '4346330']
    : env.HOTMART_OGI_PRODUCT_FAMILY_IDS.split(',').map((id) => id.trim())
  if (family.length > 100 || family.some((id) => !/^\d+$/.test(id))) {
    throw new Error('CONFIG_INVALIDA: HOTMART_OGI_PRODUCT_FAMILY_IDS exige entre 1 e 100 ids numericos')
  }
  return {
    ...(env.AC_PURCHASE_DATE_FIELD_ID === undefined ? {} : { acPurchaseDateFieldId: field('AC_PURCHASE_DATE_FIELD_ID', 334) }),
    acFirstPurchaseDateFieldId: field('AC_FIRST_PURCHASE_DATE_FIELD_ID', 337),
    acPurchaseStatusFieldId: field('AC_PURCHASE_STATUS_FIELD_ID', 282),
    acRefundDateFieldId: field('AC_REFUND_DATE_FIELD_ID', 324),
    ogiProductFamilyIds: [...new Set(family)],
    ogiNewStudentPriceThresholdEur: positiveNumber(env, 'OGI_NEW_STUDENT_PRICE_THRESHOLD_EUR', 167),
    guruClarezaMonthlyProductId: readOptionalString(env, 'GURU_CLAREZA_MENSAL_PRODUCT_ID') ?? '',
    guruClarezaAnnualProductId: readOptionalString(env, 'GURU_CLAREZA_ANUAL_PRODUCT_ID') ?? '',
    fxRatesToEur: Object.fromEntries(Object.entries({ USD: 0.92, GBP: 1.17, CHF: 1.05, CAD: 0.68, BRL: 0.16 })
      .map(([currency, fallback]) => [currency, positiveNumber(env, `FX_RATE_${currency}_EUR`, fallback)])),
  }
}
