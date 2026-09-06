import mongoose from 'mongoose'
import { HttpError } from '../../../security/errorHandling'
import { DiscordRoleChange, type IDiscordRoleChange } from '../../../models/discordRenewal'
import { MAX_PROVIDER_READ_ITEMS } from '../../../security/providerReadBatchPolicy'
import { maxOpsPerRun, APPROVED_TTL_HOURS, PLANNED_TTL_HOURS } from './planning'

export interface PreparedRoleExecutionSnapshot {
  changes: IDiscordRoleChange[]
  groups: PreparedRoleExecutionGroup<IDiscordRoleChange>[]
  remaining: number
  overflow: boolean
  readOverflow: boolean
}

export interface PreparedRoleExecutionGroup<
  T extends Pick<IDiscordRoleChange, 'discordUserId' | 'payload'>,
> {
  discordUserId: string
  representative: T
  members: T[]
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
>(changes: T[]): PreparedRoleExecutionGroup<T>[] {
  const canonical = new Map<string, PreparedRoleExecutionGroup<T>>()
  for (const change of changes) {
    const account = String(change.discordUserId)
    const group = canonical.get(account)
    if (!group) {
      canonical.set(account, { discordUserId: account, representative: change, members: [change] })
      continue
    }
    if (rolePayloadFingerprint(group.representative.payload) !== rolePayloadFingerprint(change.payload)) {
      throw new HttpError({
        status: 409,
        code: 'DISCORD_ROLES_DUPLICATE_CONFLICT',
        publicMessage: 'Plano Discord contém operações duplicadas incompatíveis',
      })
    }
    group.members.push(change)
  }
  return [...canonical.values()]
}

export function assertPreparedRoleExecutionWithinCap(
  changes: Array<Pick<IDiscordRoleChange, 'discordUserId' | 'payload'>>
    | PreparedRoleExecutionGroup<Pick<IDiscordRoleChange, 'discordUserId' | 'payload'>>[],
  cap = maxOpsPerRun(),
): void {
  const groups = changes.length > 0 && 'members' in changes[0]
    ? changes as PreparedRoleExecutionGroup<Pick<IDiscordRoleChange, 'discordUserId' | 'payload'>>[]
    : canonicalizePreparedRoleChanges(changes as Array<Pick<IDiscordRoleChange, 'discordUserId' | 'payload'>>)
  if (groups.length > cap) throw executionCapExceeded()
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
    .limit(MAX_PROVIDER_READ_ITEMS + 1)
    .exec() as unknown as IDiscordRoleChange[]
  const readOverflow = raw.length > MAX_PROVIDER_READ_ITEMS
  const groups = canonicalizePreparedRoleChanges(raw.slice(0, MAX_PROVIDER_READ_ITEMS))
  const executableGroups = groups.slice(0, limit)
  return {
    changes: executableGroups.map((group) => group.representative),
    groups: executableGroups,
    overflow: groups.length > limit,
    readOverflow,
    remaining: Math.max(0, groups.length - executableGroups.length),
  }
}

export function assertRoleExecutionSnapshotWithinCap(snapshot: PreparedRoleExecutionSnapshot): void {
  if (snapshot.overflow) throw executionCapExceeded()
}

export function assertRoleExecutionSnapshotSourceComplete(snapshot: PreparedRoleExecutionSnapshot): void {
  if (snapshot.readOverflow) throw executionCapExceeded()
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
  assertRoleExecutionSnapshotSourceComplete(snapshot)
  assertRoleExecutionSnapshotWithinCap(snapshot)
  assertEffectiveRoleExecutionCapacity(snapshot.changes, projected)
  return snapshot
}
