import { type IGuruMonthlySnapshot } from '../../models/GuruMonthlySnapshot'

export type SnapshotPeriodParams = {
  year: string
  month: string
}

export type SnapshotStatus =
  | 'active'
  | 'pastdue'
  | 'canceled'
  | 'expired'
  | 'pending'
  | 'refunded'
  | 'suspended'

export type SnapshotSubscription = {
  email?: string
  status?: string
  subscriptionCode?: string
  productId?: string
  offerId?: string
  startedAt?: string | number | Date
  nextCycleAt?: string | number | Date
  canceledAt?: string | number | Date
  chargedEveryDays?: number
  value?: number
}

export type SnapshotBuildResult =
  | { skipped: true; reason: string }
  | { skipped: false; snapshot: IGuruMonthlySnapshot }

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
