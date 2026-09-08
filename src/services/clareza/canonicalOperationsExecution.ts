import { createHash } from 'node:crypto'
import type { Request, Response } from 'express'
import { HttpError } from '../../security/errorHandling'
import { requestIdFrom } from '../activeCampaign/activeCampaignExecution.service'
import { runClarezaRefreshWithReceipt } from './clarezaRefreshExecution.service'
import { assertClarezaRefreshEnabled, getCanonicalFmpApiKey } from './canonicalSettings'
import { withCanonicalExecution } from './core/canonicalExecutionContext'

export type CanonicalOperationExecutor = (
  req: Request, res: Response, operation: string, input: unknown, perform: () => Promise<unknown>,
) => Promise<Record<string, unknown>>

export const executeCanonicalOperation: CanonicalOperationExecutor = async (req, res, operation, input, perform) => {
  if (!req.user || req.user.role !== 'SUPER_ADMIN') {
    throw new HttpError({ status: 403, code: 'FORBIDDEN', publicMessage: 'Sem permissões suficientes' })
  }
  // All modes may collect FMP data and mutate the canonical store. Check before claiming a receipt.
  assertClarezaRefreshEnabled()
  getCanonicalFmpApiKey()
  const fingerprint = createHash('sha256').update(JSON.stringify({ actorId: req.user.id, operation, input })).digest('hex')
  return runClarezaRefreshWithReceipt({
    operation: 'market', identity: 'canonical-core', fingerprint,
    requestId: requestIdFrom(req.get('x-request-id') || res.locals.correlationId),
    refresh: hooks => withCanonicalExecution(hooks, async () => {
      const result = await perform()
      if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('Canonical operation result invalid')
      const record = result as Record<string, unknown>
      if (record.success === false || ['errors', 'failures', 'conflicts'].some(key => typeof record[key] === 'number' && record[key] > 0)) {
        throw new Error('Canonical operation incomplete; reconcile before retrying')
      }
      return record
    }),
  })
}
