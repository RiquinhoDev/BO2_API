import type { ActiveCampaignIntegration } from '../../../src/config/configTypes'
import { ActiveCampaignContactsService } from '../../../src/services/activeCampaign/activeCampaignContacts.service'
import { ActiveCampaignTagsService } from '../../../src/services/activeCampaign/activeCampaignTags.service'
import { ActiveCampaignTransport } from '../../../src/services/activeCampaign/activeCampaignTransport'

const integration: ActiveCampaignIntegration = {
  apiUrl: 'https://ac.example.test/',
  apiKey: 'test-key',
  webhookSecret: 'test-secret',
  debugEnabled: false,
  verifyDeleteEnabled: false,
  lists: {},
}

const existingContact = {
  contact: {
    id: 'contact-1',
    email: 'student@example.test',
    firstName: 'Student',
    lastName: 'Example',
    cdate: '2026-01-01T00:00:00Z',
    udate: '2026-01-01T00:00:00Z',
  },
}

describe('ActiveCampaignTagsService', () => {
  const transport = new ActiveCampaignTransport({
    readIntegration: () => integration,
    sleep: async () => undefined,
  })
  const contacts = new ActiveCampaignContactsService(transport)

  afterEach(() => jest.restoreAllMocks())

  it('returns the existing association without posting a duplicate', async () => {
    jest.spyOn(contacts, 'getContactByEmail').mockResolvedValue(existingContact)
    jest.spyOn(transport.client, 'get')
      .mockResolvedValueOnce({ data: { tags: [{ id: 'tag-1', tag: 'member' }] } })
      .mockResolvedValueOnce({ data: { contactTags: [{ id: 'link-1', tag: 'tag-1' }] } })
    const post = jest.spyOn(transport.client, 'post')
    const service = new ActiveCampaignTagsService(transport, contacts)

    await expect(service.addTag('student@example.test', 'member')).resolves.toEqual({
      contactTag: { id: 'link-1', contact: 'contact-1', tag: 'tag-1' },
    })
    expect(post).not.toHaveBeenCalled()
  })

  it('treats an absent tag as already removed', async () => {
    jest.spyOn(contacts, 'getContactByEmail').mockResolvedValue(existingContact)
    jest.spyOn(transport.client, 'get').mockResolvedValue({ data: { tags: [] } })
    const remove = jest.spyOn(transport.client, 'delete')
    const service = new ActiveCampaignTagsService(transport, contacts)

    await expect(service.removeTag('student@example.test', 'missing')).resolves.toBe(true)
    expect(remove).not.toHaveBeenCalled()
  })
})
