import type { Request, Response } from 'express'
import { AsyncLocalStorage } from 'node:async_hooks'
import { requestIdFrom } from '../activeCampaign/activeCampaignExecution.service'
import { runWithActiveCampaignExecutionGuard } from '../activeCampaign/activeCampaignExecutionGuard'
import {
  compositeExecutionFingerprint,
  runCompositeExecutionWithReceipt,
} from '../cron/compositeExecution.service'
import { HttpError } from '../../security/errorHandling'
import type { CompositeExecutionPhaseHooks } from '../cron/compositeExecution.service'

const phaseContext = new AsyncLocalStorage<CompositeExecutionPhaseHooks>()

export function assertMainParityOwnership(): void {
  phaseContext.getStore()?.assertOwnership?.()
}

export function mainParityProviderStarted(): void {
  assertMainParityOwnership()
  phaseContext.getStore()?.providerStarted()
}

export function mainParityProviderSucceeded(): void {
  assertMainParityOwnership()
  phaseContext.getStore()?.providerSucceeded()
}

export function mainParityLocalMutationStarted(): void {
  assertMainParityOwnership()
  phaseContext.getStore()?.localMutationStarted()
}

export function runWithMainParityPhaseHooks<T>(
  hooks: CompositeExecutionPhaseHooks,
  run: () => Promise<T>,
): Promise<T> {
  return phaseContext.run(hooks, () => runWithActiveCampaignExecutionGuard({
    assertOwnership: assertMainParityOwnership,
  }, run))
}

function reportHasFailures(result: unknown): boolean {
  if (!result || typeof result !== 'object') return false
  const report = result as Record<string, unknown>
  if (report.success === false) return true
  if (Array.isArray(report.errors) && report.errors.length > 0) return true
  if (Array.isArray(report.erros) && report.erros.length > 0) return true
  if (typeof report.erros === 'number' && report.erros > 0) return true
  return Object.values(report).some((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false
    const nested = value as Record<string, unknown>
    return nested.success === false
      || (Array.isArray(nested.errors) && nested.errors.length > 0)
      || (Array.isArray(nested.erros) && nested.erros.length > 0)
      || (typeof nested.erros === 'number' && nested.erros > 0)
  })
}

export const MAIN_PARITY_EMAIL_BATCH_CAP = 200

export function normalizeMainParityEmails(value: unknown): string[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) {
    throw new HttpError({ status: 400, code: 'INVALID_EMAIL_BATCH', publicMessage: 'emails tem de ser uma lista' })
  }
  if (value.length === 0) {
    throw new HttpError({ status: 400, code: 'INVALID_EMAIL_BATCH', publicMessage: 'emails não pode ser uma lista vazia' })
  }
  if (value.length > MAIN_PARITY_EMAIL_BATCH_CAP) {
    throw new HttpError({ status: 400, code: 'EMAIL_BATCH_TOO_LARGE', publicMessage: `Máximo de ${MAIN_PARITY_EMAIL_BATCH_CAP} emails` })
  }
  const emails = value.map((email) => {
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      throw new HttpError({ status: 400, code: 'INVALID_EMAIL_BATCH', publicMessage: 'Cada email tem de ter formato válido' })
    }
    return email.trim().toLowerCase()
  })
  return [...new Set(emails)]
}

export type MainParityEffect = 'provider' | 'local' | 'provider-and-local'

export interface MainParityExecutionOptions<T> {
  job: string
  payload: unknown
  effect: MainParityEffect
  dryRun?: boolean
  req: Request
  res: Response
  run: () => Promise<T>
}

function actorId(req: Request): string {
  return req.user?.email ?? 'authenticated-backoffice'
}

export async function runMainParityExecution<T>(
  options: MainParityExecutionOptions<T>,
): Promise<T> {
  if (options.dryRun === true) return options.run()
  const actor = actorId(options.req)
  return runCompositeExecutionWithReceipt({
    operation: 'sync-pipeline',
    identity: `renewal-parity:${options.job}`,
    actorId: actor,
    fingerprint: compositeExecutionFingerprint(actor, options.payload),
    requestId: requestIdFrom(
      options.req.get('x-request-id') || options.res.locals.correlationId,
    ),
    run: async (hooks) => {
      hooks.assertOwnership?.()
      if (options.effect !== 'local') hooks.providerStarted()
      if (options.effect !== 'provider') hooks.localMutationStarted()
      const result = await runWithMainParityPhaseHooks(hooks, options.run)
      hooks.assertOwnership?.()
      if (reportHasFailures(result)) throw new Error('MAIN_PARITY_EXECUTION_REPORTED_FAILURES')
      if (options.effect !== 'local') hooks.providerSucceeded()
      return result
    },
  })
}
