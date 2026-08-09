import { ActiveCampaignProductTagsService } from '../../../src/services/activeCampaign/activeCampaignProductTags.service'

const user = { email: 'student@example.test', name: 'Student Example' }

describe('ActiveCampaignProductTagsService', () => {
  it('applies the external tag before persisting local state', async () => {
    const events: string[] = []
    const addLocalTag = jest.fn(async () => { events.push('mongo') })
    const service = new ActiveCampaignProductTagsService({
      ensureAvailable: jest.fn(),
      rethrowIntegrationUnavailable: jest.fn(),
      formatError: () => 'error',
      addTag: async () => { events.push('activecampaign') },
      removeTag: async () => true,
      getContactByEmail: async () => null,
      createOrUpdateContact: async () => { throw new Error('not used') },
      repository: {
        findUser: async () => user,
        productExists: async () => true,
        findEnrollment: async () => ({
          tags: [],
          addTag: addLocalTag,
          replaceTags: async () => undefined,
          clearTags: async () => undefined,
        }),
      },
      now: () => new Date('2026-08-09T12:00:00Z'),
    })

    await expect(service.applyTagToUserProduct('user-1', 'product-1', 'member')).resolves.toBe(true)
    expect(events).toEqual(['activecampaign', 'mongo'])
  })

  it('does not duplicate local state when the tag is already recorded', async () => {
    const addLocalTag = jest.fn(async () => undefined)
    const addTag = jest.fn(async () => undefined)
    const service = new ActiveCampaignProductTagsService({
      ensureAvailable: jest.fn(),
      rethrowIntegrationUnavailable: jest.fn(),
      formatError: () => 'error',
      addTag,
      removeTag: async () => true,
      getContactByEmail: async () => null,
      createOrUpdateContact: async () => { throw new Error('not used') },
      repository: {
        findUser: async () => user,
        productExists: async () => true,
        findEnrollment: async () => ({
          tags: ['member'],
          addTag: addLocalTag,
          replaceTags: async () => undefined,
          clearTags: async () => undefined,
        }),
      },
      now: () => new Date('2026-08-09T12:00:00Z'),
    })

    await expect(service.applyTagToUserProduct('user-1', 'product-1', 'member')).resolves.toBe(true)
    expect(addTag).toHaveBeenCalledTimes(1)
    expect(addLocalTag).not.toHaveBeenCalled()
  })

  it('does not call ActiveCampaign when the enrollment is absent during removal', async () => {
    const removeTag = jest.fn(async () => true)
    const service = new ActiveCampaignProductTagsService({
      ensureAvailable: jest.fn(),
      rethrowIntegrationUnavailable: jest.fn(),
      formatError: () => 'error',
      addTag: async () => undefined,
      removeTag,
      getContactByEmail: async () => null,
      createOrUpdateContact: async () => { throw new Error('not used') },
      repository: {
        findUser: async () => user,
        productExists: async () => true,
        findEnrollment: async () => null,
      },
      now: () => new Date('2026-08-09T12:00:00Z'),
    })

    await expect(service.removeTagFromUserProduct('user-1', 'product-1', 'member')).resolves.toBe(false)
    expect(removeTag).not.toHaveBeenCalled()
  })
})
