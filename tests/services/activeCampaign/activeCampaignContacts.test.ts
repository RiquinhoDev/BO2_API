import { ActiveCampaignContactsService } from '../../../src/services/activeCampaign/activeCampaignContacts.service'
import { ActiveCampaignTransport } from '../../../src/services/activeCampaign/activeCampaignTransport'
import type { ActiveCampaignIntegration } from '../../../src/config/configTypes'
import type { ACContactApi } from '../../../src/types/activecampaign.types'

const integration: ActiveCampaignIntegration = {
  apiUrl: 'https://ac.example.test/',
  apiKey: 'test-key',
  webhookSecret: 'test-secret',
  debugEnabled: false,
  verifyDeleteEnabled: false,
  lists: {},
}

const contact = (id: string): ACContactApi => ({
  id,
  email: `${id}@example.test`,
  firstName: id,
  lastName: 'Student',
  cdate: '2026-01-01T00:00:00Z',
  udate: '2026-01-01T00:00:00Z',
})

describe('ActiveCampaignContactsService', () => {
  const transport = new ActiveCampaignTransport({
    readIntegration: () => integration,
    sleep: async () => undefined,
  })

  afterEach(() => jest.restoreAllMocks())

  it('loads pages until the first short page', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => contact(`contact-${index}`))
    const secondPage = [contact('contact-100')]
    const get = jest.spyOn(transport.client, 'get')
      .mockResolvedValueOnce({ data: { contacts: firstPage } })
      .mockResolvedValueOnce({ data: { contacts: secondPage } })
    const service = new ActiveCampaignContactsService(transport)

    await expect(service.getAllContacts()).resolves.toHaveLength(101)
    expect(get).toHaveBeenNthCalledWith(1, '/api/3/contacts', {
      params: { limit: 100, offset: 0 },
    })
    expect(get).toHaveBeenNthCalledWith(2, '/api/3/contacts', {
      params: { limit: 100, offset: 100 },
    })
  })

  it('updates an existing contact instead of creating another', async () => {
    const existing = contact('contact-1')
    jest.spyOn(transport.client, 'get').mockResolvedValue({ data: { contacts: [existing] } })
    const put = jest.spyOn(transport.client, 'put').mockResolvedValue({ data: { contact: existing } })
    const post = jest.spyOn(transport.client, 'post')
    const service = new ActiveCampaignContactsService(transport)

    await expect(service.createOrUpdateContact({ email: existing.email })).resolves.toEqual({ contact: existing })
    expect(put).toHaveBeenCalledWith('/api/3/contacts/contact-1', {
      contact: { email: existing.email },
    })
    expect(post).not.toHaveBeenCalled()
  })

  it('does not create a contact when a custom field target is absent', async () => {
    jest.spyOn(transport.client, 'get').mockResolvedValue({ data: { contacts: [] } })
    const post = jest.spyOn(transport.client, 'post')
    const service = new ActiveCampaignContactsService(transport)

    await expect(service.updateContactField('missing@example.test', 12, 'value')).resolves.toBe(false)
    expect(post).not.toHaveBeenCalled()
  })
})
