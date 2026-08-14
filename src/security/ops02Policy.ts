import ops02Inventory from '../contracts/ops02-policy-inventory.json'
import { getBulkOperationLimit } from './bulkOperationPolicy'
import routeCatalog from './route-catalog.json'

export type Ops02Scope = 'internal' | 'provider' | 'mixed'
export type Ops02Authorization = 'internal-write' | 'super-admin'
export type Ops02ReviewStatus = 'reviewed' | 'needs-hardening'
export type Ops02ProtectionStatus = 'verified' | 'required' | 'not-applicable'

export interface Ops02ProtectionDisposition {
  status: Ops02ProtectionStatus
  reason: string
  limit?: number
}

export interface Ops02Decision {
  method: string
  path: string
  scope: Ops02Scope
  provider?: string
  authorization: Ops02Authorization
  destructive: boolean
  bulk: boolean
  cap: Ops02ProtectionDisposition
  idempotency: Ops02ProtectionDisposition
  killSwitch: Ops02ProtectionDisposition
  dryRun: Ops02ProtectionDisposition
  reversibility: Ops02ProtectionDisposition
  status: Ops02ReviewStatus
  evidence: string
}

interface CatalogWriteRoute {
  method: string
  path: string
  destructive: boolean
}

type CompactPolicy = 'I' | 'S' | 'SB' | 'M' | 'MB' | 'P' | 'PB' | 'PG'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Invalid OPS-02 ${field}`)
  }
  return value
}

function routeKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${path}`
}

const catalogWrites: readonly CatalogWriteRoute[] = routeCatalog
  .filter((route) => route.access === 'authenticated' && (route.writes || route.destructive))
  .map((route) => ({
    method: route.method.toUpperCase(),
    path: route.path,
    destructive: route.destructive,
  }))

const catalogByKey = new Map(catalogWrites.map((route) => [
  routeKey(route.method, route.path),
  route,
]))

function protection(
  status: Ops02ProtectionStatus,
  reason: string,
  limit?: number,
): Ops02ProtectionDisposition {
  return limit === undefined ? { status, reason } : { status, reason, limit }
}

function parseCompactPolicy(value: string): { code: CompactPolicy; provider?: string } {
  const [codeValue, providerValue] = value.split(':', 2)
  if (codeValue !== 'I'
    && codeValue !== 'S'
    && codeValue !== 'SB'
    && codeValue !== 'M'
    && codeValue !== 'MB'
    && codeValue !== 'P'
    && codeValue !== 'PB'
    && codeValue !== 'PG') {
    throw new Error(`Invalid OPS-02 compact policy: ${value}`)
  }

  if ((codeValue === 'M'
      || codeValue === 'MB'
      || codeValue === 'P'
      || codeValue === 'PB'
      || codeValue === 'PG')
    && (!providerValue || providerValue.trim().length === 0)) {
    throw new Error(`OPS-02 provider policy requires provider: ${value}`)
  }

  return providerValue ? { code: codeValue, provider: providerValue } : { code: codeValue }
}

