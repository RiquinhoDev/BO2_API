import logger from '../../../utils/logger'
import mongoose from 'mongoose'
import { HttpError } from '../../../security/errorHandling'
import {
  DiscordRoleChange,
  DiscordRoleState,
  type IDiscordRoleChange,
} from '../../../models/discordRenewal'
import User from '../../../models/user'
import { parseTurmaName } from '../turmaParser'
import { MAX_PROVIDER_READ_ITEMS } from '../../../security/providerReadBatchPolicy'
import type { CronExecutionPhaseHooks } from '../../cron/scheduler/executionPhases'
import {
  ALL_RENEWAL_ROLE_IDS,
  APPROVED_TTL_HOURS,
  maxOpsPerRun,
  PLANNED_TTL_HOURS,
  RENEWAL_ROLES,
  ROLE_NAME_BY_ID,
} from './planning'

export interface DiscordPlanReport {
  dryRun: boolean
  batchId: string
  isBackfill: boolean
  studentsWithClass: number
  studentsLinked: number
  accountsDesired: number
  invalidTurma: number
  planned: number
  newAssignments: number
  realChanges: number
  removals: number
  skippedDuplicates: number
  anomalyAborted: boolean
  anomalyDetail?: string
  overCap: boolean
  limit: number
  truncated: boolean
  remaining: number
}

export interface DiscordPlanOptions {
  dryRun?: boolean
  phaseHooks?: CronExecutionPhaseHooks
}

export interface DiscordPlanInputs {
  students: Array<{
    _id: mongoose.Types.ObjectId
    email?: string
    discord?: { discordIds?: string[] }
    hotmart?: { enrolledClasses?: Array<{ className?: string; isActive?: boolean }> }
  }>
  states: Array<{ discordUserId: string; roleId: string; email?: string }>
  truncated: boolean
  remaining: number
}

export interface PreparedDiscordRoleChange {
  _id: IDiscordRoleChange['_id']
  email: string
  userId?: mongoose.Types.ObjectId
  discordUserId: string
  action: IDiscordRoleChange['action']
  status: IDiscordRoleChange['status']
  payload: IDiscordRoleChange['payload']
  context: IDiscordRoleChange['context']
  planBatchId: string
  sourceRef: string
  plannedAt: Date
  notInGuild?: boolean
}

interface Desired {
  userId: mongoose.Types.ObjectId
  email: string
  className: string
  month: number
  roleId: string
  roleName: string
}

export interface PreparedDiscordPlanChange {
  discordUserId: string
  desired: Desired | null
  email?: string
}

export interface DiscordRolePlanSnapshot {
  report: DiscordPlanReport
  pending: PreparedDiscordPlanChange[]
  existing: PreparedDiscordRoleChange[]
  existingOverflow: boolean
}

function planCapExceeded(): HttpError {
  return new HttpError({
    status: 413,
    code: 'DISCORD_ROLES_PLAN_CAP_EXCEEDED',
    publicMessage: 'Plano Discord excede o limite de leitura permitido',
  })
}

export async function prepareDiscordPlanInputs(): Promise<DiscordPlanInputs> {
  const students = await User.find({ 'hotmart.enrolledClasses.0': { $exists: true } })
    .select('email discord.discordIds hotmart.enrolledClasses')
    .sort({ _id: 1 })
    .limit(MAX_PROVIDER_READ_ITEMS + 1)
    .lean()
    .exec() as DiscordPlanInputs['students']
  const states = await DiscordRoleState.find({})
    .sort({ discordUserId: 1, _id: 1 })
    .limit(MAX_PROVIDER_READ_ITEMS + 1)
    .lean()
    .exec() as DiscordPlanInputs['states']
  const studentsTruncated = students.length > MAX_PROVIDER_READ_ITEMS
  const statesTruncated = states.length > MAX_PROVIDER_READ_ITEMS
  return {
    students: students.slice(0, MAX_PROVIDER_READ_ITEMS),
    states: states.slice(0, MAX_PROVIDER_READ_ITEMS),
    truncated: studentsTruncated || statesTruncated,
    remaining: (studentsTruncated ? 1 : 0) + (statesTruncated ? 1 : 0),
  }
}

export function assertDiscordPlanInputsWithinCap(inputs: Pick<DiscordPlanReport, 'truncated'>): void {
  if (inputs.truncated) throw planCapExceeded()
}

