import CompositeExecutionReceipt, { type ICompositeExecutionReceipt } from '../../models/CompositeExecutionReceipt'

type StatusReceipt = Pick<ICompositeExecutionReceipt, 'status' | 'startedAt' | 'finishedAt' | 'leaseExpiresAt' | 'requestId' | 'result'>

/** Read-only process-independent progress; never expose receipt ownership credentials. */
export async function getMainParityExecutionStatus(job: string, now = new Date()) {
  const receipt = await CompositeExecutionReceipt.findOne({
    operation: 'sync-pipeline', identity: `renewal-parity:${job}`,
  }).sort({ startedAt: -1, _id: -1 })
    .select('status startedAt finishedAt leaseExpiresAt requestId result')
    .maxTimeMS(5000).lean<StatusReceipt>().exec()
  const expired = receipt?.status === 'running'
    && (!receipt.leaseExpiresAt || new Date(receipt.leaseExpiresAt).getTime() <= now.getTime())
  return {
    status: expired ? 'lease-expired' as const : receipt?.status ?? 'idle' as const,
    inProgress: receipt?.status === 'running' && !expired,
    startedAt: receipt?.startedAt ?? null,
    finishedAt: receipt?.finishedAt ?? null,
    requestId: receipt?.requestId ?? null,
    lastReport: receipt?.status === 'completed' ? receipt.result ?? null : null,
  }
}
