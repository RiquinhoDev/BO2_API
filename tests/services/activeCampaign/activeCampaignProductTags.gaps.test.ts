import { ActiveCampaignContactsService } from '../../../src/services/activeCampaign/activeCampaignContacts.service'
import { ActiveCampaignTagsService } from '../../../src/services/activeCampaign/activeCampaignTags.service'
import { ActiveCampaignTransport } from '../../../src/services/activeCampaign/activeCampaignTransport'

type ContactTagLink = { id: string; tag: string }

function harness(blockConcurrentReads = false) {
  const links: ContactTagLink[] = []
  let contactTagReads = 0
  let releaseConcurrentReads: () => void = () => undefined
  const concurrentReads = new Promise<void>((resolve) => {
    releaseConcurrentReads = resolve
  })
  const client = {
    get: jest.fn(async (path: string) => {
      if (path === '/api/3/tags') {
        return { data: { tags: [{ id: 'tag-1', tag: 'COURSE - Active' }] } }
      }
      if (path === '/api/3/contacts/contact-1/contactTags') {
        if (blockConcurrentReads) {
          contactTagReads += 1
          if (contactTagReads === 2) releaseConcurrentReads()
          await concurrentReads
        }
        return { data: { contactTags: [...links] } }
      }
      throw new Error(`Unexpected GET ${path}`)
    }),
    post: jest.fn(async () => {
      const link = { id: `link-${links.length + 1}`, tag: 'tag-1' }
      links.push(link)
      return { data: { contactTag: { id: link.id, contact: 'contact-1', tag: 'tag-1' } } }
    }),
    delete: jest.fn(async () => ({ data: {} })),
  }

  const transport = new ActiveCampaignTransport({
    readIntegration: () => ({
      apiUrl: 'https://activecampaign.invalid',
      apiKey: 'offline-key',
      webhookSecret: 'offline-secret',
      debugEnabled: false,
      verifyDeleteEnabled: false,
      lists: {},
    }),
    sleep: async () => undefined,
  })
  jest.spyOn(transport, 'checkRateLimit').mockResolvedValue(undefined)
  Object.defineProperty(transport, 'client', {
    configurable: true,
    get: () => client,
  })

  const contacts = new ActiveCampaignContactsService(transport)
  jest.spyOn(contacts, 'getContactByEmail').mockResolvedValue({
    contact: {
      id: 'contact-1',
      email: 'student@example.test',
      firstName: 'Student',
      lastName: 'Example',
      cdate: '2026-01-01',
      udate: '2026-01-01',
    },
  })

  return {
    client,
    contacts,
    links,
    service: new ActiveCampaignTagsService(transport, contacts),
  }
}

test('concurrent apply replay races after the provider read and writes twice', async () => {
  const { client, service } = harness(true)

  await Promise.all([
    service.addTag('student@example.test', 'COURSE - Active'),
    service.addTag('student@example.test', 'COURSE - Active'),
  ])

  expect(client.post).toHaveBeenCalledTimes(2)
})

test('provider delete failure is reported as false and remains retryable', async () => {
  const { client, service, links } = harness()
  links.push({ id: 'link-1', tag: 'tag-1' })
  jest.mocked(client.delete).mockRejectedValueOnce(new Error('provider unavailable'))

  await expect(service.removeTag('student@example.test', 'COURSE - Active')).resolves.toBe(false)
  expect(client.delete).toHaveBeenCalledTimes(1)
})

test('concurrent remove replay races after the provider read and deletes twice', async () => {
  const { client, service, links } = harness(true)
  links.push({ id: 'link-1', tag: 'tag-1' })

  await Promise.all([
    service.removeTag('student@example.test', 'COURSE - Active'),
    service.removeTag('student@example.test', 'COURSE - Active'),
  ])

  expect(client.delete).toHaveBeenCalledTimes(2)
})

test('concurrent product contact sync races between GET and CREATE', async () => {
  const contacts: Array<{ id: string; email: string }> = []
  let contactReads = 0
  let releaseInitialReads: () => void = () => undefined
  const initialReads = new Promise<void>((resolve) => {
    releaseInitialReads = resolve
  })
  let releaseSecondReads: () => void = () => undefined
  const secondReads = new Promise<void>((resolve) => {
    releaseSecondReads = resolve
  })
  const client = {
    get: jest.fn(async (path: string) => {
      if (path !== '/api/3/contacts') throw new Error(`Unexpected GET ${path}`)
      contactReads += 1
      if (contactReads === 2) releaseInitialReads()
      if (contactReads === 4) releaseSecondReads()
      await (contactReads <= 2 ? initialReads : secondReads)
      return { data: { contacts: [...contacts] } }
    }),
    post: jest.fn(async () => {
      const contact = { id: `contact-${contacts.length + 1}`, email: 'student@example.test' }
      contacts.push(contact)
      return {
        data: {
          contact: {
            ...contact,
            firstName: 'Student',
            lastName: 'Example',
            cdate: '2026-01-01',
            udate: '2026-01-01',
          },
        },
      }
    }),
  }
  const transport = new ActiveCampaignTransport({
    readIntegration: () => ({
      apiUrl: 'https://activecampaign.invalid',
      apiKey: 'offline-key',
      webhookSecret: 'offline-secret',
      debugEnabled: false,
      verifyDeleteEnabled: false,
      lists: {},
    }),
    sleep: async () => undefined,
  })
  jest.spyOn(transport, 'checkRateLimit').mockResolvedValue(undefined)
  Object.defineProperty(transport, 'client', {
    configurable: true,
    get: () => client,
  })
  const service = new ActiveCampaignContactsService(transport)

  await Promise.all([
    service.findOrCreateContact('student@example.test'),
    service.findOrCreateContact('student@example.test'),
  ])

  expect(client.post).toHaveBeenCalledTimes(2)
})
