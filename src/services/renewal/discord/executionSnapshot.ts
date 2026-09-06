import mongoose from 'mongoose'
import { HttpError } from '../../../security/errorHandling'
import { DiscordRoleChange, type IDiscordRoleChange } from '../../../models/discordRenewal'
import { maxOpsPerRun, APPROVED_TTL_HOURS, PLANNED_TTL_HOURS } from './planning'

export interface PreparedRoleExecutionSnapshot {
  changes: IDiscordRoleChange[]
  remaining: number
  overflow: boolean
}

export interface RoleExecutionSnapshotOptions {
  includePlanned?: boolean
  batchId?: string
  limit?: number
  now?: number
}

function executionCapExceeded(): HttpError {
  return new HttpError({
    status: 413,
    code: 'DISCORD_ROLES_EXECUTION_CAP_EXCEEDED',
    publicMessage: 'Execução Discord excede o limite por operação',
  })
}

function rolePayloadFingerprint(payload: IDiscordRoleChange['payload']): string {
  return JSON.stringify({
    addRoleId: payload.addRoleId,
    removeRoleIds: [...(payload.removeRoleIds || [])].sort(),
  })
}

export function canonicalizePreparedRoleChanges<
  T extends Pick<IDiscordRoleChange, 'discordUserId' | 'payload'>,
>(changes: T[]): T[] {
  const canonical = new Map<string, T>()
  for (const change of changes) {
    const account = String(change.discordUserId)
    const existing = canonical.get(account)
    if (!existing) {
      canonical.set(account, change)
      continue
    }
    if (rolePayloadFingerprint(existing.payload) !== rolePayloadFingerprint(change.payload)) {
      throw new HttpError({
        status: 409,
        code: 'DISCORD_ROLES_DUPLICATE_CONFLICT',
        publicMessage: 'Plano Discord contém operações duplicadas incompatíveis',
      })
    }
  }
  return [...canonical.values()]
}

export function assertPreparedRoleExecutionWithinCap(
  changes: Array<Pick<IDiscordRoleChange, 'discordUserId' | 'payload'>>,
  cap = maxOpsPerRun(),
): void {
  if (changes.length > cap) throw executionCapExceeded()
}

function effectiveLimit(requested: number | undefined): number {
  if (Number.isFinite(requested) && Number(requested) > 0) {
    return Math.min(Math.floor(Number(requested)), maxOpsPerRun())
  }
  return maxOpsPerRun()
}

export async function prepareDiscordRoleExecutionSnapshot(
  options: RoleExecutionSnapshotOptions = {},
): Promise<PreparedRoleExecutionSnapshot> {
  const statuses: Array<IDiscordRoleChange['status']> = options.includePlanned === true
    ? ['APPROVED', 'PLANNED']
    : ['APPROVED']
  const now = options.now ?? Date.now()
  const cutoff = {
    $or: [
      { status: 'APPROVED', plannedAt: { $gte: new Date(now - APPROVED_TTL_HOURS * 3600e3) } },
      { status: 'PLANNED', plannedAt: { $gte: new Date(now - PLANNED_TTL_HOURS * 3600e3) } },
    ],
  }
  const query: mongoose.FilterQuery<IDiscordRoleChange> = {
    status: { $in: statuses },
    ...cutoff,
  }
  if (options.batchId) query.planBatchId = options.batchId
  const limit = effectiveLimit(options.limit)
  const raw = await DiscordRoleChange.find(query)
    .sort({ status: 1, plannedAt: 1, _id: 1 })
    .limit(limit + 1)
    .exec() as unknown as IDiscordRoleChange[]
  const changes = raw.slice(0, limit)
  return {
    changes,
    overflow: raw.length > limit,
    remaining: Math.max(0, raw.length - changes.length),
  }
}

export function assertRoleExecutionSnapshotWithinCap(snapshot: PreparedRoleExecutionSnapshot): void {
  if (snapshot.overflow) throw executionCapExceeded()
}

export function assertEffectiveRoleExecutionCapacity(
  existing: Array<Pick<IDiscordRoleChange, 'sourceRef'>>,
  projected: Array<{ sourceRef: string }>,
  cap = maxOpsPerRun(),
  existingOverflow = false,
): void {
  if (existingOverflow) throw executionCapExceeded()
  const effective = new Set(existing.map((change) => String(change.sourceRef)))
  for (const change of projected) effective.add(String(change.sourceRef))
  if (effective.size > cap) throw executionCapExceeded()
}

export async function preflightRoleExecutionCapacity(
  projected: Array<{ sourceRef: string }> = [],
  options: RoleExecutionSnapshotOptions = {},
): Promise<PreparedRoleExecutionSnapshot> {
  const snapshot = await prepareDiscordRoleExecutionSnapshot(options)
  assertRoleExecutionSnapshotWithinCap(snapshot)
  assertEffectiveRoleExecutionCapacity(snapshot.changes, projected)
  return snapshot
}
