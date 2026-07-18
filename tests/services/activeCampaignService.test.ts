const mockFindUserById = jest.fn()
const mockFindUserProduct = jest.fn()
const mockSave = jest.fn()
const consoleError = jest.spyOn(console, 'error').mockImplementation()
const consoleWarn = jest.spyOn(console, 'warn').mockImplementation()

jest.mock('../../src/models', () => ({
  User: {
    findById: mockFindUserById,
  },
  UserProduct: {
    findOne: mockFindUserProduct,
  },
}))

import { activeCampaignService } from '../../src/services/activeCampaign/activeCampaignService'

describe('ActiveCampaignService UserProduct state', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  afterAll(() => {
    consoleError.mockRestore()
    consoleWarn.mockRestore()
  })

  it('initializes tags and lists before saving ActiveCampaign data', async () => {
    const userProduct = {
      activeCampaignData: undefined,
      save: mockSave,
    }

    mockFindUserProduct.mockResolvedValue(userProduct)
    mockFindUserById.mockResolvedValue({
      email: 'student@example.test',
    })
    jest.spyOn(activeCampaignService, 'removeTag').mockResolvedValue(true)

    await expect(
      activeCampaignService.removeTagFromUserProduct(
        'user-id',
        'product-id',
        'tag-to-remove',
      ),
    ).resolves.toBe(true)

    expect(userProduct.activeCampaignData).toEqual({
      tags: [],
      lists: [],
      lastSyncAt: expect.any(Date),
    })
    expect(mockSave).toHaveBeenCalledTimes(1)
  })
})
