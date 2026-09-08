import type { RequestHandler } from 'express'
import { isSyncMutableExecutionEnabled } from '../services/requestDrivenRuntimeConfig'

export const requireRenewalMutationEnabled: RequestHandler = (_req, res, next) => {
  if (isSyncMutableExecutionEnabled()) {
    next()
    return
  }
  res.status(403).json({
    success: false,
    error: {
      code: 'SYNC_MUTABLE_EXECUTION_DISABLED',
      message: 'Execução mutável de sincronizações está desativada',
    },
  })
}

export const requireRenewalPreviewOrMutation: RequestHandler = (req, res, next) => {
  if (req.body?.dryRun !== false) {
    next()
    return
  }
  requireRenewalMutationEnabled(req, res, next)
}
