/**
 * Filtered, paginated user directory behind GET /api/users/unified.
 *
 * The filter construction is pure and lives here with the service; the reader
 * owns the Mongoose find/count. The query shape is preserved verbatim from the
 * legacy handler so the extraction carries no behavioural change.
 */

type MongoFilter = Record<string, unknown>

export interface UserDirectoryQuery {
  page?: unknown
  limit?: unknown
  status?: unknown
  platform?: unknown
  search?: unknown
}

export type UserDirectoryRecord = Record<string, unknown>

export interface UserDirectoryResult {
  success: true
  users: UserDirectoryRecord[]
  pagination: { page: number; limit: number; total: number; pages: number }
}

export interface UserDirectoryReader {
  findPage(filter: MongoFilter, skip: number, limit: number): Promise<UserDirectoryRecord[]>
  count(filter: MongoFilter): Promise<number>
}

/** Builds the exact filter the legacy handler assembled from the query string. */
export function buildUserDirectoryFilter(query: UserDirectoryQuery): MongoFilter {
  const { status, platform, search } = query
  const filter: MongoFilter = { isDeleted: { $ne: true } }

  if (status === 'active') {
    filter.$or = [
      { 'combined.status': 'ACTIVE' },
      { status: 'ACTIVE' },
      { status: 'ativo' },
    ]
  } else if (status === 'inactive') {
    filter.$or = [
      { 'combined.status': 'INACTIVE' },
      { status: 'INACTIVE' },
      { status: 'inativo' },
    ]
  }

  if (platform) {
    switch (platform) {
      case 'hotmart':
        filter.$or = [
          { 'hotmart.hotmartUserId': { $exists: true, $nin: [null, ''] } },
          { hotmartUserId: { $exists: true, $nin: [null, ''] } },
        ]
        break
      case 'curseduca':
        filter.$or = [
          { 'curseduca.curseducaUserId': { $exists: true, $nin: [null, ''] } },
          { curseducaUserId: { $exists: true, $nin: [null, ''] } },
        ]
        break
      case 'discord':
        filter.$or = [
          { 'discord.discordIds.0': { $exists: true } },
          { 'discordIds.0': { $exists: true } },
        ]
        break
    }
  }

  if (search) {
    const searchRegex = new RegExp(search as string, 'i')
    const searchOr = [
      { name: searchRegex },
      { email: searchRegex },
      { username: searchRegex },
    ]
    if (filter.$or) {
      // Preserve an earlier status/platform $or by nesting both under $and.
      const previousOr = filter.$or
      delete filter.$or
      filter.$and = [{ $or: previousOr }, { $or: searchOr }]
    } else {
      filter.$or = searchOr
    }
  }

  return filter
}

export class UserDirectoryService {
  constructor(private readonly reader: UserDirectoryReader) {}

  async get(query: UserDirectoryQuery): Promise<UserDirectoryResult> {
    const filter = buildUserDirectoryFilter(query)
    const page = Number(query.page ?? 1)
    const limit = Number(query.limit ?? 1000)
    const skip = (page - 1) * limit

    // Sequential, matching the legacy handler: page first, then the count.
    const users = await this.reader.findPage(filter, skip, limit)
    const total = await this.reader.count(filter)

    return {
      success: true,
      users,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    }
  }
}
