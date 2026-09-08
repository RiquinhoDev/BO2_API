import axios from 'axios'
import type { CronExecutionPhaseHooks } from '../../cron/scheduler/executionPhases'
import type { CursEducaMemberFromReports, CursEducaMemberWithMetadata } from '../../../types/curseduca.types'
import {
  BulkCurseducaMember,
  CollectionPayload,
  UnifiedCurseducaMember,
  curseducaApiUrl,
  CURSEDUCA_CONTENTS_API_URL,
  detectSubscriptionType,
  normalizeEmail,
  toNumber,
} from './curseducaAdapterSupport'
import {
  CurseducaProviderReadBudget,
  CurseducaProviderSafetyError,
  fetchCurseducaPages,
} from './curseducaPagination'

const request = <T>(url: string, headers: Record<string, string>) =>
  async (params: Record<string, unknown>): Promise<unknown> => {
    const response = await axios.get<CollectionPayload<T>>(url, { params, headers, timeout: 30000 })
    return response.data
  }

export async function fetchGroupMembersList(groupId: number, headers: Record<string, string>, phaseHooks?: CronExecutionPhaseHooks, budget?: CurseducaProviderReadBudget): Promise<CursEducaMemberFromReports[]> {
  return fetchCurseducaPages<CursEducaMemberFromReports>({
    resource: 'reports/group/members', phaseHooks, budget, baseParams: { group: groupId, groupId },
    identityOf: item => item.id == null ? undefined : String(item.id),
    request: request<CursEducaMemberFromReports>(`${curseducaApiUrl()}/reports/group/members`, headers),
  })
}

export type CurseducaProgressReportItem = { id?: string | number; finishedAt?: string; member?: { id: number; email?: string }; enrollment?: { progress?: number | string } }

export function getContentSlugFromGroup(groupName: string): string | null {
  const normalized = groupName.toLowerCase().trim()
  if (normalized.includes('clareza')) return 'clareza'
  if (normalized.includes('ogi') || normalized.includes('o grande investimento')) return 'ogi'
  return null
}

export async function fetchProgressReport(groupId: number, groupName: string, headers: Record<string, string>, phaseHooks?: CronExecutionPhaseHooks, budget?: CurseducaProviderReadBudget): Promise<Map<number, { progress: number; lastActivity?: string }>> {
  const contentSlug = getContentSlugFromGroup(groupName)
  if (!contentSlug) return new Map()
  const items = await fetchCurseducaPages<CurseducaProgressReportItem>({
    resource: 'reports/progress', phaseHooks, budget, baseParams: { content: contentSlug, group: groupId },
    identityOf: item => item.id != null
      ? String(item.id)
      : item.member?.id == null
        ? undefined
        : `${item.member.id}:${item.finishedAt || ''}:${String(item.enrollment?.progress ?? '')}`,
    request: request<CurseducaProgressReportItem>(`${CURSEDUCA_CONTENTS_API_URL}/reports/progress`, headers),
  })
  const progressMap = new Map<number, { progress: number; lastActivity?: string }>()
  for (const item of items) {
    const rawMemberId: unknown = item.member?.id
    if (typeof rawMemberId !== 'number' || !Number.isSafeInteger(rawMemberId) || rawMemberId <= 0) {
      throw new CurseducaProviderSafetyError('CURSEDUCA_PROVIDER_DATA_INVALID', 'reports/progress membro inválido')
    }
    const memberId = rawMemberId
    if (item.finishedAt !== undefined && typeof item.finishedAt !== 'string') {
      throw new CurseducaProviderSafetyError('CURSEDUCA_PROVIDER_DATA_INVALID', 'reports/progress finishedAt inválido')
    }
    const rawProgress = item.enrollment?.progress
    const progress = toNumber(rawProgress, Number.NaN)
    if (rawProgress === undefined || rawProgress === null || !Number.isFinite(progress) || progress < 0 || progress > 100) {
      throw new CurseducaProviderSafetyError('CURSEDUCA_PROVIDER_DATA_INVALID', 'reports/progress progresso inválido')
    }
    const current = progressMap.get(memberId)
    if (!current || progress > current.progress) progressMap.set(memberId, { progress, lastActivity: item.finishedAt || current?.lastActivity })
    else if (item.finishedAt && !current.lastActivity) progressMap.set(memberId, { progress: current.progress, lastActivity: item.finishedAt })
  }
  return progressMap
}

export type CurseducaAccessReportItem = { id?: string | number; createdAt?: string; member?: { email?: string; uuid?: string } }

