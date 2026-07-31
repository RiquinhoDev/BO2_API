import {
  ensureUsersV2Products,
  type UsersV2LegacyGroupedUser,
  type UsersV2LegacyQuery,
  type UsersV2LegacyResponse,
} from '../../contracts/usersV2'
import type { UsersV2EnrollmentService } from './usersV2Enrollment.service'

export interface LegacyUsersByProductReader {
  list(productId: string): Promise<UsersV2LegacyGroupedUser[]>
}

export class UsersV2LegacyService {
  constructor(
    private readonly enrollmentService: Pick<UsersV2EnrollmentService, 'list'>,
    private readonly groupedReader: LegacyUsersByProductReader,
  ) {}

  async list(input: UsersV2LegacyQuery): Promise<UsersV2LegacyResponse> {
    const productId = input.canonical.productId

    if (productId !== undefined) {
      const groupedUsers = await this.groupedReader.list(productId)

      return {
        success: true,
        data: ensureUsersV2Products(groupedUsers),
        pagination: { total: groupedUsers.length },
        filters: { productId },
      }
    }

    const response = await this.enrollmentService.list(input.canonical)

    return {
      success: true,
      data: ensureUsersV2Products(response.data),
      pagination: {
        total: response.pagination.total,
        totalPages: response.pagination.totalPages,
        page: response.pagination.page,
        limit: response.pagination.limit,
      },
      filters: input.responseFilters,
    }
  }
}
