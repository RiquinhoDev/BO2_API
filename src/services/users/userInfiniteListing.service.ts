import mongoose from 'mongoose'

/**
 * Cursor-paginated infinite user listing behind GET /api/users/infinite.
 * The reader owns the cache and Mongoose access; the service builds the
 * pipeline, drives the cache/query/count/process flow and shapes the envelope.
 * Behaviour is preserved verbatim from the legacy handler.
 */

type PipelineStage = mongoose.PipelineStage

export interface InfiniteListingParams {
  cursor?: string
  limit: number
  search?: string
  status?: string
  engagementLevel?: string
  source?: string
  includePreCalculated: boolean
  forceRefresh: boolean
}

export interface InfiniteListingEnvelope {
  success: boolean
  users: unknown[]
  hasMore: boolean
  nextCursor: unknown
  totalCount?: number
  meta: {
    limit: number
    returned: number
    preCalculated: boolean
    performance: { totalTime: number; queryTime: number; fromCache: boolean }
  }
  cachedAt: number
}

export type ListingResult =
  | { kind: 'cache'; data: InfiniteListingEnvelope }
  | { kind: 'fresh'; data: InfiniteListingEnvelope }

interface UserRow {
  _id: unknown
  name?: string
  email?: string
  status?: string
  estado?: string
  className?: string
  accessCount?: number
  discordIds?: string[]
  progress?: { completedPercentage?: number }
  engagementScore?: number
  activityLevel?: string
  isPreComputed?: boolean
  hasDiscord?: boolean
  hasHotmart?: boolean
  hasCurseduca?: boolean
  purchaseDate?: Date
  lastAccessDate?: Date
  preComputed?: { engagementScore?: number; activityLevel?: string }
}

export interface UserInfiniteListingReader {
  cacheKey(prefix: string, params: Record<string, unknown>): string
  cacheGet(key: string): Promise<InfiniteListingEnvelope | null>
  cacheSet(key: string, value: InfiniteListingEnvelope, ttl: number): Promise<void>
  aggregateUsers(pipeline: PipelineStage[]): Promise<Array<Record<string, unknown>>>
  estimatedCount(): Promise<number>
  countWithPipeline(pipeline: PipelineStage[]): Promise<Array<{ total?: number }>>
}

function buildProjection(includePreCalculated: boolean): Record<string, number> {
  const baseFields: Record<string, number> = { _id: 1, name: 1, email: 1, status: 1, estado: 1, className: 1 }
  const conditionalFields: Record<string, number> = includePreCalculated
    ? {
      'preComputed.engagementScore': 1,
      'preComputed.activityLevel': 1,
      'preComputed.lastCalculated': 1,
    }
    : {
      accessCount: 1,
      discordIds: 1,
      purchaseDate: 1,
      classId: 1,
      hotmartUserId: 1,
      curseducaUserId: 1,
      lastAccessDate: 1,
      engagement: 1,
      'progress.completedPercentage': 1,
      'progress.completed': 1,
      'progress.total': 1,
    }
  return { ...baseFields, ...conditionalFields }
}

function buildMatchStage(params: InfiniteListingParams): mongoose.PipelineStage.Match {
  const matchStage: mongoose.PipelineStage.Match = {
    $match: {
      $or: [{ isDeleted: { $exists: false } }, { isDeleted: false }],
    },
  }

  if (params.cursor) matchStage.$match._id = { $lt: params.cursor }

  if (params.status && params.status !== 'all') {
    if (params.status === 'active') {
      matchStage.$match.$and = matchStage.$match.$and || []
      matchStage.$match.$and.push({
        $or: [{ status: 'ACTIVE' }, { estado: { $in: ['ativo', 'active'] } }],
      })
    } else if (params.status === 'inactive') {
      matchStage.$match.$and = matchStage.$match.$and || []
      matchStage.$match.$and.push({
        $and: [{ status: { $ne: 'ACTIVE' } }, { estado: { $nin: ['ativo', 'active'] } }],
      })
    }
  }

  if (params.engagementLevel && params.engagementLevel !== 'all' && params.includePreCalculated) {
    matchStage.$match['preComputed.activityLevel'] = params.engagementLevel
  }

  if (params.source && params.source !== 'all') matchStage.$match.source = params.source

  return matchStage
}

