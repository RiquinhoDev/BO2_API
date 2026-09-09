import type { RequestHandler } from 'express'
import { getRuntimeConfig } from '../config/runtimeConfig'

export function isReadOnlyMode(): boolean {
  try { return getRuntimeConfig().readOnlyMode === true } catch { return false }
}

// Includes MongoDB 8.2 read-role privileges; none grants insert/update/delete or DDL.
const readActions = new Set(['find', 'listCollections', 'listIndexes', 'listSearchIndexes', 'planCacheRead', 'performRawDataOperations', 'collStats', 'dbStats', 'dbHash', 'killCursors', 'changeStream'])
const mutationPath = /(?:^|\/)(?:sync|fix[^/]*|refresh|rebuild|execute|trigger|cleanup|delete|remove|reset|repair|import|seed|check-expired)(?:\/|$)/i

export function assertReadOnlyMongoPrivileges(status: unknown): void {
  const info = (status as { authInfo?: { authenticatedUsers?: unknown[]; authenticatedUserPrivileges?: { actions?: unknown[] }[] } } | null)?.authInfo
  const privileges = info?.authenticatedUserPrivileges
  if (!info?.authenticatedUsers?.length || !Array.isArray(privileges) || !privileges.length
    || privileges.some(privilege => !Array.isArray(privilege.actions) || !privilege.actions.length
      || privilege.actions.some(action => typeof action !== 'string' || !readActions.has(action)))) {
    throw new Error('READ_ONLY_MONGO_CREDENTIALS_REQUIRED')
  }
}

// Deliberately small allowlist. Add a provider only after auditing its read paths.
export function assertReadOnlyHttpRequest(method: string, target: string): void {
  let allowed = false
  try {
    const url = new URL(target)
    const path = decodeURIComponent(url.pathname)
    allowed = ['GET', 'HEAD'].includes(method.toUpperCase()) && url.protocol === 'https:'
      && !url.username && !url.password && (!url.port || url.port === '443')
      && !mutationPath.test(path)
      && ((url.hostname === 'digitalmanager.guru' && /^\/api\/v2\/(subscriptions|contacts)(\/|$)/.test(path))
        || (url.hostname.endsWith('.api-us1.com') && /^\/api\/3\//.test(path)))
  } catch { /* malformed destinations fail closed */ }
  if (!allowed) throw new Error('READ_ONLY_EGRESS_BLOCKED')
}

export const readOnlyRequestGuard: RequestHandler = (req, res, next) => {
  let path: string
  try { path = decodeURIComponent(req.path) } catch { path = '/sync' }
  const sessionRequest = req.method === 'POST' && /^\/api\/auth\/(login|logout)\/?$/.test(path)
  if ((!sessionRequest && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) || mutationPath.test(path)) {
    res.status(403).json({ success: false, code: 'READ_ONLY_MODE', message: 'Ambiente apenas de leitura. Operação bloqueada.' })
    return
  }
  next()
}
