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

  it('loads every contact page for all-contact monitoring', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      id: `contact-${index}`,
      email: `student-${index}@example.test`,
      firstName: `Student ${index}`,
      lastName: 'Example',
      cdate: '2026-07-18T00:00:00Z',
      udate: '2026-07-18T00:00:00Z',
    }))
    const secondPage = [{
      id: 'contact-100',
      email: 'student-100@example.test',
      firstName: 'Student 100',
      lastName: 'Example',
      cdate: '2026-07-18T00:00:00Z',
      udate: '2026-07-18T00:00:00Z',
    }]
    const get = jest.spyOn(activeCampaignService.client, 'get')
      .mockResolvedValueOnce({ data: { contacts: firstPage } })
      .mockResolvedValueOnce({ data: { contacts: secondPage } })

    const contacts = await activeCampaignService.getAllContacts()

    expect(contacts).toHaveLength(101)
    expect(get).toHaveBeenNthCalledWith(1, '/api/3/contacts', {
      params: { limit: 100, offset: 0 },
    })
    expect(get).toHaveBeenNthCalledWith(2, '/api/3/contacts', {
      params: { limit: 100, offset: 100 },
    })
  })
})
