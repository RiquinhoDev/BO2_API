const mockFindUser = jest.fn()
const mockFindHistory = jest.fn()
const mockCountHistory = jest.fn()

jest.mock('../../src/models/user', () => ({
  __esModule: true,
  default: { findById: mockFindUser },
}))

jest.mock('../../src/models/UserHistory', () => ({
  __esModule: true,
  default: {
    find: mockFindHistory,
    countDocuments: mockCountHistory,
  },
}))

import express from 'express'
import request from 'supertest'
import { getStudentHistory } from '../../src/controllers/studentHistory.controller'

const offline = '__bo2_offline_loopback=1'
const userId = '507f1f77bcf86cd799439011'

function appForStudents() {
  const app = express()
  app.get('/students/:userId/history', getStudentHistory)
  return app
}

describe('ARCH03 paired wave A student-history contract', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('moves student-history pagination beside execution metadata', async () => {
    mockFindUser.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          email: 'ana@example.test',
          name: 'Ana',
        }),
      }),
    })
    mockFindHistory.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        skip: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue([]),
          }),
        }),
      }),
    })
    mockCountHistory.mockResolvedValue(3)

    const response = await request(appForStudents())
      .get(`/students/${userId}/history?limit=2&offset=0&${offline}`)
      .expect(200)

    expect(response.body).toEqual({
      success: true,
      data: {
        user: {
          _id: userId,
          email: 'ana@example.test',
          name: 'Ana',
        },
        history: [],
        groupedHistory: [],
      },
      meta: {
        pagination: {
          total: 3,
          limit: 2,
          offset: 0,
          hasMore: true,
        },
        executionTime: expect.any(Number),
        totalRecords: 3,
      },
    })
  })
})
