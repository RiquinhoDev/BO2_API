import express from 'express'
import request from 'supertest'

const mockUserFind = jest.fn()
const mockUserProductFind = jest.fn()
const mockUserProductUpdate = jest.fn()

jest.mock('../../src/models/user', () => ({
  __esModule: true,
  default: {
    find: mockUserFind,
    findByIdAndUpdate: jest.fn(),
    findOne: jest.fn(),
  },
}))

jest.mock('../../src/models/UserProduct', () => ({
  __esModule: true,
  default: {
    find: mockUserProductFind,
    findByIdAndUpdate: mockUserProductUpdate,
  },
}))

jest.mock('../../src/services/guru/guruSync.service', () => ({
  fetchAllSubscriptionsComplete: jest.fn(),
}))

import { compareGuruVsClareza } from '../../src/controllers/guru.analytics.controller'

function leanQuery(rows: object[]) {
  return {
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue(rows),
    }),
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockUserFind.mockReturnValue(leanQuery([]))
  mockUserProductUpdate.mockResolvedValue({})
})

test('moves a suspended CursEduca enrollment out of PARA_INATIVAR', async () => {
  const pendingEnrollment = {
    _id: '507f1f77bcf86cd799439011',
    platformUserId: 'member-1',
    userId: {
      _id: '507f1f77bcf86cd799439012',
      email: 'student@example.test',
      name: 'Student',
      guru: { status: 'canceled' },
      curseduca: {
        situation: 'SUSPENDED',
        memberStatus: 'ACTIVE',
      },
    },
  }

  mockUserProductFind
    .mockReturnValueOnce({
      populate: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      }),
    })
    .mockReturnValueOnce({
      populate: jest.fn().mockResolvedValue([pendingEnrollment]),
    })

  const app = express()
  app.get('/compare', compareGuruVsClareza)

  const response = await request(app)
    .get('/compare?__bo2_offline_loopback=1')

  expect(response.status).toBe(200)
  expect(mockUserProductUpdate).toHaveBeenCalledWith(
    pendingEnrollment._id,
    expect.objectContaining({
      $set: expect.objectContaining({ status: 'INACTIVE' }),
    }),
  )
})
