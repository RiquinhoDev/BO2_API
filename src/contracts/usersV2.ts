import type {
  UsersV2EnrollmentFilters,
  UsersV2EnrollmentRow,
} from '../services/users/usersV2Enrollment.contract'

interface OptionalProducts {
  products?: unknown
}

function hasOptionalProducts(value: object): value is object & OptionalProducts {
  return 'products' in value
}

export function ensureUsersV2Products<T extends object>(
  items: readonly T[],
): Array<T & { products: unknown[] }> {
  return items.map((item) => {
    const products = hasOptionalProducts(item) ? item.products : undefined
    return {
      ...item,
      products: Array.isArray(products) ? products : [],
    }
  })
}

export interface UsersV2LegacyResponseFilters {
  platform?: string
  productId?: string
  status?: string
  search?: string
  progressLevel?: string
  engagementLevel?: string
  maxEngagement?: string
  topPercentage?: string
  lastAccessBefore?: string
  enrolledAfter?: string
}

export interface UsersV2LegacyQuery {
  canonical: UsersV2EnrollmentFilters
  responseFilters: UsersV2LegacyResponseFilters
}

export interface UsersV2LegacyGroupedProduct {
  _id: unknown
  product: unknown
  platform?: string
  status?: string
  enrolledAt?: unknown
  isPrimary?: boolean
  progress: {
    percentage: number
    lastActivity?: unknown
  }
  engagement: {
    score: number
    level: string
    lastAction?: unknown
  }
}

export interface UsersV2LegacyGroupedUser {
  _id: unknown
  name: string
  email: string
  status: string
  products: UsersV2LegacyGroupedProduct[]
}

export interface UsersV2LegacyFlatResponse {
  success: true
  data: Array<UsersV2EnrollmentRow & { products: unknown[] }>
  pagination: {
    total: number
    totalPages: number
    page: number
    limit: number
  }
  filters: UsersV2LegacyResponseFilters
}

export interface UsersV2LegacyGroupedResponse {
  success: true
  data: Array<UsersV2LegacyGroupedUser & { products: unknown[] }>
  pagination: {
    total: number
  }
  filters: {
    productId: string
  }
}

export type UsersV2LegacyResponse =
  | UsersV2LegacyFlatResponse
  | UsersV2LegacyGroupedResponse