function buildPipeline(params: InfiniteListingParams, matchStage: mongoose.PipelineStage.Match): PipelineStage[] {
  const pipeline: PipelineStage[] = [matchStage]

  if (params.search) {
    pipeline.push({
      $match: {
        $or: [
          { name: { $regex: params.search, $options: 'i' } },
          { email: { $regex: params.search, $options: 'i' } },
          { $text: { $search: params.search } },
        ],
      },
    })
  }

  pipeline.push({ $sort: { _id: -1 } })
  pipeline.push({ $limit: params.limit + 1 })
  pipeline.push({ $project: buildProjection(params.includePreCalculated) })

  if (params.includePreCalculated) {
    pipeline.push({
      $addFields: {
        engagementScore: { $ifNull: ['$preComputed.engagementScore', 0] },
        activityLevel: { $ifNull: ['$preComputed.activityLevel', 'unknown'] },
        isPreComputed: { $ne: ['$preComputed.lastCalculated', null] },
      },
    })
  } else {
    pipeline.push({
      $addFields: {
        hasDiscord: { $and: [{ $isArray: '$discordIds' }, { $gt: [{ $size: '$discordIds' }, 0] }] },
        hasHotmart: { $and: [{ $ne: ['$hotmartUserId', null] }, { $ne: ['$hotmartUserId', ''] }] },
        hasCurseduca: { $and: [{ $ne: ['$curseducaUserId', null] }, { $ne: ['$curseducaUserId', ''] }] },
      },
    })
  }

  return pipeline
}

function processUsers(users: UserRow[], includePreCalculated: boolean): unknown[] {
  return users.map(user => ({
    _id: user._id,
    name: user.name || '',
    email: user.email || '',
    status: user.status || user.estado || 'unknown',
    estado: user.estado,
    className: user.className || '',
    ...(includePreCalculated
      ? {
        engagementScore: user.engagementScore || user.preComputed?.engagementScore || 0,
        activityLevel: user.activityLevel || user.preComputed?.activityLevel || 'unknown',
        isPreComputed: user.isPreComputed || false,
      }
      : {
        accessCount: user.accessCount || 0,
        discordIds: user.discordIds || [],
        progress: user.progress || { completedPercentage: 0 },
        hasDiscord: user.hasDiscord || false,
        hasHotmart: user.hasHotmart || false,
        hasCurseduca: user.hasCurseduca || false,
        purchaseDate: user.purchaseDate,
        lastAccessDate: user.lastAccessDate,
      }),
  }))
}

export class UserInfiniteListingService {
  constructor(private readonly reader: UserInfiniteListingReader) {}

  async list(params: InfiniteListingParams): Promise<ListingResult> {
    const startTime = Date.now()
    const cacheKey = this.reader.cacheKey('users:infinite', {
      cursor: params.cursor,
      limit: params.limit,
      search: params.search,
      status: params.status,
      engagementLevel: params.engagementLevel,
      source: params.source,
      includePreCalculated: params.includePreCalculated,
    })

    if (!params.forceRefresh) {
      const cached = await this.reader.cacheGet(cacheKey)
      if (cached) return { kind: 'cache', data: cached }
    }

    const matchStage = buildMatchStage(params)
    const pipeline = buildPipeline(params, matchStage)

    const queryStartTime = Date.now()
    const users = await this.reader.aggregateUsers(pipeline) as unknown as UserRow[]
    const queryTime = Date.now() - queryStartTime

    const hasMore = users.length > params.limit
    if (hasMore) users.pop()

    let totalCount: number | undefined
    if (!params.cursor) {
      try {
        const estimatedCount = await this.reader.estimatedCount()
        const filtered = Boolean(
          params.search
          || (params.status && params.status !== 'all')
          || (params.engagementLevel && params.engagementLevel !== 'all'),
        )
        if (filtered) {
          const countPipeline: PipelineStage[] = [matchStage]
          if (params.search) {
            countPipeline.push({
              $match: {
                $or: [
                  { name: { $regex: params.search, $options: 'i' } },
                  { email: { $regex: params.search, $options: 'i' } },
                ],
              },
            })
          }
          countPipeline.push({ $count: 'total' })
          const countResult = await this.reader.countWithPipeline(countPipeline)
          totalCount = countResult[0]?.total || 0
        } else {
          totalCount = estimatedCount
        }
      } catch {
        totalCount = undefined
      }
    }

    const processedUsers = processUsers(users, params.includePreCalculated)
    const totalTime = Date.now() - startTime

    const data: InfiniteListingEnvelope = {
      success: true,
      users: processedUsers,
      hasMore,
      nextCursor: processedUsers.length > 0
        ? (processedUsers[processedUsers.length - 1] as { _id: unknown })._id
        : null,
      ...(totalCount !== undefined && { totalCount }),
      meta: {
        limit: params.limit,
        returned: processedUsers.length,
        preCalculated: params.includePreCalculated,
        performance: { totalTime, queryTime, fromCache: false },
      },
      cachedAt: Date.now(),
    }

    const cacheTTL = params.search ? 30 : 60
    void this.reader.cacheSet(cacheKey, data, cacheTTL).catch(() => undefined)

    return { kind: 'fresh', data }
  }
}
