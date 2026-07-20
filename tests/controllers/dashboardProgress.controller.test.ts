import express from 'express'
import request from 'supertest'

const mockAggregate = jest.fn()

jest.mock('../../src/models/UserProduct', () => ({
  __esModule: true,
  default: { aggregate: mockAggregate },
}))

jest.mock('../../src/models/product/Product', () => ({
  __esModule: true,
  default: {},
}))

jest.mock('../../src/models/user', () => ({
  __esModule: true,
  default: {},
}))

jest.mock('../../src/services/syncUtilizadoresServices/dualReadService', () => ({
  getAllUsersUnified: jest.fn(),
}))

import { getDashboardStats } from '../../src/controllers/dashboard.controller'

it('filters and averages dashboard progress through UserProduct progress.percentage', async () => {
  mockAggregate.mockResolvedValue([{
    totalStudents: 1,
    avgEngagement: 80,
    avgProgress: 60,
    activeStudents: 1,
    totalEnrollments: 1,
  }])

  const app = express()
  app.get('/stats', getDashboardStats)

  const response = await request(app)
    .get('/stats?progressMin=20&progressMax=80&__bo2_offline_loopback=1')

  expect(response.status).toBe(200)
  const pipeline = mockAggregate.mock.calls[0][0]
  expect(pipeline[0]).toEqual({
    $match: {
      'progress.percentage': { $gte: 20, $lte: 80 },
    },
  })
  expect(pipeline[1].$group.avgProgress).toEqual({ $avg: '$progress.percentage' })
})
