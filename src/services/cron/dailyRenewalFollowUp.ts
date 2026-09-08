import { randomUUID } from 'node:crypto'
import CronJobConfig from '../../models/SyncModels/CronJobConfig'
import { isSyncMutableExecutionEnabled } from '../requestDrivenRuntimeConfig'
import { runCompositeExecutionWithReceipt, type CompositeExecutionPhaseHooks } from './compositeExecution.service'
import { runWithMainParityPhaseHooks } from '../renewal/mainParityExecution'

/** Chained work has no independent schedule and starts only after a successful daily run. */
export async function runDailyRenewalFollowUp(parentSucceeded: boolean, parentHooks?: CompositeExecutionPhaseHooks) {
  if (!parentSucceeded || !isSyncMutableExecutionEnabled()) return null
  const job = await CronJobConfig.findOne({ name: 'RenewalPipeline' })
    .select('isActive schedule.enabled').maxTimeMS(5000).lean().exec()
  if (!job?.isActive || !job.schedule?.enabled) return null
  if (!parentHooks?.assertOwnership) throw new Error('Renewal follow-up requires parent execution ownership')
  parentHooks.assertOwnership()
  return runCompositeExecutionWithReceipt({
    operation: 'sync-pipeline', identity: 'renewal-parity:renewal-pipeline',
    actorId: 'daily-pipeline', fingerprint: 'daily-pipeline:renewal-follow-up',
    requestId: `daily-renewal:${randomUUID()}`,
    run: async hooks => {
      const assertOwnership = () => { parentHooks.assertOwnership?.(); hooks.assertOwnership?.() }
      const guarded: CompositeExecutionPhaseHooks = {
        assertOwnership,
        providerStarted: () => { assertOwnership(); parentHooks.providerStarted(); hooks.providerStarted() },
        providerSucceeded: () => { assertOwnership(); parentHooks.providerSucceeded(); hooks.providerSucceeded() },
        localMutationStarted: () => { assertOwnership(); parentHooks.localMutationStarted(); hooks.localMutationStarted() },
      }
      const { runRenewalPipeline } = await import('../renewal/renewalPipeline.service')
      const report = await runWithMainParityPhaseHooks(guarded, runRenewalPipeline)
      assertOwnership()
      if (!report.success) throw new Error('Renewal follow-up failed; inspect durable execution before retry')
      return report
    },
  })
}
