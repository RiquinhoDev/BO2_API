/**
 * Aggregate summary of the user base behind GET /api/users/infiniteStats.
 * The reader owns the pipeline; the service applies the zero fallback. Ports
 * live here with the service.
 */

export interface ListingStats {
  _id?: unknown
  totalUsers: number
  activeUsers: number
  withEngagement: number
  withProgress: number
}

export interface UserListingStatsReader {
  read(): Promise<ListingStats | null>
}

const ZERO_STATS: ListingStats = {
  totalUsers: 0,
  activeUsers: 0,
  withEngagement: 0,
  withProgress: 0,
}

export class UserListingStatsService {
  constructor(private readonly reader: UserListingStatsReader) {}

  async get(): Promise<ListingStats> {
    // The raw $group result (carrying its _id: null) is preserved verbatim; the
    // zero fallback, used when no document matches, intentionally has no _id.
    return (await this.reader.read()) ?? ZERO_STATS
  }
}
