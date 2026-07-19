import express from 'express'
import request from 'supertest'

const mockCountDocuments = jest.fn()
const mockLean = jest.fn()
const mockSelect = jest.fn(() => ({ lean: mockLean }))
const mockFind = jest.fn()
const mockFindByIdAndUpdate = jest.fn()
const mockGetEngagementStatsByPlatform = jest.fn()

jest.mock('../../src/models/user', () => ({
  __esModule: true,
  default: {
    countDocuments: mockCountDocuments,
    find: mockFind,
    findByIdAndUpdate: mockFindByIdAndUpdate,
  },
}))

jest.mock(
  '../../src/services/syncUtilizadoresServices/engagement/engagementService',
  () => ({
    getEngagementStatsByPlatform: mockGetEngagementStatsByPlatform,
  }),
)

import {
  getMultiPlatformAnalytics,
  recalculateIndividualScores,
} from '../../src/controllers/analytics.controller'

describe('analytics multi-platform', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockFind.mockReturnValue({ select: mockSelect })
    mockCountDocuments
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)
    mockLean.mockResolvedValue([
      {
        hotmart: { hotmartUserId: 'hotmart-1' },
        curseducaUserId: 'legacy-curseduca-1',
      },
      {
        discord: { discordIds: ['discord-1'] },
      },
    ])
    mockGetEngagementStatsByPlatform.mockResolvedValue({
      hotmart: { total: 1, sum: 80, avg: 80 },
      curseduca: { total: 1, sum: 70, avg: 70 },
      combined: { total: 2, sum: 150, avg: 75 },
    })
  })

  it('preserves legacy source IDs and applies both non-empty filters', async () => {
    const app = express()
    app.get('/multi-platform', getMultiPlatformAnalytics)

    const response = await request(app)
      .get('/multi-platform?__bo2_offline_loopback=1')
      .expect(200)

    expect(response.body.platformStats.multiPlatformUsers).toBe(1)
    expect(mockCountDocuments).toHaveBeenCalledWith(
      expect.objectContaining({
        $or: expect.arrayContaining([
          {
            'hotmart.hotmartUserId': {
              $exists: true,
              $nin: [null, ''],
            },
          },
        ]),
      }),
    )
    expect(mockCountDocuments).toHaveBeenCalledWith(
      expect.objectContaining({
        $or: expect.arrayContaining([
          {
            'curseduca.curseducaUserId': {
              $exists: true,
              $nin: [null, ''],
            },
          },
        ]),
      }),
    )
    expect(mockSelect).toHaveBeenCalledWith(
      'hotmart curseduca discord hotmartUserId curseducaUserId discordIds',
    )
  })

  it('persists recalculated scores in the canonical combined fields', async () => {
    mockFind.mockResolvedValueOnce([{
      _id: 'student-1',
      email: 'student@example.test',
      name: 'Student',
      combined: {
        combinedEngagement: 20,
        totalProgress: 50,
        engagement: { level: 'BAIXO' },
      },
      hotmart: {
        engagement: { accessCount: 5 },
      },
    }])
    mockFindByIdAndUpdate.mockResolvedValueOnce({})

    const app = express()
    app.post('/class/:classId/recalculate-individual', recalculateIndividualScores)

    await request(app)
      .post('/class/class-1/recalculate-individual?__bo2_offline_loopback=1')
      .expect(200)

    expect(mockFindByIdAndUpdate).toHaveBeenCalledWith('student-1', {
      'combined.combinedEngagement': expect.any(Number),
      'combined.engagement.score': expect.any(Number),
      'combined.engagement.level': expect.any(String),
      'combined.calculatedAt': expect.any(Date),
      'metadata.updatedAt': expect.any(Date),
    })
  })
})
