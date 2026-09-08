import type { CronDispatchOptions } from './jobDispatcher'
import { correrAcTagWatch } from '../../renewal/acTagWatch.service'
import { runWithMainParityPhaseHooks } from '../../renewal/mainParityExecution'
import { isSyncMutableExecutionEnabled } from '../../requestDrivenRuntimeConfig'
import { HttpError } from '../../../security/errorHandling'

export async function dispatchAcTagWatch(options: CronDispatchOptions = {}) {
  const dryRun = options.dryRun === true
  if (!dryRun && (!isSyncMutableExecutionEnabled() || !options.phaseHooks)) {
    throw new HttpError({ status: 503, code: 'AC_TAG_WATCH_EXECUTION_DISABLED', publicMessage: 'Vigilância AC requer execução mutável e recibo ativo' })
  }
  const run = async () => {
    const report = await correrAcTagWatch({ dryRun, actualizarEspelho: !dryRun })
    if (!dryRun && report.errors.length) throw new Error('AC tag watch incomplete; reconcile before retry')
    return report
  }
  return options.phaseHooks ? runWithMainParityPhaseHooks(options.phaseHooks, run) : run()
}
