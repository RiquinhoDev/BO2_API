import express from 'express'
import request from 'supertest'
import { createErrorHandling } from '../../src/security/errorHandling'
import { usersV2LegacyInput } from '../../src/security/usersV2ListInput'
import { withValidatedInput } from '../../src/security/validatedInput'
import {
  resetRuntimeConfigForTests,
  useTestRuntimeConfig,
} from '../support/runtimeConfig'

const mockGetUsersForProduct = jest.fn()
const mockEnrollmentRead = jest.fn()

jest.mock('../../src/services/userProducts/userProductService', () => ({
  getUsersForProduct: mockGetUsersForProduct,
}))

jest.mock('../../src/services/users/mongooseUsersV2Enrollment.reader', () => ({
  MongooseUsersV2EnrollmentReader: jest.fn().mockImplementation(() => ({
    read: mockEnrollmentRead,
  })),
}))

jest.mock(
  '../../src/services/users/mongooseUsersV2OverviewAnalytics.reader',
  () => ({
    MongooseUsersV2OverviewAnalyticsReader: jest.fn(),
  }),
)

import { getUsersV2Legacy } from '../../src/services/users/usersV2List.runtime'

function createApp() {
  const app = express()
  const errors = createErrorHandling({
    generateCorrelationId: () => 'users-v2-legacy-request-id',
    logError: () => undefined,
  })

  app.use(errors.correlationId)
  app.get(
    '/users',
    withValidatedInput(usersV2LegacyInput, getUsersV2Legacy),
  )
  app.use(errors.handler)
  return app
}

const enrollmentRow = {
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
  enrolledAt: new Date('2026-07-30T12:00:00.000Z'),
  isPrimary: true,
  progress: {
    percentage: 50,
    progressPercentage: 50,
    lastActivity: new Date('2026-07-29T12:00:00.000Z'),
  },
  engagement: {
    score: 77,
    level: 'ALTO',
    lastAction: new Date('2026-07-28T12:00:00.000Z'),
  },
  averageEngagement: 77,
  averageEngagementLevel: 'ALTO',
}

beforeEach(() => {
  useTestRuntimeConfig()
  jest.clearAllMocks()
  mockEnrollmentRead.mockResolvedValue({
    totalUsers: 1,
    rows: [enrollmentRow],
  })
})

afterEach(() => {
  resetRuntimeConfigForTests()
})

describe('legacy users V2 list boundary', () => {
  it('keeps flattened rows, old pagination and empty products compatibility without a product filter', async () => {
    const response = await request(createApp())
      .get('/users?limit=10000&benign=x&__bo2_offline_loopback=1')

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      success: true,
      data: [{
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
        products: [],
      }],
      pagination: {
        total: 1,
        totalPages: 1,
        page: 1,
        limit: 100,
      },
      filters: {},
    })
    expect(response.body.filters).not.toHaveProperty('benign')
    expect(mockEnrollmentRead).toHaveBeenCalledTimes(1)
    expect(mockEnrollmentRead).toHaveBeenCalledWith({
      page: 1,
      limit: 100,
    })
  })

  it('keeps the no-query legacy pagination default at 50', async () => {
    const response = await request(createApp())
      .get('/users?__bo2_offline_loopback=1')

    expect(response.status).toBe(200)
    expect(response.body.pagination).toEqual({
      total: 1,
      totalPages: 1,
      page: 1,
      limit: 50,
    })
  })

  it('applies score 77 whenever topPercentage is present', async () => {
    const response = await request(createApp())
      .get('/users?topPercentage=0&__bo2_offline_loopback=1')

    expect(response.status).toBe(200)
    expect(mockEnrollmentRead).toHaveBeenCalledTimes(1)
    expect(mockEnrollmentRead).toHaveBeenCalledWith({
      page: 1,
      limit: 50,
      minEngagement: 77,
    })
    expect(response.body.filters).toEqual({ topPercentage: '0' })
    expect(response.body.filters).not.toHaveProperty('minEngagement')
  })

  it('returns grouped product users with compatibility products and ignores other filters', async () => {
    mockGetUsersForProduct.mockResolvedValue([{ _id: 'grouped-user' }])
    const productId = 'a'.repeat(24)

    const response = await request(createApp())
      .get(`/users?productId=${productId}&limit=1&status=CANCELLED&__bo2_offline_loopback=1`)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      success: true,
      data: [{ _id: 'grouped-user', products: [] }],
      pagination: { total: 1 },
      filters: { productId },
    })
    expect(mockEnrollmentRead).not.toHaveBeenCalled()
  })

  it('ignores invalid optional and benign unknown query keys', async () => {
    const response = await request(createApp())
      .get(
        '/users?platform=unknown&status=active&maxEngagement=101'
        + '&benign=x&__bo2_offline_loopback=1',
      )

    expect(response.status).toBe(200)
    expect(mockEnrollmentRead).toHaveBeenCalledTimes(1)
    expect(mockEnrollmentRead).toHaveBeenCalledWith({
      page: 1,
      limit: 50,
    })
    expect(response.body.filters).toEqual({})
  })

  it.each([
    { '$where': 'x' },
    { 'filter.name': 'x' },
  ])('rejects hostile query before delegation', async (query) => {
    const response = await request(createApp())
      .get('/users')
      .query({ ...query, __bo2_offline_loopback: '1' })

    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({
      success: false,
      code: 'INVALID_REQUEST',
      correlationId: 'users-v2-legacy-request-id',
    })
    expect(mockEnrollmentRead).not.toHaveBeenCalled()
    expect(mockGetUsersForProduct).not.toHaveBeenCalled()
  })
})