function expandCompactDecision(value: unknown): Ops02Decision {
  if (!isRecord(value)) throw new Error('Invalid OPS-02 inventory row')

  const method = requiredString(value.method, 'method').toUpperCase()
  const path = requiredString(value.path, 'path')
  const compact = parseCompactPolicy(requiredString(value.policy, 'policy'))
  const catalogRoute = catalogByKey.get(routeKey(method, path))
  if (!catalogRoute) throw new Error(`Unknown OPS-02 inventory route: ${method} ${path}`)

  const configuredBulkLimit = getBulkOperationLimit(method, path)
  const compactBulk = compact.code === 'SB' || compact.code === 'MB' || compact.code === 'PB'
  const bulk = compactBulk || configuredBulkLimit !== undefined
  const scope: Ops02Scope = compact.code === 'M' || compact.code === 'MB'
    ? 'mixed'
    : compact.code === 'P' || compact.code === 'PB' || compact.code === 'PG'
      ? 'provider'
      : 'internal'
  const authorization: Ops02Authorization = compact.code === 'I'
    ? 'internal-write'
    : 'super-admin'

  const cap = configuredBulkLimit !== undefined
    ? protection('verified', 'central-bulk-operation-guard', configuredBulkLimit)
    : bulk
      ? protection('required', 'finite-cap-unverified')
      : protection('not-applicable', 'not-caller-bulk')

  let idempotency = protection('not-applicable', 'internal-write')
  let killSwitch = protection('not-applicable', 'no-provider-mutation')
  let dryRun = protection('not-applicable', 'no-provider-mutation')

  if (scope === 'mixed') {
    idempotency = protection('required', 'local-reconciliation-replay-unverified')
    killSwitch = protection('not-applicable', 'provider-read-only')
    dryRun = protection('not-applicable', 'provider-read-only')
  } else if (scope === 'provider') {
    idempotency = protection('required', 'external-replay-unverified')
    killSwitch = compact.code === 'PG'
      ? protection('verified', 'AC_TAG_APPLY_ENABLED')
      : protection('required', 'provider-kill-switch-unverified')
    dryRun = protection('required', 'dry-run-disposition-unverified')
  }

  const reversibility = catalogRoute.destructive
    ? protection('not-applicable', 'super-admin-destructive')
    : protection('not-applicable', 'not-destructive')

  const hasGap = [cap, idempotency, killSwitch, dryRun, reversibility]
    .some((item) => item.status === 'required')

  return {
    method,
    path,
    scope,
    ...(compact.provider ? { provider: compact.provider } : {}),
    authorization,
    destructive: catalogRoute.destructive,
    bulk,
    cap,
    idempotency,
    killSwitch,
    dryRun,
    reversibility,
    status: hasGap ? 'needs-hardening' : 'reviewed',
    evidence: configuredBulkLimit === undefined
      ? 'route-catalog+approved-family-policy'
      : 'route-catalog+approved-family-policy+central-bulk-operation-guard',
  }
}

const parsedInventory: readonly Ops02Decision[] = ops02Inventory.map((entry) => (
  expandCompactDecision(entry)
))
const decisionByKey = new Map(parsedInventory.map((decision) => [
  routeKey(decision.method, decision.path),
  decision,
]))

function expectedCatalogKeys(): readonly string[] {
  return catalogWrites.map((route) => routeKey(route.method, route.path))
}

export function validateOps02Policy(decisions: readonly Ops02Decision[]): void {
  const expected = new Set(expectedCatalogKeys())
  const seen = new Set<string>()

  for (const decision of decisions) {
    const key = routeKey(decision.method, decision.path)
    if (seen.has(key)) throw new Error(`Duplicate OPS-02 decision: ${key}`)
    seen.add(key)

    if (!expected.has(key)) throw new Error(`Unknown OPS-02 decision: ${key}`)

    if ((decision.scope === 'provider' || decision.scope === 'mixed') && !decision.provider) {
      throw new Error(`Provider OPS-02 decision requires provider: ${key}`)
    }
    if ((decision.scope === 'provider' || decision.scope === 'mixed')
      && decision.authorization !== 'super-admin') {
      throw new Error(`Provider OPS-02 decision must require super-admin: ${key}`)
    }
    if (decision.bulk
      && decision.cap.status === 'verified'
      && decision.cap.limit === undefined) {
      throw new Error(`Bulk OPS-02 verified cap requires finite limit: ${key}`)
    }
    if (decision.destructive
      && decision.authorization !== 'super-admin'
      && decision.reversibility.status !== 'verified') {
      throw new Error(`Destructive OPS-02 decision requires super-admin or verified reversibility: ${key}`)
    }
  }

  const missing = [...expected].filter((key) => !seen.has(key))
  if (missing.length > 0) {
    throw new Error(`Missing OPS-02 decision: ${missing[0]}`)
  }
}

export function getOps02Decision(method: string, path: string): Ops02Decision | null {
  return decisionByKey.get(routeKey(method, path)) ?? null
}

export function getOps02Policy(): readonly Ops02Decision[] {
  return parsedInventory
}

export function isHighImpactDecision(decision: Ops02Decision): boolean {
  return decision.authorization === 'super-admin'
}

export function getOps02HardeningGaps(): readonly Ops02Decision[] {
  return parsedInventory.filter((decision) => decision.status === 'needs-hardening')
}
