import { paginate, type PaginationMetadata } from '../../utils/pagination'

type DateValue = Date | string | null

export interface UsersSimpleListSource {
  _id: string
  email?: string
  name?: string
  username?: string
  classId?: string
  className?: string | null
  status?: string
  estado?: string
  role?: string
  type?: string
  purchaseDate?: DateValue
  lastAccessDate?: DateValue
  acceptedTerms?: boolean
  plusAccess?: boolean | string
  hotmartUserId?: string
  curseducaUserId?: string
  discordIds?: string[]
  engagement?: string
  accessCount?: number
  progress?: {
    completedPercentage?: number
  }
  hotmart?: {
    hotmartUserId?: string
    engagement?: {
      engagementLevel?: string
      accessCount?: number
      engagementScore?: number
    }
    progress?: {
      completedLessons?: number
      lessonsData?: unknown[]
      totalTimeMinutes?: number
    }
  }
  curseduca?: {
    curseducaUserId?: string
    engagement?: {
      engagementLevel?: string
      accessCount?: number
      alternativeEngagement?: number
    }
    progress?: {
      estimatedProgress?: number
    }
  }
  combined?: {
    engagement?: {
      level?: string
    }
    combinedEngagement?: string
    totalProgress?: number
  }
}

export interface UsersSimpleListRecord {
  _id: string
  username: string
  email: string
  name: string
  hotmartUserId: string
  curseducaUserId: string
  discordIds: string[]
  classId?: string
  className: string | null
  status?: string
  estado?: string
  role: string
  type: string
  purchaseDate?: DateValue
  lastAccessDate?: DateValue
  acceptedTerms: boolean
  plusAccess: boolean | string
  engagement: string
  accessCount: number
  progress: {
    completedPercentage: number
    completed: number
    total: number
  }
}

export type UsersSimpleListStatus = 'active' | 'inactive'

export interface UsersSimpleListRepositoryInput {
  page: number
  limit: number
  skip: number
  status?: UsersSimpleListStatus
}

export interface UsersSimpleListRepositoryResult {
  users: UsersSimpleListSource[]
  total: number
}

export interface UsersSimpleListRepository {
  list(
    input: UsersSimpleListRepositoryInput,
  ): Promise<UsersSimpleListRepositoryResult>
}

export interface UsersSimpleListQuery {
  page?: string
  limit?: string
  status?: UsersSimpleListStatus
}

export interface UsersSimpleListResult {
  users: UsersSimpleListRecord[]
  count: number
  page: number
  limit: number
  totalPages: number
  pagination: PaginationMetadata
}

const firstDefined = <T>(...values: Array<T | null | undefined>): T | undefined =>
  values.find((value): value is T => value !== undefined && value !== null)

export function mapUsersSimpleListRecord(
  user: UsersSimpleListSource,
): UsersSimpleListRecord {
  const completed = user.hotmart?.progress?.completedLessons ?? 0
  const total = user.hotmart?.progress?.lessonsData?.length ?? 0
  const hotmartProgress = total > 0
    ? Math.round((completed / total) * 100)
    : undefined

  return {
    _id: user._id,
    username: user.username ?? '',
    email: user.email ?? '',
    name: user.name ?? '',
    hotmartUserId: user.hotmartUserId ?? user.hotmart?.hotmartUserId ?? '',
    curseducaUserId:
      user.curseducaUserId ?? user.curseduca?.curseducaUserId ?? '',
    discordIds: user.discordIds ?? [],
    classId: user.classId,
    className: user.className ?? null,
    status: user.status,
    estado: user.estado,
    role: user.role ?? '',
    type: user.type ?? '',
    purchaseDate: user.purchaseDate,
    lastAccessDate: user.lastAccessDate,
    acceptedTerms: user.acceptedTerms ?? false,
    plusAccess: user.plusAccess ?? false,
    engagement: firstDefined(
      user.combined?.engagement?.level,
      user.hotmart?.engagement?.engagementLevel,
      user.curseduca?.engagement?.engagementLevel,
      user.engagement,
    ) ?? 'NONE',
    accessCount: firstDefined(
      user.hotmart?.engagement?.accessCount,
      user.curseduca?.engagement?.accessCount,
      user.accessCount,
    ) ?? 0,
    progress: {
      completedPercentage: firstDefined(
        user.combined?.totalProgress,
        hotmartProgress,
        user.curseduca?.progress?.estimatedProgress,
        user.progress?.completedPercentage,
      ) ?? 0,
      completed,
      total,
    },
  }
}

export class UsersSimpleListService {
  constructor(private readonly repository: UsersSimpleListRepository) {}

  async list(query: UsersSimpleListQuery): Promise<UsersSimpleListResult> {
    const pagination = paginate(query)
    const result = await this.repository.list({
      page: pagination.page,
      limit: pagination.limit,
      skip: pagination.skip,
      status: query.status,
    })
    const metadata = pagination.metadata(result.total)

    return {
      users: result.users.map(mapUsersSimpleListRecord),
      count: result.total,
      page: metadata.page,
      limit: metadata.limit,
      totalPages: metadata.pages,
      pagination: metadata,
    }
  }
}
