/**
 * Consolidated stats overview behind GET /api/users/stats/overview.
 *
 * The reader owns every Mongoose detail; the service only orchestrates the three
 * reads in their historical, strictly sequential order. The ports live here with
 * the service rather than in a separate contract module.
 */

/** One platform bucket. Counts enrollments, not distinct users. */
export interface PlatformCount {
  _id: string
  count: number
}

/** One product bucket, carrying the product name resolved from the lookup. */
export interface ProductCount {
  _id: string
  productName: string
  count: number
}

/** Exact legacy response payload of GET /api/users/stats/overview. */
export interface UserStatsOverviewResult {
  totalUsers: number
  byPlatform: PlatformCount[]
  byProduct: ProductCount[]
}

export interface UserStatsOverviewReader {
  countUsers(): Promise<number>
  countByPlatform(): Promise<PlatformCount[]>
  countByProduct(): Promise<ProductCount[]>
}

export class UserStatsOverviewService {
  constructor(private readonly reader: UserStatsOverviewReader) {}

  async get(): Promise<UserStatsOverviewResult> {
    // Sequential by contract: the legacy handler awaited each read in turn and
    // that order (users -> platform -> product) is characterized, so it is not
    // collapsed into Promise.all here. Parallelizing is separate work.
    const totalUsers = await this.reader.countUsers()
    const byPlatform = await this.reader.countByPlatform()
    const byProduct = await this.reader.countByProduct()

    return { totalUsers, byPlatform, byProduct }
  }
}
