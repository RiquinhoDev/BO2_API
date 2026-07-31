export interface UsersV2OverviewAnalyticsSnapshot {
  overview: {
    totalUsers: number
    totalActiveUsers: number
    totalProducts: number
    progressByUser: Array<{
      userId: string
      averageProgress: number
    }>
  }
  byPlatform: Array<{
    platform: string
    userCount: number
  }>
  byProduct: Array<{
    productId: string
    productName: string
    platform: string
    totalUsers: number
    activeUsers: number
    progressSum: number
    progressCount: number
  }>
}

export interface UsersV2OverviewAnalyticsReader {
  read(): Promise<UsersV2OverviewAnalyticsSnapshot>
}

export interface UsersV2OverviewAnalyticsResponse {
  success: true
  data: {
    overview: {
      totalUsers: number
      totalActiveUsers: number
      totalProducts: number
      avgProgress: number
    }
    byPlatform: Array<{
      platform: string
      userCount: number
      percentage: number
    }>
    byProduct: Array<{
      productId: string
      productName: string
      platform: string
      totalUsers: number
      activeUsers: number
      avgProgress: number
      activeRate: number
    }>
  }
}

const finiteOrZero = (value: number): number =>
  Number.isFinite(value) ? value : 0

const finiteCount = (value: number): number =>
  Math.max(0, Math.trunc(finiteOrZero(value)))

const rounded = (value: number): number =>
  Number(finiteOrZero(value).toFixed(1))

const percentage = (count: number, total: number): number =>
  total === 0 ? 0 : rounded((count / total) * 100)

const compareStrings = (left: string, right: string): number => {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

export class UsersV2OverviewAnalyticsService {
  constructor(private readonly reader: UsersV2OverviewAnalyticsReader) {}

  async get(): Promise<UsersV2OverviewAnalyticsResponse> {
    const snapshot = await this.reader.read()
    const totalUsers = finiteCount(snapshot.overview.totalUsers)
    const totalActiveUsers = finiteCount(
      snapshot.overview.totalActiveUsers,
    )
    const totalProducts = finiteCount(snapshot.overview.totalProducts)
    const progressTotal = snapshot.overview.progressByUser.reduce(
      (sum, user) => sum + finiteOrZero(user.averageProgress),
      0,
    )
    const avgProgress = snapshot.overview.progressByUser.length === 0
      ? 0
      : rounded(progressTotal / snapshot.overview.progressByUser.length)
    const byPlatform = snapshot.byPlatform
      .map(({ platform, userCount: rawUserCount }) => {
        const userCount = finiteCount(rawUserCount)
        return {
          platform,
          userCount,
          percentage: percentage(userCount, totalUsers),
        }
      })
      .sort((left, right) => {
        const countDifference = right.userCount - left.userCount
        return countDifference === 0
          ? compareStrings(left.platform, right.platform)
          : countDifference
      })
    const byProduct = snapshot.byProduct
      .map((product) => {
        const productTotalUsers = finiteCount(product.totalUsers)
        const activeUsers = finiteCount(product.activeUsers)
        const progressCount = finiteCount(product.progressCount)
        const rawAverage = progressCount === 0
          ? 0
          : finiteOrZero(product.progressSum) / progressCount

        return {
          productId: product.productId,
          productName: product.productName,
          platform: product.platform,
          totalUsers: productTotalUsers,
          activeUsers,
          avgProgress: rounded(Math.min(100, Math.max(0, rawAverage))),
          activeRate: percentage(activeUsers, productTotalUsers),
        }
      })
      .sort((left, right) => {
        const countDifference = right.totalUsers - left.totalUsers
        return countDifference === 0
          ? compareStrings(left.productId, right.productId)
          : countDifference
      })

    return {
      success: true,
      data: {
        overview: {
          totalUsers,
          totalActiveUsers,
          totalProducts,
          avgProgress,
        },
        byPlatform,
        byProduct,
      },
    }
  }
}
