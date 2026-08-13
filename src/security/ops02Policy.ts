import ops02Inventory from '../contracts/ops02-policy-inventory.json'
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Invalid OPS-02 ${field}`)
  }
  return value
}

function requiredBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`Invalid OPS-02 ${field}`)
  return value
}

function parseScope(value: unknown): Ops02Scope {
  if (value === 'internal' || value === 'provider' || value === 'mixed') return value
  throw new Error('Invalid OPS-02 scope')
}

function parseAuthorization(value: unknown): Ops02Authorization {
  if (value === 'internal-write' || value === 'super-admin') return value
  throw new Error('Invalid OPS-02 authorization')
}

function parseReviewStatus(value: unknown): Ops02ReviewStatus {
  if (value === 'reviewed' || value === 'needs-hardening') return value
  throw new Error('Invalid OPS-02 review status')
}

function parseProtectionStatus(value: unknown): Ops02ProtectionStatus {
  if (value === 'verified' || value === 'required' || value === 'not-applicable') return value
  throw new Error('Invalid OPS-02 protection status')
}

function parseProtection(value: unknown, field: string): Ops02ProtectionDisposition {
  if (!isRecord(value)) throw new Error(`Invalid OPS-02 ${field}`)
  const status = parseProtectionStatus(value.status)
  const reason = requiredString(value.reason, `${field}.reason`)
  const limit = value.limit
  if (limit === undefined) return { status, reason }
  if (typeof limit !== 'number' || !Number.isFinite(limit) || limit <= 0) {
    throw new Error(`Invalid OPS-02 ${field}.limit`)
  }
  return { status, reason, limit }
}

function parseDecision(value: unknown): Ops02Decision {
  if (!isRecord(value)) throw new Error('Invalid OPS-02 decision')
  const scope = parseScope(value.scope)
  const provider = value.provider === undefined
    ? undefined
    : requiredString(value.provider, 'provider')

  return {
    method: requiredString(value.method, 'method').toUpperCase(),
    path: requiredString(value.path, 'path'),
    scope,
    ...(provider ? { provider } : {}),
    authorization: parseAuthorization(value.authorization),
    destructive: requiredBoolean(value.destructive, 'destructive'),
    bulk: requiredBoolean(value.bulk, 'bulk'),
    cap: parseProtection(value.cap, 'cap'),
    idempotency: parseProtection(value.idempotency, 'idempotency'),
    killSwitch: parseProtection(value.killSwitch, 'killSwitch'),
    dryRun: parseProtection(value.dryRun, 'dryRun'),
    reversibility: parseProtection(value.reversibility, 'reversibility'),
    status: parseReviewStatus(value.status),
    evidence: requiredString(value.evidence, 'evidence'),
  }
}

function routeKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${path}`
}

const parsedInventory: readonly Ops02Decision[] = ops02Inventory.map((entry) => parseDecision(entry))
const decisionByKey = new Map(parsedInventory.map((decision) => [
  routeKey(decision.method, decision.path),
  decision,
]))

function expectedCatalogKeys(): readonly string[] {
  return routeCatalog
    .filter((route) => route.access === 'authenticated' && (route.writes || route.destructive))
    .map((route) => routeKey(route.method, route.path))
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