function liveRoleChange(change: PreparedDiscordRoleChange, at: number): boolean {
  const plannedAt = new Date(change.plannedAt).getTime()
  if (!Number.isFinite(plannedAt)) return false
  if (change.status === 'PLANNED') return plannedAt >= at - PLANNED_TTL_HOURS * 3600e3
  if (change.status === 'APPROVED') return plannedAt >= at - APPROVED_TTL_HOURS * 3600e3
  if (change.status === 'BLOCKED') return change.notInGuild === true
  return false
}

function matchesExisting(
  change: PreparedDiscordRoleChange,
  pending: PreparedDiscordPlanChange,
  at: number,
): boolean {
  if (change.sourceRef !== pending.discordUserId || !liveRoleChange(change, at)) return false
  if (change.status !== 'BLOCKED') return true
  return change.payload.addRoleId === (pending.desired?.roleId || null)
}

async function loadExistingForPending(
  pending: PreparedDiscordPlanChange[],
): Promise<PreparedDiscordRoleChange[]> {
  const sourceRefs = [...new Set(pending.map((change) => change.discordUserId))]
  if (sourceRefs.length === 0) return []
  return await DiscordRoleChange.find({
    sourceRef: { $in: sourceRefs },
    $or: [
      { status: { $in: ['PLANNED', 'APPROVED'] } },
      { status: 'BLOCKED', notInGuild: true },
    ],
  })
    .sort({ status: 1, plannedAt: 1, _id: 1 })
    .limit(MAX_PROVIDER_READ_ITEMS + 1)
    .lean()
    .exec() as unknown as PreparedDiscordRoleChange[]
}

async function loadExecutionCandidates(): Promise<{
  changes: PreparedDiscordRoleChange[]
  overflow: boolean
}> {
  const now = Date.now()
  const raw = await DiscordRoleChange.find({
    status: { $in: ['APPROVED', 'PLANNED'] },
    $or: [
      { status: 'APPROVED', plannedAt: { $gte: new Date(now - APPROVED_TTL_HOURS * 3600e3) } },
      { status: 'PLANNED', plannedAt: { $gte: new Date(now - PLANNED_TTL_HOURS * 3600e3) } },
    ],
  })
    .sort({ status: 1, plannedAt: 1, _id: 1 })
    .limit(maxOpsPerRun() + 1)
    .lean()
    .exec() as unknown as PreparedDiscordRoleChange[]
  const changes = raw.filter((change) => liveRoleChange(change, now)).slice(0, maxOpsPerRun())
  return { changes, overflow: raw.length > maxOpsPerRun() }
}

function buildDesiredPlan(inputs: DiscordPlanInputs, batchId: string, dryRun: boolean): {
  report: DiscordPlanReport
  pending: PreparedDiscordPlanChange[]
} {
  const report: DiscordPlanReport = {
    dryRun,
    batchId,
    isBackfill: false,
    studentsWithClass: inputs.students.length,
    studentsLinked: 0,
    accountsDesired: 0,
    invalidTurma: 0,
    planned: 0,
    newAssignments: 0,
    realChanges: 0,
    removals: 0,
    skippedDuplicates: 0,
    anomalyAborted: false,
    overCap: false,
    limit: MAX_PROVIDER_READ_ITEMS,
    truncated: inputs.truncated,
    remaining: inputs.remaining,
  }
  const desiredByAccount = new Map<string, Desired>()
  for (const student of inputs.students) {
    const discordIds = (student.discord?.discordIds || []).map(String).filter(Boolean)
    if (discordIds.length === 0) continue
    report.studentsLinked += 1
    const classes = student.hotmart?.enrolledClasses || []
    const active = classes.find((entry) => entry.className && entry.isActive !== false)
      || classes.find((entry) => entry.className)
    const className = active?.className || ''
    const parsed = parseTurmaName(className)
    if (!parsed.valid || !parsed.accessEndOgi) {
      report.invalidTurma += 1
      continue
    }
    const role = RENEWAL_ROLES[parsed.accessEndOgi.getUTCMonth() + 1]
    if (!role) continue
    for (const discordUserId of discordIds) {
      desiredByAccount.set(discordUserId, {
        userId: student._id,
        email: (student.email || '').toLowerCase(),
        className,
        month: parsed.accessEndOgi.getUTCMonth() + 1,
        roleId: role.roleId,
        roleName: role.roleName,
      })
    }
  }
  report.accountsDesired = desiredByAccount.size
  const stateByAccount = new Map(inputs.states.map((state) => [String(state.discordUserId), state.roleId]))
  report.isBackfill = inputs.states.length === 0
  const pending: PreparedDiscordPlanChange[] = []
  for (const [discordUserId, desired] of desiredByAccount) {
    if (stateByAccount.get(discordUserId) !== desired.roleId) pending.push({ discordUserId, desired })
  }
  for (const state of inputs.states) {
    if (!desiredByAccount.has(String(state.discordUserId))) {
      pending.push({ discordUserId: String(state.discordUserId), desired: null })
    }
  }
  report.newAssignments = pending.filter((change) => change.desired && !stateByAccount.has(change.discordUserId)).length
  report.realChanges = pending.length - report.newAssignments
  if (!report.isBackfill) {
    const threshold = Math.max(30, Math.ceil(Math.max(stateByAccount.size, 1) * 0.05))
    if (report.realChanges > threshold) {
      report.anomalyAborted = true
      report.anomalyDetail = `${report.realChanges} mudanças de cargos JÁ aplicados (> limiar ${threshold}) — provável anomalia nos dados, plano NÃO gerado (novas atribuições: ${report.newAssignments}, não contam)`
      logger.error(`🚨 [DiscordRoles] ${report.anomalyDetail}`)
    }
  }
  return { report, pending }
}

