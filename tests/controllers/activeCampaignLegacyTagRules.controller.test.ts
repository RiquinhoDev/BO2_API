const findMock = jest.fn()
const updateMock = jest.fn()

jest.mock('../../src/models/acTags/TagRule', () => ({
  __esModule: true,
  default: { find: findMock, findByIdAndUpdate: updateMock },
}))

import { getAllTagRules, updateTagRule } from '../../src/controllers/acTags/activeCampaignLegacyTagRules.controller'

type MockResponse = { status: jest.Mock; json: jest.Mock }
function response(): MockResponse {
  const res: MockResponse = { status: jest.fn(), json: jest.fn() }
  res.status.mockReturnValue(res)
  return res
}

describe('ActiveCampaign legacy tag-rule boundary', () => {
  beforeEach(() => jest.clearAllMocks())

  it('preserves the populated priority list envelope', async () => {
    const rules = [{ _id: 'rule-1' }]
    const sort = jest.fn().mockResolvedValue(rules)
    const populate = jest.fn().mockReturnValue({ sort })
    findMock.mockReturnValue({ populate })
    const res = response()
    await getAllTagRules({} as never, res as never, jest.fn())
    expect(populate).toHaveBeenCalledWith('courseId', 'name code')
    expect(sort).toHaveBeenCalledWith({ priority: -1 })
    expect(res.json).toHaveBeenCalledWith({ success: true, count: 1, data: rules })
  })

  it('preserves the update not-found contract', async () => {
    updateMock.mockResolvedValue(null)
    const res = response()
    await updateTagRule({ params: { id: 'missing' }, body: { name: 'x' } } as never, res as never, jest.fn())
    expect(updateMock).toHaveBeenCalledWith('missing', { name: 'x' }, { new: true })
    expect(res.status).toHaveBeenCalledWith(404)
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Regra não encontrada' })
  })
})