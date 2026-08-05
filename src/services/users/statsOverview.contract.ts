/**
 * Ports for the consolidated stats overview behind GET /api/users/stats/overview.
 * The reader owns every Mongoose detail; the service only orchestrates the three
 * reads in their historical, strictly sequential order.
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
export interface StatsOverviewResult {
  totalUsers: number
  byPlatform: PlatformCount[]
  byProduct: ProductCount[]
}

export interface StatsOverviewReader {
  countUsers(): Promise<number>
  countByPlatform(): Promise<PlatformCount[]>
  countByProduct(): Promise<ProductCount[]>
}