export async function prepareDiscordRolesPlanSnapshot(): Promise<DiscordRolePlanSnapshot> {
  const inputs = await prepareDiscordPlanInputs()
  const batchId = `discord-${new Date().toISOString().replace(/[:.]/g, '-')}`
  const prepared = buildDesiredPlan(inputs, batchId, false)
  if (prepared.report.anomalyAborted) {
    return { ...prepared, existing: [], existingOverflow: false }
  }
  const existingForPending = await loadExistingForPending(prepared.pending)
  const at = Date.now()
  const deduplicated = prepared.pending.filter((pending) => {
    const duplicate = existingForPending.some((change) => matchesExisting(change, pending, at))
    if (duplicate) prepared.report.skippedDuplicates += 1
    return !duplicate
  })
  prepared.report.planned = deduplicated.length
  prepared.report.removals = deduplicated.filter((change) => !change.desired).length
  prepared.report.overCap = prepared.report.planned > maxOpsPerRun()
  const execution = await loadExecutionCandidates()
  return {
    report: prepared.report,
    pending: deduplicated,
    existing: execution.changes,
    existingOverflow: execution.overflow,
  }
}

async function emailForState(discordUserId: string): Promise<string> {
  const state = await DiscordRoleState.findOne({ discordUserId })
    .select('email')
    .lean()
    .exec() as { email?: string } | null
  return state?.email || 'desconhecido'
}

export async function resolveDiscordPlanSnapshotEmails(
  snapshot: DiscordRolePlanSnapshot,
): Promise<DiscordRolePlanSnapshot> {
  const pending = await Promise.all(snapshot.pending.map(async (change) => ({
    ...change,
    email: change.desired?.email || await emailForState(change.discordUserId),
  })))
  return { ...snapshot, pending }
}

export async function persistDiscordPlanSnapshot(
  snapshot: DiscordRolePlanSnapshot,
  phaseHooks?: CronExecutionPhaseHooks,
): Promise<PreparedDiscordRoleChange[]> {
  const pendingWithEmail = await Promise.all(snapshot.pending.map(async (pending) => ({
    pending,
    email: pending.email || pending.desired?.email || 'desconhecido',
  })))
  const created: PreparedDiscordRoleChange[] = []
  for (const { pending, email } of pendingWithEmail) {
    const addRoleId = pending.desired?.roleId || null
    const removeRoleIds = ALL_RENEWAL_ROLE_IDS.filter((id) => id !== addRoleId)
    phaseHooks?.assertOwnership?.()
    phaseHooks?.localMutationStarted()
    const change = await DiscordRoleChange.create({
      email,
      userId: pending.desired?.userId,
      discordUserId: pending.discordUserId,
      action: 'SET_ROLE',
      status: 'PLANNED',
      payload: {
        addRoleId,
        addRoleName: addRoleId ? ROLE_NAME_BY_ID.get(addRoleId) : null,
        removeRoleIds,
        removeRoleNames: removeRoleIds.map((id) => ROLE_NAME_BY_ID.get(id) || id),
      },
      context: {
        className: pending.desired?.className,
        accessEndMonth: pending.desired?.month,
        note: pending.desired ? undefined : 'Aluno já não elegível (sem turma activa/ligação) — remover cargo de renovação (D4)',
      },
      planBatchId: snapshot.report.batchId,
      sourceRef: pending.discordUserId,
      plannedAt: new Date(),
    })
    created.push(change as unknown as PreparedDiscordRoleChange)
  }
  return created
}
