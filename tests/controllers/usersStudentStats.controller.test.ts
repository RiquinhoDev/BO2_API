import express from 'express'
import request from 'supertest'

const mockFindById = jest.fn()

jest.mock('../../src/models/user', () => ({
  __esModule: true,
  default: {
    findById: mockFindById,
  },
}))

import { getStudentStats } from '../../src/controllers/users.controller'

test('reads student stats from the canonical platform fields', async () => {
  mockFindById.mockResolvedValue({
    _id: 'student-1',
    email: 'student@example.test',
    name: 'Student',
    classId: 'legacy-class',
    discord: { discordIds: ['12345678901234567'] },
    hotmart: {
      purchaseDate: new Date('2026-01-01T00:00:00.000Z'),
      lastAccessDate: new Date('2026-07-01T00:00:00.000Z'),
    },
    combined: {
      status: 'ACTIVE',
      totalProgress: 75,
      classId: 'canonical-class',
    },
  })

  const app = express()
  app.get('/users/:id/stats', getStudentStats)

  const response = await request(app)
    .get('/users/student-1/stats?__bo2_offline_loopback=1')
    .expect(200)

  expect(response.body).toMatchObject({
    hasDiscordIds: true,
    totalDiscordIds: 1,
    isActive: true,
    hasProgress: true,
    progressPercentage: 75,
    hasPurchaseDate: true,
    hasLastAccess: true,
    hasClass: true,
    classId: 'canonical-class',
    validationStatus: {
      email: true,
      discordIds: true,
      name: true,
    },
  })
})
