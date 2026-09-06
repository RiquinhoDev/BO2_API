import RenewalAcChange from '../../../models/RenewalAcChange'
import {
  APPROVED_TTL_HOURS,
  expiryFieldId,
  isAutoExecuteEnabled,
  isMasterEnabled,
  isProcessRefundsEnabled,
  isWriteDatesEnabled,
  isWriteTagsEnabled,
  maxChangesPerRun,
  PLANNED_TTL_HOURS,
} from './planning'

export async function getRenewalAcStatus() {
  const byStatus = await RenewalAcChange.aggregate([
    { $group: { _id: '$status', n: { $sum: 1 } } },
  ])
  const counts: Record<string, number> = {}
  for (const row of byStatus) counts[row._id] = row.n

  const lastPlanned = await RenewalAcChange.findOne({})
    .sort({ plannedAt: -1 })
    .select('planBatchId plannedAt')
    .lean()
    .exec() as { planBatchId?: string; plannedAt?: Date } | null

  return {
    switches: {
      masterEnabled: isMasterEnabled(),
      writeDates: isWriteDatesEnabled(),
      writeTags: isWriteTagsEnabled(),
      processRefunds: isProcessRefundsEnabled(),
      autoExecute: isAutoExecuteEnabled(),
    },
    config: {
      expiryFieldId: expiryFieldId(),
      maxChangesPerRun: maxChangesPerRun(),
      plannedTtlHours: PLANNED_TTL_HOURS,
      approvedTtlHours: APPROVED_TTL_HOURS,
    },
    counts,
    lastPlanBatchId: lastPlanned?.planBatchId || null,
    lastPlannedAt: lastPlanned?.plannedAt || null,
  }
}
