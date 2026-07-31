import type {
  UsersV2EnrollmentFilters,
  UsersV2EnrollmentRow,
} from '../../../src/services/users/usersV2Enrollment.contract'
import type {
  UsersV2EnrollmentListResponse,
  UsersV2EnrollmentService,
} from '../../../src/services/users/usersV2Enrollment.service'
import {
  type LegacyUsersByProductReader,
  UsersV2LegacyService,
} from '../../../src/services/users/usersV2Legacy.service'
import { usersV2LegacyInput } from '../../../src/security/usersV2ListInput'

const row: UsersV2EnrollmentRow = {
  _id: 'enrollment-1',
  userId: {
    _id: 'user-1',
    name: 'Alice',
    email: 'alice@example.test',
    averageEngagement: 77,
    averageEngagementLevel: 'ALTO',
  },
  productId: {
    _id: 'product-1',
    name: 'Course One',
    code: 'course-one',
    platform: 'hotmart',
  },
  platform: 'hotmart',
  status: 'ACTIVE',
  enrolledAt: '2026-07-30T12:00:00.000Z',
  isPrimary: true,
  progress: {
    percentage: 50,
    progressPercentage: 50,
    lastActivity: '2026-07-29T12:00:00.000Z',
  },
  engagement: {
    score: 77,
    level: 'ALTO',
    lastAction: '2026-07-28T12:00:00.000Z',
  },
  averageEngagement: 77,
  averageEngagementLevel: 'ALTO',
}

function enrollmentResponse(
  filters: UsersV2EnrollmentFilters,
): UsersV2EnrollmentListResponse {
  return {
    success: true,
    data: [row],
    pagination: {
      total: 7,
      totalPages: 4,
      page: 2,
      limit: 2,
      unit: 'users',
      returnedRows: 1,
    },
    filters,
  }
}

function createHarness(response: UsersV2EnrollmentListResponse) {
  const enrollmentList = jest.fn<
    ReturnType<UsersV2EnrollmentService['list']>,
    Parameters<UsersV2EnrollmentService['list']>
  >().mockResolvedValue(response)
  const groupedList = jest.fn<
    ReturnType<LegacyUsersByProductReader['list']>,
    Parameters<LegacyUsersByProductReader['list']>
  >().mockResolvedValue([])

  return {
    enrollmentList,
    groupedList,
    service: new UsersV2LegacyService(
      { list: enrollmentList },
      { list: groupedList },
    ),
  }
}

describe('UsersV2LegacyService', () => {
  it('returns the exact flattened legacy envelope and delegates canonical filters once', async () => {
    const parsed = usersV2LegacyInput.parse({
      params: {},
      query: {
        page: '2',
        limit: '2',
        platform: 'HOTMART',
        status: 'ACTIVE',
        search: 'Alice',
        progressLevel: 'MEDIO',
        engagementLevel: 'NONE,ALTO',
        maxEngagement: '80',
        topPercentage: '10',
        lastAccessBefore: '2026-07-30T12:00:00.000Z',
        enrolledAfter: '2026-07-01T00:00:00.000Z',
        benign: 'discard-me',
      },
      body: {},
    })
    const harness = createHarness(enrollmentResponse(parsed.query.canonical))

    await expect(harness.service.list(parsed.query)).resolves.toEqual({
      success: true,
      data: [{ ...row, products: [] }],
      pagination: {
        total: 7,
        totalPages: 4,
        page: 2,
        limit: 2,
      },
      filters: {
        platform: 'HOTMART',
        status: 'ACTIVE',
        search: 'Alice',
        progressLevel: 'MEDIO',
        engagementLevel: 'NONE,ALTO',
        maxEngagement: '80',
        topPercentage: '10',
        lastAccessBefore: '2026-07-30T12:00:00.000Z',
        enrolledAfter: '2026-07-01T00:00:00.000Z',
      },
    })
    expect(harness.enrollmentList).toHaveBeenCalledTimes(1)
    expect(harness.enrollmentList).toHaveBeenCalledWith({
      page: 2,
      limit: 2,
      platform: 'hotmart',
      status: 'ACTIVE',
      search: 'Alice',
      progressLevel: 'MEDIO',
      engagementLevel: ['NONE', 'ALTO'],
      minEngagement: 77,
      maxEngagement: 80,
      lastAccessBefore: '2026-07-30T12:00:00.000Z',
      enrolledAfter: '2026-07-01T00:00:00.000Z',
    })
    expect(harness.groupedList).not.toHaveBeenCalled()
  })

  it('returns only the historical grouped envelope when productId is present', async () => {
    const productId = 'a'.repeat(24)
    const parsed = usersV2LegacyInput.parse({
      params: {},
      query: {
        productId,
        limit: '1',
        status: 'CANCELLED',
        search: 'ignored',
        topPercentage: '10',
      },
      body: {},
    })
    const harness = createHarness(enrollmentResponse(parsed.query.canonical))
    harness.groupedList.mockResolvedValue([{
      _id: 'grouped-user',
      name: 'Grouped User',
      email: 'grouped@example.test',
      status: 'ACTIVE',
      products: [],
    }])

    await expect(harness.service.list(parsed.query)).resolves.toEqual({
      success: true,
      data: [{
        _id: 'grouped-user',
        name: 'Grouped User',
        email: 'grouped@example.test',
        status: 'ACTIVE',
        products: [],
      }],
      pagination: { total: 1 },
      filters: { productId },
    })
    expect(harness.groupedList).toHaveBeenCalledTimes(1)
    expect(harness.groupedList).toHaveBeenCalledWith(productId)
    expect(harness.enrollmentList).not.toHaveBeenCalled()
  })

  it('drops benign, invalid and hostile fields before canonical delegation', async () => {
    const query: Record<string, unknown> = {}
    Object.assign(query, {
      page: 'invalid',
      limit: 'invalid',
      platform: 'unknown',
      status: 'active',
      search: '',
      progressLevel: 'unknown',
      engagementLevel: 'ALTO,unknown',
      maxEngagement: '101',
      lastAccessBefore: 'not-a-date',
      enrolledAfter: 'not-a-date',
      benign: 'discard-me',
      $where: 'discard-me',
      'filter.name': 'discard-me',
    })
    Object.defineProperty(query, '__proto__', {
      enumerable: true,
      value: { polluted: true },
    })
    const parsed = usersV2LegacyInput.parse({
      params: {},
      query,
      body: {},
    })
    const harness = createHarness(enrollmentResponse(parsed.query.canonical))

    await harness.service.list(parsed.query)

    expect(harness.enrollmentList).toHaveBeenCalledTimes(1)
    expect(harness.enrollmentList).toHaveBeenCalledWith({
      page: 1,
      limit: 50,
    })
    expect(parsed.query.responseFilters).toEqual({})
    expect(Object.getOwnPropertyDescriptor(Object.prototype, 'polluted'))
      .toBeUndefined()
  })
})
