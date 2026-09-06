import RenewalAcChange from '../../../models/RenewalAcChange'
import { HttpError } from '../../../security/errorHandling'
import { maxChangesPerRun } from './planning'

export interface ExecutionCapacityQuery {
  status: { $in: string[] }
  planBatchId?: string
}

export async function preflightExecutionCapacity(
  query: ExecutionCapacityQuery,
  projectedPlanned = 0,
): Promise<void> {
  const cap = maxChangesPerRun()
  const candidates = await RenewalAcChange.find(query)
    .sort({ status: 1, plannedAt: 1, _id: 1 })
    .limit(cap + 1)
    .exec()
  if (candidates.length + Math.max(0, projectedPlanned) > cap) {
    throw new HttpError({
      status: 413,
      code: 'RENEWAL_AC_EXECUTION_CAP_EXCEEDED',
      publicMessage: 'Execução Renewal AC excede o limite por operação',
    })
  }
}
