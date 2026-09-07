import type { CronExecutionPhaseHooks } from '../cron/scheduler/executionPhases'

export const RENEWAL_OFFER_LIMIT = 20_000
export const RENEWAL_OFFER_PAGE_SIZE = 100
export const RENEWAL_OFFER_MAX_PAGES = 200
export const HOTMART_SALES_HISTORY_URL = 'https://developers.hotmart.com/payments/api/v1/sales/history'

export interface RenewalSyncOptions {
  dryRun?: boolean
  phaseHooks?: CronExecutionPhaseHooks
}

export interface RenewalOfferSyncPlan {
  operation: 'renewal-offer-sync'
  dryRun: true
  create: number
  update: number
  reactivate: number
  deactivate: number
  unchanged: number
  totalOperations: number
  limit: number
  remaining: number
  truncated: boolean
  anomaly: boolean
}

export interface RenewalSyncReport {
  success: boolean
  total: number
  inserted: number
  updated: number
  errors: number
  skipped: number
  upserted: number
  deactivated: number
  unknownNames: string[]
  dryRun?: true
  plan?: RenewalOfferSyncPlan
}

export interface HotmartOfferSnapshot {
  offerCode: string
  offerName: string
  paymentModes: Set<string>
  priceValue: number | null
  currency: string | null
  eurPriceCounts: Map<number, number>
  salesCount: number
  buyerEmails: Set<string>
}

export interface EnrichedHotmartOffer extends HotmartOfferSnapshot {
  suggestedTurmas: Array<{ turmaNumber: number; count: number }>
  suggestionConfidence: number
  suggestionSampleSize: number
}

export type RenewalOfferOperation =
  | { kind: 'create'; code: string; document: Record<string, unknown> }
  | { kind: 'update' | 'reactivate'; code: string; id: unknown; filter: Record<string, unknown>; update: Record<string, unknown> }
  | { kind: 'deactivate'; code: string; id: unknown; filter: Record<string, unknown>; update: Record<string, unknown> }
