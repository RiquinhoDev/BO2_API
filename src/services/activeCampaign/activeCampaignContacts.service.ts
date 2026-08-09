import type { ACContact, ACContactApi, ACContactResponse, ACContactsResponse } from '../../types/activecampaign.types'
import { User } from '../../models'
import logger from '../../utils/logger'
import { ActiveCampaignTransport } from './activeCampaignTransport'

interface ContactIdCache {
  find(userId: string): Promise<string | null>
  store(userId: string, contactId: string): Promise<void>
}

interface ACFieldValueResponse {
  field: string | number
  value?: string | null
}

interface ACFieldValuesResponse {
  fieldValues?: ACFieldValueResponse[]
}

const mongooseContactIdCache: ContactIdCache = {
  async find(userId) {
    const user = await User.findById(userId).select('metadata.activeCampaignId')
    return user?.metadata?.activeCampaignId ?? null
  },
  async store(userId, contactId) {
    await User.findByIdAndUpdate(userId, {
      $set: { 'metadata.activeCampaignId': contactId },
    })
  },
}

export class ActiveCampaignContactsService {
  constructor(
    private readonly transport: ActiveCampaignTransport,
    private readonly contactIdCache: ContactIdCache = mongooseContactIdCache,
  ) {}

  async getContactByEmail(email: string): Promise<ACContactResponse | null> {
    this.transport.ensureAvailable()
    await this.transport.checkRateLimit()
    try {
      const response = await this.transport.retryRequest(() =>
        this.transport.client.get<ACContactsResponse>('/api/3/contacts', {
          params: { email },
          headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
        }),
      )
      const first = response.data.contacts?.[0]
      return first ? { contact: first } : null
    } catch (error) {
      this.transport.rethrowIntegrationUnavailable(error)
      logger.error(`Erro ao buscar contacto ${email}: ${this.transport.formatError(error)}`)
      throw error
    }
  }

  async getAllContacts(): Promise<ACContactApi[]> {
    this.transport.ensureAvailable()
    const contacts: ACContactApi[] = []
    const limit = 100
    let offset = 0
    while (true) {
      await this.transport.checkRateLimit()
      const response = await this.transport.retryRequest(() =>
        this.transport.client.get<ACContactsResponse>('/api/3/contacts', {
          params: { limit, offset },
        }),
      )
      const page = response.data.contacts || []
      contacts.push(...page)
      if (page.length < limit) return contacts
      offset += limit
    }
  }

  async createOrUpdateContact(contact: ACContact): Promise<ACContactResponse> {
    this.transport.ensureAvailable()
    await this.transport.checkRateLimit()
    try {
      const existing = await this.getContactByEmail(contact.email)
      return await this.transport.retryRequest(async () => {
        if (existing) {
          const response = await this.transport.client.put<ACContactResponse>(
            `/api/3/contacts/${existing.contact.id}`,
            { contact },
          )
          return response.data
        }
        const response = await this.transport.client.post<ACContactResponse>(
          '/api/3/contacts',
          { contact },
        )
        return response.data
      })
    } catch (error) {
      this.transport.rethrowIntegrationUnavailable(error)
      logger.error(`Erro ao criar/atualizar contacto ${contact.email}: ${this.transport.formatError(error)}`)
      throw error
    }
  }

  async findOrCreateContact(email: string, name?: string): Promise<ACContactApi> {
    this.transport.ensureAvailable()
    const existing = await this.getContactByEmail(email)
    if (existing?.contact) return existing.contact
    const parts = (name || '').trim().split(/\s+/).filter(Boolean)
    const firstName = parts[0] || ''
    const lastName = parts.slice(1).join(' ') || ''
    const created = await this.createOrUpdateContact({
      email,
      ...(firstName ? { firstName } : {}),
      ...(lastName ? { lastName } : {}),
    })
    return created.contact
  }

  async getContactId(email: string, userId?: string): Promise<string | null> {
    this.transport.ensureAvailable()
    try {
      if (userId) {
        const cachedId = await this.contactIdCache.find(userId)
        if (cachedId) return cachedId
      }
      const contact = await this.getContactByEmail(email)
      if (!contact) return null
      const contactId = contact.contact.id
      if (userId && contactId) await this.contactIdCache.store(userId, contactId)
      return contactId
    } catch (error) {
      this.transport.rethrowIntegrationUnavailable(error)
      logger.error(`Erro ao buscar contactId para ${email}: ${this.transport.formatError(error)}`)
      return null
    }
  }

  async getContactFieldValue(
    email: string,
    fieldId: number,
  ): Promise<{ contactId: string; value: string | null } | null> {
    this.transport.ensureAvailable()
    await this.transport.checkRateLimit()
    try {
      const contact = await this.getContactByEmail(email)
      if (!contact) return null
      const contactId = contact.contact.id
      const response = await this.transport.retryRequest(() =>
        this.transport.client.get<ACFieldValuesResponse>(`/api/3/contacts/${contactId}/fieldValues`),
      )
      const match = (response.data.fieldValues || [])
        .find((field) => String(field.field) === String(fieldId))
      return { contactId, value: match?.value ?? null }
    } catch (error) {
      this.transport.rethrowIntegrationUnavailable(error)
      logger.error(`Erro ao ler field ${fieldId} de ${email}: ${this.transport.formatError(error)}`)
      throw error
    }
  }

  async updateContactField(email: string, fieldId: number, value: string): Promise<boolean> {
    this.transport.ensureAvailable()
    await this.transport.checkRateLimit()
    try {
      const contact = await this.getContactByEmail(email)
      if (!contact) {
        logger.warn(`Contacto ${email} não existe; custom field não criado`)
        return false
      }
      await this.transport.retryRequest(() =>
        this.transport.client.post('/api/3/fieldValues', {
          fieldValue: { contact: contact.contact.id, field: String(fieldId), value },
        }),
      )
      return true
    } catch (error) {
      this.transport.rethrowIntegrationUnavailable(error)
      logger.error(`Erro ao escrever field ${fieldId} de ${email}: ${this.transport.formatError(error)}`)
      throw error
    }
  }
}
