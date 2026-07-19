import express from 'express'
import request from 'supertest'

const mockFindCourse = jest.fn()
const mockFindProducts = jest.fn()
const mockEvaluateProduct = jest.fn()

jest.mock('../../src/models/user', () => ({
  __esModule: true,
  default: {},
}))

jest.mock('../../src/models/cron/CronExecutionLog', () => ({
  __esModule: true,
  default: {},
}))

jest.mock('../../src/models/acTags/TagRule', () => ({
  __esModule: true,
  default: {},
}))

jest.mock('../../src/models', () => ({
  CommunicationHistory: {},
  Course: {
    findOne: mockFindCourse,
  },
  Product: {
    find: mockFindProducts,
  },
  UserProduct: {},
}))

jest.mock('../../src/services/activeCampaign/activeCampaignService', () => ({
  __esModule: true,
  default: {},
}))

jest.mock('../../src/services/activeCampaign/decisionEngine.service', () => ({
  __esModule: true,
  default: {
    evaluateAllUsersOfProduct: mockEvaluateProduct,
  },
}))

import {
  evaluateClarezaRules,
  evaluateOGIRules,
} from '../../src/controllers/acTags/activecampaign.controller'

const result = (
  userId: string,
  additions: string[],
  removals: string[],
  errors: string[] = [],
) => ({
  userId,
  productId: 'product',
  productCode: 'COURSE',
  currentLevel: 0,
  appropriateLevel: 0,
  inCooldown: false,
  decisions: [],
  tagsToApply: additions,
  tagsToRemove: removals,
  actionsExecuted: 0,
  errors,
})

describe.each([
  {
    name: 'Clareza',
    path: '/clareza/evaluate',
    handler: evaluateClarezaRules,
    course: { _id: 'course-clareza' },
  },
  {
    name: 'OGI',
    path: '/ogi/evaluate',
    handler: evaluateOGIRules,
    course: { _id: 'course-ogi' },
  },
])('$name course evaluation preview', ({ path, handler, course }) => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockFindCourse.mockResolvedValue(course)
    mockFindProducts.mockReturnValue({
      select: jest.fn().mockResolvedValue([
        { _id: { toString: () => 'product-1' } },
        { _id: { toString: () => 'product-2' } },
      ]),
    })
    mockEvaluateProduct
      .mockResolvedValueOnce([
        result('student-1', ['ADD_1', 'ADD_2'], ['REMOVE_1']),
      ])
      .mockResolvedValueOnce([
        result('student-1', ['ADD_3'], [], ['rule failed']),
        result('student-2', [], ['REMOVE_2', 'REMOVE_3']),
      ])
  })

  it('aggregates real dry-run proposals without counting a student twice', async () => {
    const app = express()
    app.post(path, handler)

    const response = await request(app)
      .post(`${path}?__bo2_offline_loopback=1`)
      .send({})

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      success: true,
      studentsEvaluated: 2,
      proposedAdditions: 3,
      proposedRemovals: 3,
      errors: 1,
    })
    expect(mockFindProducts).toHaveBeenCalledWith({
      courseId: course._id,
      isActive: true,
    })
    expect(mockEvaluateProduct).toHaveBeenNthCalledWith(1, 'product-1', true)
    expect(mockEvaluateProduct).toHaveBeenNthCalledWith(2, 'product-2', true)
  })
})