export async function fetchAccessReport(headers: Record<string, string>, phaseHooks?: CronExecutionPhaseHooks, budget?: CurseducaProviderReadBudget): Promise<Map<string, { lastAccess?: string; accessCount: number }>> {
  const items = await fetchCurseducaPages<CurseducaAccessReportItem>({
    resource: 'reports/access', phaseHooks, budget,
    identityOf: item => item.id != null ? String(item.id) : (item.member?.uuid || item.member?.email) && item.createdAt ? `${item.member?.uuid || item.member?.email}:${item.createdAt}` : undefined,
    request: request<CurseducaAccessReportItem>(`${curseducaApiUrl()}/reports/access`, headers),
  })
  const accessMap = new Map<string, { lastAccess?: string; accessCount: number }>()
  for (const item of items) {
    const email = normalizeEmail(item.member?.email)
    if (!email) throw new CurseducaProviderSafetyError('CURSEDUCA_PROVIDER_DATA_INVALID', 'reports/access email inválido')
    if (item.createdAt !== undefined && typeof item.createdAt !== 'string') {
      throw new CurseducaProviderSafetyError('CURSEDUCA_PROVIDER_DATA_INVALID', 'reports/access createdAt inválido')
    }
    const current = accessMap.get(email) || { accessCount: 0 }
    current.accessCount += 1
    if (item.createdAt) {
      const currentTime = current.lastAccess ? Date.parse(current.lastAccess) : 0
      const newTime = Date.parse(item.createdAt)
      if (!current.lastAccess || (Number.isFinite(newTime) && newTime > currentTime)) current.lastAccess = item.createdAt
    }
    accessMap.set(email, current)
  }
  return accessMap
}

export interface BulkMemberInfo { situation: string; lastAccess?: string; groupIds: number[] }

export async function fetchAllMembersMap(headers: Record<string, string>, phaseHooks?: CronExecutionPhaseHooks, budget?: CurseducaProviderReadBudget): Promise<Map<number, BulkMemberInfo>> {
  const items = await fetchCurseducaPages<BulkCurseducaMember>({
    resource: 'members', phaseHooks, budget, retries: 3,
    identityOf: item => item.id == null ? undefined : String(item.id),
    request: request<BulkCurseducaMember>(`${curseducaApiUrl()}/members`, headers),
  })
  const map = new Map<number, BulkMemberInfo>()
  for (const member of items) {
    if (member?.id == null) continue
    if (typeof member.situation !== 'string' || member.situation.trim() === '') {
      throw new CurseducaProviderSafetyError('CURSEDUCA_PROVIDER_DATA_INVALID', 'members situation inválida')
    }
    if (member.lastAccess !== undefined && typeof member.lastAccess !== 'string') {
      throw new CurseducaProviderSafetyError('CURSEDUCA_PROVIDER_DATA_INVALID', 'members lastAccess inválido')
    }
    if (!Array.isArray(member.groups) || member.groups.some(group => !group || !Number.isSafeInteger(group.groupId))) {
      throw new CurseducaProviderSafetyError('CURSEDUCA_PROVIDER_DATA_INVALID', 'members groups inválido')
    }
    const groupIds = member.groups.map(group => group.groupId).filter((id): id is number => Number.isSafeInteger(id))
    map.set(member.id, {
      situation: member.situation.trim(),
      lastAccess: member.lastAccess,
      groupIds,
    })
  }
  return map
}

export function enrichMemberFromBulk(member: UnifiedCurseducaMember, groupId: number, groupName: string, bulkMap: Map<number, BulkMemberInfo>, rosterIds: Set<number>): CursEducaMemberWithMetadata | null {
  const bulk = bulkMap.get(member.id)
  if (!rosterIds.has(member.id) && !bulk?.groupIds.includes(groupId)) return null
  if (!bulk || typeof bulk.situation !== 'string' || bulk.situation.trim() === '') {
    throw new CurseducaProviderSafetyError('CURSEDUCA_PROVIDER_DATA_INVALID', 'members detalhe ausente')
  }
  return {
    id: member.id, uuid: member.uuid, name: member.name, email: member.email,
    progress: member.progress, enrollmentsCount: member.enrollmentsCount, groupId, groupName,
    subscriptionType: detectSubscriptionType(groupName), enrolledAt: member.enteredAt || new Date().toISOString(), expiresAt: member.expiresAt,
    situation: bulk.situation, lastLogin: bulk.lastAccess || member.lastLogin, lastAccess: member.lastAccess || bulk.lastAccess,
    accessCount: member.accessCount, isPrimary: true, isDuplicate: false,
  }
}
