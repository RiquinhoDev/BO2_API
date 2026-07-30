import {
  UsersV2EnrollmentService,
} from '../../../src/services/users/usersV2Enrollment.service'
import type {
  UsersV2EnrollmentFilters,
  UsersV2EnrollmentReader,
  UsersV2EnrollmentRow,
} from '../../../src/services/users/usersV2Enrollment.contract'

const canonicalFilters: UsersV2EnrollmentFilters = {
  page: 2,
  limit: 1,
  platform: 'hotmart',
  productId: '507f1f77bcf86cd799439011',
  status: 'ACTIVE',
  search: 'a+b',
  progressLevel: 'MEDIO',
  engagementLevel: ['NONE', 'ALTO'],
  minEngagement: 20,
  maxEngagement: 80,
  lastAccessBefore: '2026-07-30T12:00:00.000Z',
  enrolledAfter: '2026-07-01T00:00:00.000Z',
}

const row = (
  enrollmentId: string,
  productId: string,
): UsersV2EnrollmentRow => ({
  _id: enrollmentId,
  userId: {
    _id: 'user-1',
    name: 'Alice',
    email: 'alice@example.test',
    averageEngagement: 60,
    averageEngagementLevel: 'ALTO',
  },
  productId: {
    _id: productId,
    name: `Product ${productId}`,
    code: productId.toUpperCase(),
    platform: 'hotmart',
  },
  platform: 'hotmart',
  status: 'ACTIVE',
  enrolledAt: new Date('2026-07-20T00:00:00.000Z'),
  isPrimary: true,
  progress: {
    percentage: 50,
    progressPercentage: 50,
    lastActivity: new Date('2026-07-29T00:00:00.000Z'),
  },
  engagement: {
    score: 60,
    level: 'ALTO',
    lastAction: new Date('2026-07-28T00:00:00.000Z'),
  },
  averageEngagement: 60,
  averageEngagementLevel: 'ALTO',
})

function createHarness(
  result: Awaited<ReturnType<UsersV2EnrollmentReader['read']>>,
): {
  service: UsersV2EnrollmentService
  read: jest.MockedFunction<UsersV2EnrollmentReader['read']>
} {
  const read = jest.fn<
    ReturnType<UsersV2EnrollmentReader['read']>,
    Parameters<UsersV2EnrollmentReader['read']>
  >().mockResolvedValue(result)

  return {
    service: new UsersV2EnrollmentService({ read }),
    read,
  }
}

describe('UsersV2EnrollmentService', () => {
  it('returns a stable user-paginated envelope while one user expands to two rows', async () => {
    const rows = [
      row('enrollment-1', 'product-1'),
      row('enrollment-2', 'product-2'),
    ]
    const harness = createHarness({
      totalUsers: 3,
      rows,
    })

    await expect(harness.service.list(canonicalFilters)).resolves.toEqual({
      success: true,
      data: rows,
      pagination: {
        total: 3,
        totalPages: 3,
        page: 2,
        limit: 1,
        unit: 'users',
        returnedRows: 2,
      },
      filters: canonicalFilters,
    })
    expect(harness.read).toHaveBeenCalledTimes(1)
    expect(harness.read).toHaveBeenCalledWith(canonicalFilters)
  })

  it('returns finite zero pagination and an empty row list', async () => {
    const filters: UsersV2EnrollmentFilters = { page: 1, limit: 50 }
    const harness = createHarness({ totalUsers: 0, rows: [] })

    await expect(harness.service.list(filters)).resolves.toEqual({
      success: true,
      data: [],
      pagination: {
        total: 0,
        totalPages: 0,
        page: 1,
        limit: 50,
        unit: 'users',
        returnedRows: 0,
      },
      filters,
    })
    expect(harness.read).toHaveBeenCalledTimes(1)
    expect(harness.read).toHaveBeenCalledWith(filters)
  })
})
