import type {
  UsersV2EnrollmentFilters,
  UsersV2EnrollmentReader,
  UsersV2EnrollmentRow,
} from './usersV2Enrollment.contract'

export interface UsersV2EnrollmentListResponse {
  success: true
  data: UsersV2EnrollmentRow[]
  pagination: {
    total: number
    totalPages: number
    page: number
    limit: number
    unit: 'users'
    returnedRows: number
  }
  filters: UsersV2EnrollmentFilters
}

export class UsersV2EnrollmentService {
  constructor(private readonly reader: UsersV2EnrollmentReader) {}

  async list(
    filters: UsersV2EnrollmentFilters,
  ): Promise<UsersV2EnrollmentListResponse> {
    const result = await this.reader.read(filters)

    return {
      success: true,
      data: result.rows,
      pagination: {
        total: result.totalUsers,
        totalPages: Math.ceil(result.totalUsers / filters.limit),
        page: filters.page,
        limit: filters.limit,
        unit: 'users',
        returnedRows: result.rows.length,
      },
      filters,
    }
  }
}
