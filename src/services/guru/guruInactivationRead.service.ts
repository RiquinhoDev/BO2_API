import { GURU_CANCELED_STATUSES } from './guru.constants'
import { paginate, type PaginationInput } from '../../utils/pagination'

export interface GuruInactivationReadRecord {
  userProductId: string
  userId?: string
  email?: string
  name?: string
  platformUserId?: string
  fallbackCurseducaUserId?: string
  guruStatus?: string
  curseducaStatus?: string
  markedAt?: Date
  markedReason?: string
  inactivatedAt?: Date
  inactivatedBy?: string
  inactivatedReason?: string
  classes?: Array<{
    classId: string
    className?: string
    joinedAt: Date
  }>
}

export interface GuruInactivationReadRepository {
  findPending(): Promise<GuruInactivationReadRecord[]>
  findPendingForStats(): Promise<GuruInactivationReadRecord[]>
  findInactive(): Promise<GuruInactivationReadRecord[]>
  countInactivatedSince(start: Date): Promise<number>
  countInactivatedByGuru(): Promise<number>
}

export interface GuruInactivationReadServiceOptions {
  now?: () => Date
}

export interface GuruInactivationReadService {
  listPending(): Promise<{
    count: number
    total: number
    filtered: number
    deduplicated: number
    pendingList: Array<Record<string, unknown>>
  }>
  getStats(): Promise<{
    pendingInactivation: number
    pendingInactivationTotal: number
    inactivatedToday: number
    totalInactivatedByGuru: number
  }>
  listInactive(input: PaginationInput & { email?: unknown }): Promise<{
    total: number
    page: number
    limit: number
    pages: number
    inactivatedList: Array<Record<string, unknown>>
  }>
}

const hasCanceledGuruStatus = (record: GuruInactivationReadRecord): boolean =>
  !record.guruStatus || GURU_CANCELED_STATUSES.includes(record.guruStatus)

const curseducaMemberId = (
  record: GuruInactivationReadRecord,
): string | undefined => record.platformUserId || record.fallbackCurseducaUserId

const deduplicatePending = (
  records: GuruInactivationReadRecord[],
): GuruInactivationReadRecord[] => {
  const seen = new Set<string>()
  return records.filter((record) => {
    const memberId = curseducaMemberId(record)
    if (!memberId) return true
    if (seen.has(memberId)) return false
    seen.add(memberId)
    return true
  })
}

const pendingItem = (record: GuruInactivationReadRecord) => ({
  userProductId: record.userProductId,
  userId: record.userId,
  email: record.email,
  name: record.name,
  curseducaUserId: curseducaMemberId(record),
  guruStatus: record.guruStatus,
  markedAt: record.markedAt,
  reason: record.markedReason,
  classes: record.classes?.map((enrollment) => ({
    classId: enrollment.classId,
    className: enrollment.className,
    joinedAt: enrollment.joinedAt,
  })),
})

const inactiveItem = (record: GuruInactivationReadRecord) => ({
  userProductId: record.userProductId,
  email: record.email,
  name: record.name,
  curseducaUserId: curseducaMemberId(record),
  guruStatus: record.guruStatus || null,
  curseducaStatus: record.curseducaStatus || null,
  inactivatedAt: record.inactivatedAt || null,
  inactivatedBy: record.inactivatedBy || null,
  inactivatedReason: record.inactivatedReason || null,
})

export const createGuruInactivationReadService = (
  repository: GuruInactivationReadRepository,
  options: GuruInactivationReadServiceOptions = {},
): GuruInactivationReadService => {
  const now = options.now ?? (() => new Date())

  return {
    async listPending() {
      const records = await repository.findPending()
      const filtered = records.filter(hasCanceledGuruStatus)
      const deduplicated = deduplicatePending(filtered)
      return {
        count: deduplicated.length,
        total: records.length,
        filtered: records.length - filtered.length,
        deduplicated: filtered.length - deduplicated.length,
        pendingList: deduplicated.map(pendingItem),
      }
    },

    async getStats() {
      const startOfDay = now()
      startOfDay.setHours(0, 0, 0, 0)
      const [records, inactivatedToday, totalInactivatedByGuru] = await Promise.all([
        repository.findPendingForStats(),
        repository.countInactivatedSince(startOfDay),
        repository.countInactivatedByGuru(),
      ])
      const pendingInactivation = deduplicatePending(
        records.filter(hasCanceledGuruStatus),
      ).length
      return {
        pendingInactivation,
        pendingInactivationTotal: records.length,
        inactivatedToday,
        totalInactivatedByGuru,
      }
    },

    async listInactive(input) {
      const pagination = paginate(input)
      const emailFilter = typeof input.email === 'string'
        ? input.email.toLowerCase().trim()
        : undefined
      const records = (await repository.findInactive())
        .filter((record) => record.email)
        .filter((record) => !emailFilter ||
          record.email?.toLowerCase().includes(emailFilter) ||
          record.name?.toLowerCase().includes(emailFilter))
      const total = records.length
      return {
        ...pagination.metadata(total),
        inactivatedList: records
          .slice(pagination.skip, pagination.skip + pagination.limit)
          .map(inactiveItem),
      }
    },
  }
}
