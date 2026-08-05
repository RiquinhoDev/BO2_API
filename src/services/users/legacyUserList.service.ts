import type {
  LegacyUserListCriteria,
  LegacyUserListReader,
  LegacyUserListResult,
} from './legacyUserList.contract'

export const DEFAULT_PAGE = 1
export const DEFAULT_LIMIT = 50

export class LegacyUserListService {
  constructor(private readonly reader: LegacyUserListReader) {}

  async list(
    criteria: LegacyUserListCriteria,
    page: number,
    limit: number,
  ): Promise<LegacyUserListResult> {
    // One-based paging: the Backoffice sends page 1 for the first screen.
    const skip = (page - 1) * limit

    const { rows, total } = await this.reader.listAndCount(criteria, { skip, limit })

    return {
      users: rows,
      count: total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    }
  }
}
