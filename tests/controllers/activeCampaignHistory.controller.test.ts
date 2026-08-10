import { Types } from 'mongoose'

const findOneMock = jest.fn()
const historyFindMock = jest.fn()
const countDocumentsMock = jest.fn()
const aggregateMock = jest.fn()

jest.mock('../../src/models/user', () => ({
  __esModule: true,
  default: { findOne: findOneMock },
}))

jest.mock('../../src/models/acTags/CommunicationHistory', () => ({
  __esModule: true,
  default: {
    find: historyFindMock,
    countDocuments: countDocumentsMock,
    aggregate: aggregateMock,
  },
}))

import { getCommunicationHistory } from '../../src/controllers/acTags/activeCampaignHistoryList.controller'
import { getHistoryStats } from '../../src/controllers/acTags/activeCampaignHistoryStats.controller'

type MockResponse = {
  status: jest.Mock
  json: jest.Mock
}

function response(): MockResponse {
  const res: MockResponse = { status: jest.fn(), json: jest.fn() }
  res.status.mockReturnValue(res)
  return res
}

function historyChain(records: unknown[]) {
  const lean = jest.fn().mockResolvedValue(records)
  const limit = jest.fn().mockReturnValue({ lean })
  const skip = jest.fn().mockReturnValue({ limit })
  const sort = jest.fn().mockReturnValue({ skip })
  const populateRule = jest.fn().mockReturnValue({ sort })
  const populateCourse = jest.fn().mockReturnValue({ populate: populateRule })
  const populateUser = jest.fn().mockReturnValue({ populate: populateCourse })
  historyFindMock.mockReturnValue({ populate: populateUser })
  return { populateUser, populateCourse, populateRule, sort, skip, limit, lean }
}

describe('ActiveCampaign communication history boundary', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns the legacy zero envelope when the email has no user', async () => {
    findOneMock.mockResolvedValue(null)
    const res = response()

    await getCommunicationHistory(
      { query: { email: 'Nobody@Example.com', page: '3', limit: '25' } } as never,
      res as never,
      jest.fn(),
    )

    expect(findOneMock).toHaveBeenCalledWith({ email: 'nobody@example.com' })
    expect(historyFindMock).not.toHaveBeenCalled()
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      history: [],
      pagination: { total: 0, page: 1, limit: 25, pages: 0 },
    })
  })

  it('preserves filter precedence, populated mapping, pagination and query chain', async () => {
    const foundUserId = new Types.ObjectId()
    const explicitUserId = new Types.ObjectId()
    const courseId = new Types.ObjectId()
    const ruleId = new Types.ObjectId()
    const recordId = new Types.ObjectId()
    const sentAt = new Date('2026-07-02T03:04:05.000Z')
    const createdAt = new Date('2026-07-01T03:04:05.000Z')
    findOneMock.mockResolvedValue({ _id: foundUserId })
    const chain = historyChain([
      {
        _id: recordId,
        userId: { _id: explicitUserId, name: 'Ana', email: 'ana@example.com' },
        courseId: { _id: courseId, name: 'Clareza', code: 'CLAREZA' },
        tagRuleId: { _id: ruleId, name: 'Regra A', category: 'engagement' },
        tagApplied: 'TAG_A',
        sentAt,
        createdAt,
        source: 'CRON',
        status: 'SENT',
        userStateSnapshot: { currentProgress: 42 },
      },
    ])
    countDocumentsMock.mockResolvedValue(5)
    const res = response()

    await getCommunicationHistory(
      {
        query: {
          email: 'Ana@Example.com',
          userId: explicitUserId.toString(),
          courseId: courseId.toString(),
          action: 'IGNORED_LEGACY_FILTER',
          source: 'CRON',
          tagName: 'vip',
          startDate: '2026-07-01T00:00:00.000Z',
          endDate: '2026-07-31T00:00:00.000Z',
          page: '2',
          limit: '2',
        },
      } as never,
      res as never,
      jest.fn(),
    )

    const expectedFilter = {
      userId: explicitUserId.toString(),
      courseId: courseId.toString(),
      source: 'CRON',
      tagApplied: { $regex: 'vip', $options: 'i' },
      createdAt: {
        $gte: new Date('2026-07-01T00:00:00.000Z'),
        $lte: new Date('2026-07-31T00:00:00.000Z'),
      },
    }
    expect(historyFindMock).toHaveBeenCalledWith(expectedFilter)
    expect(countDocumentsMock).toHaveBeenCalledWith(expectedFilter)
    expect(chain.populateUser).toHaveBeenCalledWith('userId', 'name email')
    expect(chain.populateCourse).toHaveBeenCalledWith('courseId', 'name code')
    expect(chain.populateRule).toHaveBeenCalledWith('tagRuleId', 'name category')
    expect(chain.sort).toHaveBeenCalledWith({ createdAt: -1 })
    expect(chain.skip).toHaveBeenCalledWith(2)
    expect(chain.limit).toHaveBeenCalledWith(2)
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      history: [{
        _id: recordId.toString(),
        userId: explicitUserId.toString(),
        userName: 'Ana',
        userEmail: 'ana@example.com',
        courseId: courseId.toString(),
        courseName: 'Clareza',
        tagApplied: 'TAG_A',
        tagId: ruleId.toString(),
        appliedAt: sentAt,
        reason: 'progresso 42%, (Regra A)',
        source: 'CRON',
        status: 'SENT',
        userStateSnapshot: { currentProgress: 42 },
      }],
      pagination: { total: 5, page: 2, limit: 2, pages: 3 },
    })
  })

  it('uses the stable fallback when history fails with an empty Error message', async () => {
    historyFindMock.mockImplementation(() => { throw new Error('') })
    const res = response()
    const next = jest.fn()
    await getCommunicationHistory({ query: {} } as never, res as never, next)
    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      status: 500,
      code: 'AC_HISTORY_LIST_FAILED',
      publicMessage: 'Erro ao buscar histórico',
    }))
    expect(res.status).not.toHaveBeenCalled()
    expect(res.json).not.toHaveBeenCalled()
  })

  it('preserves the timestamp aggregation and zero-total envelope', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-09T12:00:00.000Z'))
    aggregateMock.mockResolvedValue([{
      totals: [], byAction: [], bySource: [], byDay: [], topTags: [], topRules: [],
    }])
    const res = response()

    await getHistoryStats({ query: { days: '7' } } as never, res as never, jest.fn())

    const pipeline = aggregateMock.mock.calls[0][0]
    expect(pipeline[0]).toEqual({
      $match: { timestamp: { $gte: new Date('2026-08-02T12:00:00.000Z') } },
    })
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      period: {
        days: 7,
        since: '2026-08-02T12:00:00.000Z',
        until: '2026-08-09T12:00:00.000Z',
      },
      totals: { total: 0, tagsAdded: 0, tagsRemoved: 0, emailsSent: 0, uniqueUsers: 0 },
      byAction: [], bySource: [], byDay: [], topTags: [], topRules: [],
    })
    jest.useRealTimers()
  })

  it('uses the stable fallback when aggregation fails with an empty Error message', async () => {
    aggregateMock.mockRejectedValue(new Error(''))
    const res = response()
    const next = jest.fn()
    await getHistoryStats({ query: {} } as never, res as never, next)
    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      status: 500,
      code: 'AC_HISTORY_STATS_FAILED',
      publicMessage: 'Erro ao calcular estatísticas',
    }))
    expect(res.status).not.toHaveBeenCalled()
    expect(res.json).not.toHaveBeenCalled()
  })
})
