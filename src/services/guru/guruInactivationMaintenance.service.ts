import { getEffectiveStatus } from './guru.constants'
import type { CurseducaMemberClient } from './curseducaMember.client'
import { isCurseducaEnrollmentActive } from '../syncUtilizadoresServices/curseducaServices/curseducaMemberships'

export interface PendingInactivationRecord {
  id: unknown
  userId: unknown
  email?: string
  name?: string
  guruStatus?: string
  guruUpdatedAt?: Date
  guruNextCycleAt?: Date
  curseducaStatus?: string
  memberId?: string | number
}

export interface DiagnosticRecord {
  userId: unknown
  email?: string
  name?: string
  guruStatus?: string
  guruSubscriptionCode?: string
  curseducaMemberStatus?: string
  curseducaUserId?: string
  curseducaSituation?: string
  product: {
    status?: string
    platformUserId?: string
    metadata?: unknown
    classes: number
  } | null
}

export interface GuruInactivationMaintenanceRepository {
  listPending(): Promise<PendingInactivationRecord[]>
  markInactive(id: unknown, at: Date, by: string, reason: string): Promise<void>
  markActive(id: unknown, at: Date, reason: string): Promise<void>
  updateUserSituation(userId: unknown, situation: string): Promise<void>
  findDiagnostic(email: string): Promise<DiagnosticRecord | undefined>
}

export interface CleanedInactivationDetail {
  email?: string
  name?: string
  reason: string
  curseducaStatus?: string
  guruStatus?: string
}

export interface CleanupResult {
  cleanedInactive: number
  cleanedGuruActive: number
  kept: number
  total: number
  details: CleanedInactivationDetail[]
}

export const createGuruInactivationMaintenanceService = (
  repository: GuruInactivationMaintenanceRepository,
  client: CurseducaMemberClient,
  now: () => Date = () => new Date(),
) => ({
  async cleanup(): Promise<CleanupResult> {
    const pending = await repository.listPending()
    const result: CleanupResult = {
      cleanedInactive: 0,
      cleanedGuruActive: 0,
      kept: 0,
      total: pending.length,
      details: [],
    }
    for (const record of pending) {
      if (!record.email) continue
      if (!isCurseducaEnrollmentActive(record.curseducaStatus)) {
        await repository.markInactive(
          record.id,
          now(),
          'cleanup_auto',
          'Já estava INACTIVE no CursEduca',
        )
        result.cleanedInactive += 1
        result.details.push({
          email: record.email,
          name: record.name,
          reason: 'CursEduca INACTIVE',
          curseducaStatus: record.curseducaStatus,
          guruStatus: record.guruStatus,
        })
        continue
      }
      const effective = getEffectiveStatus(record.guruStatus, {
        updatedAt: record.guruUpdatedAt,
        nextCycleAt: record.guruNextCycleAt,
      })
      if (effective.isActive) {
        await repository.markActive(
          record.id,
          now(),
          `Guru está ${record.guruStatus} - não deve ser inativado`,
        )
        result.cleanedGuruActive += 1
        result.details.push({
          email: record.email,
          name: record.name,
          reason: `Guru ${record.guruStatus}`,
          curseducaStatus: record.curseducaStatus || 'ACTIVE',
          guruStatus: record.guruStatus,
        })
        continue
      }
      const remote = record.memberId === undefined
        ? undefined
        : await client.getMember(record.memberId)
      if (remote?.ok && !isCurseducaEnrollmentActive(remote.value.situation)) {
        const situation = remote.value.situation ?? 'UNKNOWN'
        await repository.markInactive(
          record.id,
          now(),
          'cleanup_api_check',
          `Já estava ${situation} na API CursEduca (BD desatualizada)`,
        )
        await repository.updateUserSituation(record.userId, situation)
        result.cleanedInactive += 1
        result.details.push({
          email: record.email,
          name: record.name,
          reason: `API CursEduca: ${situation} (BD dizia ACTIVE)`,
          curseducaStatus: situation,
          guruStatus: record.guruStatus,
        })
        continue
      }
      result.kept += 1
    }
    return result
  },

  async diagnose(emails: string[]) {
    const results = []
    for (const email of emails) {
      const record = await repository.findDiagnostic(email)
      if (!record) {
        results.push({ email, found: false, reason: 'User não encontrado na BD' })
        continue
      }
      const memberId = record.product?.platformUserId ?? record.curseducaUserId
      const remote = memberId === undefined ? undefined : await client.getMember(memberId)
      results.push({
        email,
        found: true,
        name: record.name,
        db: {
          guruStatus: record.guruStatus ?? null,
          guruSubscriptionCode: record.guruSubscriptionCode ?? null,
          curseducaMemberStatus: record.curseducaMemberStatus ?? null,
          curseducaUserId: record.curseducaUserId ?? null,
          curseducaSituation: record.curseducaSituation ?? null,
        },
        userProduct: record.product,
        curseducaApi: remote?.ok ? remote.value : remote?.failure ?? null,
      })
    }
    return results
  },
})

export type GuruInactivationMaintenanceService = ReturnType<typeof createGuruInactivationMaintenanceService>